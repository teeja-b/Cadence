import pg from "pg";
import { parse } from "pg-connection-string";

// Return DATE columns as plain "YYYY-MM-DD" strings (not JS Dates): that's what the frontend expects.
pg.types.setTypeParser(1082, (v) => v);

const isLocal = (host) => !host || host.startsWith("/") || ["localhost", "127.0.0.1", "::1"].includes(host);

// Turns DATABASE_URL into pool settings.
//
// SSL: any non-local host (Supabase, Neon, ...) gets an encrypted connection automatically.
// We set it ourselves instead of using "?sslmode=require" in the URL, because node-postgres
// treats that as full certificate verification, which fails against Supabase's private CA.
//   - default:            encrypted, server certificate not verified
//   - DATABASE_CA_CERT:   encrypted AND verified against this certificate (PEM text)
//   - DATABASE_SSL=false: never use SSL   |   DATABASE_SSL=true: always use SSL
export function poolConfig(env = process.env) {
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const { host, port, user, password, database } = parse(env.DATABASE_URL);
  let ssl = false;
  if (env.DATABASE_SSL === "true" || (env.DATABASE_SSL !== "false" && !isLocal(host))) {
    ssl = env.DATABASE_CA_CERT ? { ca: env.DATABASE_CA_CERT } : { rejectUnauthorized: false };
  }
  return {
    host,
    port: port ? Number(port) : undefined,
    user,
    password,
    database,
    ssl,
    max: Number(env.DB_POOL_MAX || 5),
    connectionTimeoutMillis: 10_000, // fail fast (e.g. database paused) instead of hanging the request
  };
}

export function createPool(env = process.env) {
  const pool = new pg.Pool(poolConfig(env));
  // A pooler or database restart drops idle connections. Without this handler that would crash the server.
  pool.on("error", (err) => console.error("Idle database connection error:", err.message));
  return pool;
}

// Idempotent: safe to run on every start.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email               text NOT NULL,
  password_hash       text NOT NULL,
  full_name           text,
  role                text NOT NULL DEFAULT 'user',
  email_verified      boolean NOT NULL DEFAULT false,
  otp_hash            text,
  otp_expires_at      timestamptz,
  otp_attempts        integer NOT NULL DEFAULT 0,
  reset_hash          text,
  reset_expires_at    timestamptz,
  password_changed_at timestamptz NOT NULL DEFAULT now(),
  created_date        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (email);

CREATE TABLE IF NOT EXISTS tasks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id    uuid REFERENCES tasks(id) ON DELETE CASCADE,
  title        text NOT NULL,
  description  text NOT NULL DEFAULT '',
  category     text NOT NULL DEFAULT 'personal',
  status       text NOT NULL DEFAULT 'not_started',
  progress     double precision NOT NULL DEFAULT 0,
  start_date   date,
  start_time   text,
  end_time     text,
  sort_order   double precision NOT NULL DEFAULT 0,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tasks_user_idx   ON tasks (user_id, created_date DESC);
CREATE INDEX IF NOT EXISTS tasks_parent_idx ON tasks (parent_id);

-- Supabase publishes every table in the "public" schema through its REST API. Row-level security with
-- no policies keeps that API from reading or writing these tables. This server connects as the table
-- owner, which is exempt, so it is unaffected. (Harmless on any other Postgres.)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users', 'tasks'] LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = t::regclass) THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;
`;

export async function migrate(pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Transaction-scoped lock: released automatically at COMMIT, and safe behind a connection pooler
    // (session-level locks are not). Stops instances that boot together from racing each other.
    await client.query("SELECT pg_advisory_xact_lock(727001)");
    await client.query(SCHEMA);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
