// Connection settings tests need no database. The last test needs TEST_DATABASE_URL (see api.test.js).
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { migrate, poolConfig } from "../src/db.js";

const SUPABASE = "postgresql://postgres.abcdefgh:p%40ss%2Fword@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";

test("Supabase pooler URL: parsed correctly, SSL switched on automatically", () => {
  const c = poolConfig({ DATABASE_URL: SUPABASE });
  assert.equal(c.host, "aws-0-eu-west-1.pooler.supabase.com");
  assert.equal(c.port, 6543);
  assert.equal(c.user, "postgres.abcdefgh");
  assert.equal(c.password, "p@ss/word"); // URL-encoded characters are decoded
  assert.equal(c.database, "postgres");
  assert.deepEqual(c.ssl, { rejectUnauthorized: false });
});

test("?sslmode=require in the URL does not switch on strict certificate checking", () => {
  const c = poolConfig({ DATABASE_URL: SUPABASE + "?sslmode=require" });
  assert.deepEqual(c.ssl, { rejectUnauthorized: false });
});

test("DATABASE_CA_CERT turns on certificate verification", () => {
  const c = poolConfig({ DATABASE_URL: SUPABASE, DATABASE_CA_CERT: "PEM-TEXT" });
  assert.deepEqual(c.ssl, { ca: "PEM-TEXT" });
});

test("local databases get no SSL unless asked", () => {
  assert.equal(poolConfig({ DATABASE_URL: "postgres://u:p@localhost:5432/db" }).ssl, false);
  assert.equal(poolConfig({ DATABASE_URL: "postgres://u:p@127.0.0.1/db" }).ssl, false);
  assert.equal(poolConfig({ DATABASE_URL: "postgres://u:p@/db?host=/cloudsql/proj:region:inst" }).ssl, false);
  assert.notEqual(poolConfig({ DATABASE_URL: "postgres://u:p@localhost/db", DATABASE_SSL: "true" }).ssl, false);
  assert.equal(poolConfig({ DATABASE_URL: SUPABASE, DATABASE_SSL: "false" }).ssl, false);
});

test("pool size and missing DATABASE_URL", () => {
  assert.equal(poolConfig({ DATABASE_URL: SUPABASE }).max, 5);
  assert.equal(poolConfig({ DATABASE_URL: SUPABASE, DB_POOL_MAX: "2" }).max, 2);
  assert.throws(() => poolConfig({}), /DATABASE_URL is not set/);
});

const skip = !process.env.TEST_DATABASE_URL && "set TEST_DATABASE_URL to run this test";
test("tables are locked down for Supabase's public REST API (row-level security, no policies)", { skip }, async () => {
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 2 });
  try {
    await migrate(pool);
    await migrate(pool); // running it again changes nothing
    const { rows } = await pool.query("SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('users','tasks') AND relkind = 'r'");
    assert.equal(rows.length, 2);
    assert.ok(rows.every((r) => r.relrowsecurity), "RLS enabled on users and tasks");

    // Behave like Supabase's public "anon" role: even with SELECT granted, it must see no rows.
    const role = `anon_like_${Date.now()}`;
    try {
      await pool.query(`CREATE ROLE ${role}`);
    } catch {
      return; // the test user isn't allowed to create roles; the flag check above is enough
    }
    const client = await pool.connect();
    try {
      await client.query("INSERT INTO users (email, password_hash) VALUES ($1, 'x') ON CONFLICT DO NOTHING", [`rls-${Date.now()}@example.com`]);
      await client.query(`GRANT SELECT, INSERT ON users, tasks TO ${role}`);
      await client.query(`SET ROLE ${role}`);
      assert.equal((await client.query("SELECT count(*)::int AS n FROM users")).rows[0].n, 0);
      await assert.rejects(() => client.query("INSERT INTO users (email, password_hash) VALUES ('evil@example.com','x')"), /row-level security/);
      await client.query("RESET ROLE");
    } finally {
      await client.query("RESET ROLE").catch(() => {});
      await client.query(`REVOKE ALL ON users, tasks FROM ${role}`).catch(() => {});
      await client.query(`DROP ROLE ${role}`).catch(() => {});
      client.release();
    }
  } finally {
    await pool.end();
  }
});
