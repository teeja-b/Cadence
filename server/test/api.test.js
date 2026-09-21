// Run with:  TEST_DATABASE_URL=postgres://user:pass@localhost:5432/dbname npm run test:server
// (use a throwaway database: the tests create users and tasks in it)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { createApp } from "../src/app.js";
import { migrate } from "../src/db.js";

const URL_ = process.env.TEST_DATABASE_URL;
const skip = !URL_ && "set TEST_DATABASE_URL to run the API tests";
const SECRET = "test-secret";
const run = Date.now();
let n = 0;
const uniqueEmail = () => `user${++n}-${run}@example.com`;

const outbox = [];
const mailer = { enabled: true, send: async (m) => void outbox.push(m) };

async function start({ verificationRequired = false, staticDir } = {}) {
  const pool = new pg.Pool({ connectionString: URL_, max: 4 });
  await migrate(pool);
  const app = createApp({ pool, jwtSecret: SECRET, mailer, verificationRequired, appUrl: () => "http://app.test", staticDir });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, p, body, token) => {
    const res = await fetch(base + p, {
      method,
      headers: { ...(body !== undefined && { "Content-Type": "application/json" }), ...(token && { Authorization: `Bearer ${token}` }) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, body: json, text };
  };
  return { call, pool, close: async () => { await new Promise((r) => server.close(r)); await pool.end(); } };
}

async function signup(call) {
  const email = uniqueEmail();
  const r = await call("POST", "/api/auth/register", { email, password: "correct horse" });
  assert.equal(r.status, 201);
  return { email, token: r.body.access_token };
}

test("accounts: register, login, me, duplicates", { skip }, async () => {
  const s = await start();
  try {
    const email = uniqueEmail();
    const reg = await s.call("POST", "/api/auth/register", { email: email.toUpperCase(), password: "correct horse" });
    assert.equal(reg.status, 201);
    assert.ok(reg.body.access_token);
    assert.equal(reg.body.user.email, email); // stored lowercase
    assert.equal(reg.body.user.password_hash, undefined);

    assert.equal((await s.call("POST", "/api/auth/register", { email, password: "another pass" })).status, 409);
    assert.equal((await s.call("POST", "/api/auth/register", { email: "nope", password: "correct horse" })).status, 400);
    assert.equal((await s.call("POST", "/api/auth/register", { email: uniqueEmail(), password: "short" })).status, 400);

    assert.equal((await s.call("POST", "/api/auth/login", { email, password: "wrong" })).status, 401);
    assert.equal((await s.call("POST", "/api/auth/login", { email: "ghost@example.com", password: "whatever1" })).status, 401);
    const login = await s.call("POST", "/api/auth/login", { email, password: "correct horse" });
    assert.equal(login.status, 200);

    const me = await s.call("GET", "/api/auth/me", undefined, login.body.access_token);
    assert.equal(me.body.email, email);
    assert.equal(me.body.role, "user");
    assert.equal((await s.call("GET", "/api/auth/me")).status, 401);
    assert.equal((await s.call("GET", "/api/auth/me", undefined, "garbage")).status, 401);
  } finally { await s.close(); }
});

test("tasks: create/edit/nest/notes/times/progress/status, all persisted", { skip }, async () => {
  const s = await start();
  try {
    const { token } = await signup(s.call);
    const T = (m, p, b) => s.call(m, `/api/tasks${p}`, b, token);

    const root = (await T("POST", "", {
      title: "  Launch plan  ", description: "line1\nline2", category: "project", status: "in_progress",
      progress: 40, start_date: "2026-09-22", start_time: "09:00", end_time: "10:30",
    })).body;
    assert.equal(root.title, "Launch plan");
    assert.equal(root.start_date, "2026-09-22"); // a plain string, not a Date
    assert.equal(root.parent_id, null);
    assert.equal(root.progress, 40);

    // Unlimited nesting: 8 levels deep
    let parent = root, chain = [root];
    for (let i = 1; i <= 8; i++) {
      const c = await T("POST", "", { title: `level ${i}`, parent_id: parent.id });
      assert.equal(c.status, 201);
      assert.equal(c.body.parent_id, parent.id);
      chain.push(c.body); parent = c.body;
    }

    // Subtasks append in order
    const s1 = (await T("POST", "", { title: "sib A", parent_id: root.id })).body;
    const s2 = (await T("POST", "", { title: "sib B", parent_id: root.id })).body;
    assert.ok(s2.sort_order > s1.sort_order);

    // Partial edit keeps every other field
    const upd = await T("PUT", `/${root.id}`, { description: "edited notes", progress: 75, status: "on_hold" });
    assert.equal(upd.status, 200);
    assert.equal(upd.body.description, "edited notes");
    assert.equal(upd.body.progress, 75);
    assert.equal(upd.body.status, "on_hold");
    assert.equal(upd.body.title, "Launch plan");
    assert.equal(upd.body.start_time, "09:00");
    assert.equal(upd.body.category, "project");

    // Clearing the schedule
    const cleared = await T("PUT", `/${root.id}`, { start_date: null, end_time: "" });
    assert.equal(cleared.body.start_date, null);
    assert.equal(cleared.body.end_time, null);
    await T("PUT", `/${root.id}`, { start_date: "2026-09-22", end_time: "10:30" });

    // Reorder (bulk)
    const bulk = await T("PUT", "/bulk", [{ id: s1.id, sort_order: 1 }, { id: s2.id, sort_order: 0 }]);
    assert.equal(bulk.status, 200);

    // Single list gives everything (Timeline + Calendar + Details all read this)
    const list = (await T("GET", "?sort=-created_date&limit=500")).body;
    assert.equal(list.length, 11);
    assert.equal(list.find((t) => t.id === s2.id).sort_order, 0);
    assert.equal(list.find((t) => t.id === root.id).description, "edited notes");
    const one = (await T("GET", `/${chain[4].id}`)).body;
    assert.equal(one.parent_id, chain[3].id);

    // Deleting a task removes every descendant, however deep
    const del = await T("POST", "/delete-many", { ids: [root.id] });
    assert.equal(del.body.deleted, 1);
    assert.equal((await T("GET", "")).body.length, 0);
    assert.equal((await T("GET", `/${chain[8].id}`)).status, 404);
  } finally { await s.close(); }
});

test("tasks: validation", { skip }, async () => {
  const s = await start();
  try {
    const { token } = await signup(s.call);
    const T = (m, p, b) => s.call(m, `/api/tasks${p}`, b, token);
    assert.equal((await T("POST", "", {})).status, 400);
    assert.equal((await T("POST", "", { title: "   " })).status, 400);
    assert.equal((await T("POST", "", { title: "x", status: "done" })).status, 400);
    assert.equal((await T("POST", "", { title: "x", category: "nope" })).status, 400);
    assert.equal((await T("POST", "", { title: "x", start_date: "2026-02-31" })).status, 400);
    assert.equal((await T("POST", "", { title: "x", start_date: "tomorrow" })).status, 400);
    assert.equal((await T("POST", "", { title: "x", start_time: "25:00" })).status, 400);
    assert.equal((await T("POST", "", { title: "x", parent_id: "not-a-uuid" })).status, 400);
    assert.equal((await T("POST", "", { title: "x", parent_id: "00000000-0000-4000-8000-000000000000" })).status, 400);
    assert.equal((await T("GET", "?sort=password_hash")).status, 400);
    assert.equal((await T("GET", "/not-a-uuid")).status, 404);
    assert.equal((await T("PUT", "/00000000-0000-4000-8000-000000000000", { title: "y" })).status, 404);
    assert.equal((await T("POST", "/delete-many", { ids: ["x"] })).status, 400);
    // progress is clamped, unknown fields are ignored (can't smuggle in user_id)
    const t = (await T("POST", "", { title: "ok", progress: 900, user_id: "00000000-0000-4000-8000-000000000000" })).body;
    assert.equal(t.progress, 100);
    // whole bulk call rolls back if one item is bad
    const a = (await T("POST", "", { title: "a" })).body;
    const bulk = await T("PUT", "/bulk", [{ id: a.id, title: "changed" }, { id: "00000000-0000-4000-8000-000000000000", title: "z" }]);
    assert.equal(bulk.status, 404);
    assert.equal((await T("GET", `/${a.id}`)).body.title, "a");
  } finally { await s.close(); }
});

test("users only ever see and change their own tasks", { skip }, async () => {
  const s = await start();
  try {
    const A = await signup(s.call);
    const B = await signup(s.call);
    const mine = (await s.call("POST", "/api/tasks", { title: "A's private task" }, A.token)).body;

    assert.deepEqual((await s.call("GET", "/api/tasks", undefined, B.token)).body, []);
    assert.equal((await s.call("GET", `/api/tasks/${mine.id}`, undefined, B.token)).status, 404);
    assert.equal((await s.call("PUT", `/api/tasks/${mine.id}`, { title: "hacked" }, B.token)).status, 404);
    assert.equal((await s.call("DELETE", `/api/tasks/${mine.id}`, undefined, B.token)).status, 404);
    assert.equal((await s.call("POST", "/api/tasks/delete-many", { ids: [mine.id] }, B.token)).body.deleted, 0);
    assert.equal((await s.call("POST", "/api/tasks", { title: "sneaky", parent_id: mine.id }, B.token)).status, 400);

    const still = (await s.call("GET", `/api/tasks/${mine.id}`, undefined, A.token)).body;
    assert.equal(still.title, "A's private task");
    assert.equal((await s.call("GET", "/api/tasks")).status, 401); // no token
  } finally { await s.close(); }
});

test("data survives a server restart (new process, same database)", { skip }, async () => {
  const first = await start();
  const { email, token } = await signup(first.call);
  const t = (await first.call("POST", "/api/tasks", { title: "still here", description: "notes", start_date: "2026-10-01", start_time: "08:15", end_time: "09:00", progress: 25 }, token)).body;
  await first.close();

  const second = await start();
  try {
    const list = (await second.call("GET", "/api/tasks", undefined, token)).body; // same token still valid
    assert.equal(list.length, 1);
    assert.deepEqual(
      { id: list[0].id, title: list[0].title, description: list[0].description, start_date: list[0].start_date, start_time: list[0].start_time, end_time: list[0].end_time, progress: list[0].progress },
      { id: t.id, title: "still here", description: "notes", start_date: "2026-10-01", start_time: "08:15", end_time: "09:00", progress: 25 }
    );
    const relogin = await second.call("POST", "/api/auth/login", { email, password: "correct horse" });
    assert.equal((await second.call("GET", "/api/tasks", undefined, relogin.body.access_token)).body.length, 1);
  } finally { await second.close(); }
});

test("email verification code flow", { skip }, async () => {
  const s = await start({ verificationRequired: true });
  try {
    outbox.length = 0;
    const email = uniqueEmail();
    const reg = await s.call("POST", "/api/auth/register", { email, password: "correct horse" });
    assert.equal(reg.status, 201);
    assert.equal(reg.body.verification_required, true);
    assert.equal(reg.body.access_token, undefined);
    const code = /code is (\d{6})/.exec(outbox.at(-1).text)[1];

    assert.equal((await s.call("POST", "/api/auth/login", { email, password: "correct horse" })).status, 403); // not verified yet
    const wrong = code === "000000" ? "111111" : "000000";
    assert.equal((await s.call("POST", "/api/auth/verify-otp", { email, code: wrong })).status, 400);

    const ok = await s.call("POST", "/api/auth/verify-otp", { email, code });
    assert.equal(ok.status, 200);
    assert.ok(ok.body.access_token);
    assert.equal((await s.call("GET", "/api/auth/me", undefined, ok.body.access_token)).body.email, email);
    assert.equal((await s.call("POST", "/api/auth/verify-otp", { email, code })).status, 400); // single use
    assert.equal((await s.call("POST", "/api/auth/login", { email, password: "correct horse" })).status, 200);
    assert.equal((await s.call("POST", "/api/auth/register", { email, password: "correct horse" })).status, 409);

    // too many wrong guesses locks the code
    const e2 = uniqueEmail();
    await s.call("POST", "/api/auth/register", { email: e2, password: "correct horse" });
    const real = /code is (\d{6})/.exec(outbox.at(-1).text)[1];
    const bad = real === "123456" ? "654321" : "123456";
    for (let i = 0; i < 5; i++) await s.call("POST", "/api/auth/verify-otp", { email: e2, code: bad });
    assert.equal((await s.call("POST", "/api/auth/verify-otp", { email: e2, code: real })).status, 400);
    // ...until a fresh one is requested
    await s.call("POST", "/api/auth/resend-otp", { email: e2 });
    const fresh = /code is (\d{6})/.exec(outbox.at(-1).text)[1];
    assert.equal((await s.call("POST", "/api/auth/verify-otp", { email: e2, code: fresh })).status, 200);
    // resend for an unknown email answers the same and sends nothing
    const before = outbox.length;
    assert.equal((await s.call("POST", "/api/auth/resend-otp", { email: "nobody@example.com" })).status, 200);
    assert.equal(outbox.length, before);
  } finally { await s.close(); }
});

test("password reset", { skip }, async () => {
  const s = await start();
  try {
    outbox.length = 0;
    const { email, token: oldToken } = await signup(s.call);
    assert.equal((await s.call("POST", "/api/auth/reset-password-request", { email: "nobody@example.com" })).status, 200);
    assert.equal(outbox.length, 0);

    assert.equal((await s.call("POST", "/api/auth/reset-password-request", { email })).status, 200);
    const link = /(http:\/\/app\.test\/reset-password\?token=([0-9a-f]+))/.exec(outbox.at(-1).text);
    assert.ok(link, "reset email contains a link");
    const resetToken = link[2];

    assert.equal((await s.call("POST", "/api/auth/reset-password", { token: "0".repeat(64), password: "brand new pass" })).status, 400);
    assert.equal((await s.call("POST", "/api/auth/reset-password", { token: resetToken, password: "short" })).status, 400);
    await new Promise((r) => setTimeout(r, 1100)); // sessions are compared at 1-second resolution
    assert.equal((await s.call("POST", "/api/auth/reset-password", { token: resetToken, password: "brand new pass" })).status, 200);
    assert.equal((await s.call("POST", "/api/auth/reset-password", { token: resetToken, password: "another new pass" })).status, 400); // single use

    assert.equal((await s.call("POST", "/api/auth/login", { email, password: "correct horse" })).status, 401);
    const login = await s.call("POST", "/api/auth/login", { email, password: "brand new pass" });
    assert.equal(login.status, 200);
    assert.equal((await s.call("GET", "/api/auth/me", undefined, login.body.access_token)).status, 200);
    assert.equal((await s.call("GET", "/api/auth/me", undefined, oldToken)).status, 401); // old sessions are signed out
  } finally { await s.close(); }
});

test("serves the frontend build with SPA fallback, API errors stay JSON", { skip }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dist-"));
  fs.mkdirSync(path.join(dir, "assets"));
  fs.writeFileSync(path.join(dir, "index.html"), "<!doctype html><title>Cadence</title>");
  fs.writeFileSync(path.join(dir, "assets", "app.js"), "console.log(1)");
  const s = await start({ staticDir: dir });
  try {
    const home = await s.call("GET", "/calendar");
    assert.equal(home.status, 200);
    assert.match(home.text, /Cadence/);
    assert.match((await s.call("GET", "/task/abc-123")).text, /Cadence/);
    assert.equal((await s.call("GET", "/assets/app.js")).text, "console.log(1)");
    assert.equal((await s.call("GET", "/assets/missing.js")).status, 404);
    const api404 = await s.call("GET", "/api/nope");
    assert.equal(api404.status, 404);
    assert.equal(api404.body.message, "Not found");
    assert.equal((await s.call("GET", "/api/health")).body.ok, true);
  } finally { await s.close(); }
});
