import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { createPool, migrate } from "./db.js";
import { createMailer } from "./mail.js";

const env = process.env;
const production = env.NODE_ENV === "production";

let jwtSecret = env.JWT_SECRET;
if (!jwtSecret) {
  if (production) throw new Error("JWT_SECRET must be set in production");
  jwtSecret = crypto.randomBytes(32).toString("hex");
  console.warn("JWT_SECRET not set: using a temporary one (everyone is logged out whenever the server restarts).");
}

const mailer = createMailer(env);
// Signup codes need a working mailbox, so verification turns on with SMTP_URL.
// (REQUIRE_EMAIL_VERIFICATION=true forces it on and prints codes to the log: handy for local testing.)
const verificationRequired = mailer.enabled || env.REQUIRE_EMAIL_VERIFICATION === "true";

const port = Number(env.PORT || 8080);
const appUrl = (req) => (env.APP_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
const staticDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../dist");

const pool = createPool();
await migrate(pool);

const server = createApp({ pool, jwtSecret, mailer, verificationRequired, appUrl, staticDir }).listen(port, "0.0.0.0", () =>
  console.log(`Cadence listening on :${port} (email verification ${verificationRequired ? "on" : "off"})`)
);

// Cloud Run sends SIGTERM before stopping an instance: finish in-flight requests first.
process.on("SIGTERM", () => server.close(() => pool.end().then(() => process.exit(0))));
