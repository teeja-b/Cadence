import crypto from "node:crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { HttpError, bad } from "./http.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_TTL = "15 minutes";
const RESET_TTL = "1 hour";
const MAX_OTP_ATTEMPTS = 5;
// Compared against when the email is unknown, so login timing doesn't reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

const normEmail = (e) => String(e ?? "").trim().toLowerCase();
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const same = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

const publicUser = (u) => ({
  id: u.id,
  email: u.email,
  full_name: u.full_name,
  role: u.role,
  created_date: u.created_date,
});

function checkPassword(password) {
  if (typeof password !== "string" || password.length < 8) bad("Password must be at least 8 characters");
  if (password.length > 128) bad("Password is too long");
}

export function createAuth({ pool, jwtSecret, mailer, verificationRequired, appUrl }) {
  const sign = (user) => jwt.sign({ sub: user.id }, jwtSecret, { algorithm: "HS256", expiresIn: "30d" });
  const session = (user) => ({ access_token: sign(user), user: publicUser(user) });

  async function issueOtp(user) {
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    await pool.query(
      `UPDATE users SET otp_hash = $2, otp_expires_at = now() + interval '${OTP_TTL}', otp_attempts = 0 WHERE id = $1`,
      [user.id, sha(code)]
    );
    await mailer.send({
      to: user.email,
      subject: "Your Cadence verification code",
      text: `Your verification code is ${code}. It expires in 15 minutes.`,
    });
  }

  // Express middleware: requires "Authorization: Bearer <token>" and sets req.user.
  async function requireAuth(req, res, next) {
    const m = /^Bearer (.+)$/i.exec(req.get("authorization") || "");
    if (!m) throw new HttpError(401, "Authentication required");
    let payload;
    try {
      payload = jwt.verify(m[1], jwtSecret, { algorithms: ["HS256"] });
    } catch {
      throw new HttpError(401, "Your session has expired. Please log in again.");
    }
    const { rows } = await pool.query(
      "SELECT id, email, full_name, role, created_date, password_changed_at FROM users WHERE id = $1",
      [payload.sub]
    );
    const user = rows[0];
    // A password change/reset signs out every older session.
    if (!user || payload.iat < Math.floor(user.password_changed_at.getTime() / 1000)) {
      throw new HttpError(401, "Your session has expired. Please log in again.");
    }
    req.user = user;
    next();
  }

  const router = Router();

  router.post("/register", async (req, res) => {
    const email = normEmail(req.body?.email);
    const password = req.body?.password;
    if (!EMAIL_RE.test(email) || email.length > 254) bad("Please enter a valid email address");
    checkPassword(password);
    const hash = await bcrypt.hash(password, 10);

    const existing = (await pool.query("SELECT id, email_verified FROM users WHERE email = $1", [email])).rows[0];
    if (existing?.email_verified) throw new HttpError(409, "An account with this email already exists. Try logging in.");

    let user;
    if (existing) {
      // Earlier signup that was never verified: take the new password and send a fresh code.
      user = (await pool.query("UPDATE users SET password_hash = $2, password_changed_at = now() WHERE id = $1 RETURNING *", [existing.id, hash])).rows[0];
    } else {
      try {
        user = (await pool.query(
          "INSERT INTO users (email, password_hash, email_verified) VALUES ($1, $2, $3) RETURNING *",
          [email, hash, !verificationRequired]
        )).rows[0];
      } catch (err) {
        if (err.code === "23505") throw new HttpError(409, "An account with this email already exists. Try logging in.");
        throw err;
      }
    }

    if (!verificationRequired) return res.status(201).json(session(user));
    await issueOtp(user);
    res.status(201).json({ verification_required: true });
  });

  router.post("/verify-otp", async (req, res) => {
    const email = normEmail(req.body?.email);
    const code = String(req.body?.code ?? "").trim();
    const user = (await pool.query("SELECT * FROM users WHERE email = $1", [email])).rows[0];
    if (!user || !user.otp_hash || !user.otp_expires_at || user.otp_expires_at < new Date()) {
      bad("This code is invalid or has expired. Request a new one.");
    }
    if (user.otp_attempts >= MAX_OTP_ATTEMPTS) bad("Too many wrong attempts. Request a new code.");
    if (!same(sha(code), user.otp_hash)) {
      await pool.query("UPDATE users SET otp_attempts = otp_attempts + 1 WHERE id = $1", [user.id]);
      bad("Invalid verification code");
    }
    const verified = (await pool.query(
      "UPDATE users SET email_verified = true, otp_hash = NULL, otp_expires_at = NULL, otp_attempts = 0 WHERE id = $1 RETURNING *",
      [user.id]
    )).rows[0];
    res.json(session(verified));
  });

  router.post("/resend-otp", async (req, res) => {
    const user = (await pool.query("SELECT * FROM users WHERE email = $1", [normEmail(req.body?.email)])).rows[0];
    if (verificationRequired && user && !user.email_verified) await issueOtp(user);
    res.json({ ok: true }); // same answer whether or not the email exists
  });

  router.post("/login", async (req, res) => {
    const email = normEmail(req.body?.email);
    const password = String(req.body?.password ?? "");
    const user = (await pool.query("SELECT * FROM users WHERE email = $1", [email])).rows[0];
    const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !ok) throw new HttpError(401, "Invalid email or password");
    if (verificationRequired && !user.email_verified) {
      throw new HttpError(403, "Please verify your email first. Sign up again with the same email to get a new code.");
    }
    res.json(session(user));
  });

  router.get("/me", requireAuth, (req, res) => res.json(publicUser(req.user)));

  router.post("/reset-password-request", async (req, res) => {
    const user = (await pool.query("SELECT * FROM users WHERE email = $1", [normEmail(req.body?.email)])).rows[0];
    if (user) {
      const token = crypto.randomBytes(32).toString("hex");
      await pool.query(
        `UPDATE users SET reset_hash = $2, reset_expires_at = now() + interval '${RESET_TTL}' WHERE id = $1`,
        [user.id, sha(token)]
      );
      try {
        await mailer.send({
          to: user.email,
          subject: "Reset your Cadence password",
          text: `Use this link to choose a new password (valid for 1 hour):\n\n${appUrl(req)}/reset-password?token=${token}\n\nIf you didn't ask for this, you can ignore this email.`,
        });
      } catch (err) {
        console.error("Failed to send reset email:", err); // don't reveal it to the caller
      }
    }
    res.json({ ok: true }); // same answer whether or not the email exists
  });

  router.post("/reset-password", async (req, res) => {
    const token = String(req.body?.token ?? "");
    checkPassword(req.body?.password);
    const hash = await bcrypt.hash(req.body.password, 10);
    const { rowCount } = await pool.query(
      `UPDATE users
          SET password_hash = $2, password_changed_at = now(), email_verified = true,
              reset_hash = NULL, reset_expires_at = NULL, otp_hash = NULL, otp_expires_at = NULL
        WHERE reset_hash = $1 AND reset_expires_at > now()`,
      [sha(token), hash]
    );
    if (!rowCount) bad("This reset link is invalid or has expired. Request a new one.");
    res.json({ ok: true });
  });

  return { router, requireAuth };
}
