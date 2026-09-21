// API client for our own backend (server/). It exposes the same shape the pages
// already use (`db.auth.*`, `db.entities.Task.*`), so the pages didn't need rewriting.
import { TOKEN_KEY } from "@/lib/app-params";
import { safeReturnTo } from "@/lib/authReturnTo";

const getToken = () => {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
};
const setToken = (t) => {
  try { localStorage.setItem(TOKEN_KEY, t); } catch { /* storage unavailable */ }
};
const clearToken = () => {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ }
};

async function request(path, { method = "GET", body } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }

  if (!res.ok) {
    const err = new Error(data?.message || res.statusText || "Request failed");
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

const AUTH_PAGES = ["/login", "/register", "/forgot-password", "/reset-password"];

const auth = {
  async isAuthenticated() {
    try { await auth.me(); return true; } catch { return false; }
  },

  async me() {
    try {
      return await request("/auth/me");
    } catch (err) {
      if (err.status === 401) clearToken(); // expired/invalid session
      throw err;
    }
  },

  async loginViaEmailPassword(email, password) {
    const data = await request("/auth/login", { method: "POST", body: { email, password } });
    setToken(data.access_token);
    return data;
  },

  async register({ email, password }) {
    const data = await request("/auth/register", { method: "POST", body: { email, password } });
    if (data?.access_token) {
      // Email verification is switched off on the server: the account is ready, so sign in.
      setToken(data.access_token);
      window.location.href = safeReturnTo();
      return new Promise(() => {}); // keep the form in its loading state while the page reloads
    }
    return data;
  },

  verifyOtp({ email, otpCode }) {
    return request("/auth/verify-otp", { method: "POST", body: { email, code: otpCode } });
  },

  resendOtp(email) {
    return request("/auth/resend-otp", { method: "POST", body: { email } });
  },

  resetPasswordRequest(email) {
    return request("/auth/reset-password-request", { method: "POST", body: { email } });
  },

  resetPassword({ resetToken, newPassword }) {
    return request("/auth/reset-password", { method: "POST", body: { token: resetToken, password: newPassword } });
  },

  setToken,

  logout(redirectUrl) {
    clearToken();
    if (redirectUrl) window.location.href = "/login";
  },

  redirectToLogin(returnUrl) {
    if (AUTH_PAGES.includes(window.location.pathname)) return;
    let to = "/login";
    try {
      const u = new URL(returnUrl || window.location.href, window.location.origin);
      const path = u.pathname + u.search;
      if (u.origin === window.location.origin && path !== "/") to += `?returnTo=${encodeURIComponent(path)}`;
    } catch { /* fall back to plain /login */ }
    window.location.href = to;
  },

  loginWithProvider() {
    window.alert("Google sign-in isn't set up on this server. Please use your email and password.");
  },
};

// Tiny in-page event bus so Timeline / Calendar / Task details refresh after any change.
const listeners = new Set();
const notify = () => listeners.forEach((fn) => { try { fn(); } catch { /* ignore */ } });

const Task = {
  // The pages ask for 500; the server allows far more, so always request the maximum
  // (otherwise a user with lots of nested subtasks would silently lose the newest ones).
  list: (sort = "-created_date") => request(`/tasks?sort=${encodeURIComponent(sort)}&limit=5000`),

  async get(id) {
    try {
      return await request(`/tasks/${encodeURIComponent(id)}`);
    } catch (err) {
      if (err.status === 404) return null;
      throw err;
    }
  },

  async create(data) {
    const t = await request("/tasks", { method: "POST", body: data });
    notify();
    return t;
  },

  async update(id, data) {
    const t = await request(`/tasks/${encodeURIComponent(id)}`, { method: "PUT", body: data });
    notify();
    return t;
  },

  async bulkUpdate(items) {
    const r = await request("/tasks/bulk", { method: "PUT", body: items });
    notify();
    return r;
  },

  // Called as deleteMany({ id: { $in: [...] } }) by TaskDetails.
  async deleteMany(query) {
    const ids = query?.id?.$in ?? [];
    const r = await request("/tasks/delete-many", { method: "POST", body: { ids } });
    notify();
    return r;
  },

  subscribe(cb) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
};

const app = {
  // Nothing to fetch: there's no hosted-platform settings endpoint any more.
  getPublicSettings: async () => ({ id: "cadence", public_settings: {} }),
};

export const db = { auth, app, entities: { Task } };
export default db;
