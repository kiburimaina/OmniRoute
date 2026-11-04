import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const directory = join(root, "db", "migrations");
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required. No migration was run.");
  process.exit(1);
}
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 5000,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined,
});
const client = await pool.connect();
try {
  await client.query("SELECT pg_advisory_lock(hashtext($1))", ["ai-workforce:migrations"]);
  await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  const files = (await readdir(directory)).filter((name) => /^\d+_[a-z0-9_]+\.sql$/.test(name)).sort();
  for (const file of files) {
    const applied = await client.query("SELECT 1 FROM schema_migrations WHERE version = $1", [file]);
    if (applied.rowCount) { console.log(`skip ${file}`); continue; }
    const sql = await readFile(join(directory, file), "utf8");
    console.log(`apply ${file}`);
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [file]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
  }
  console.log("Database migrations complete.");
} catch (error) {
  console.error("Migration failed; current migration rolled back.");
  console.error(error instanceof Error ? error.message : "Unknown error");
  process.exitCode = 1;
} finally {
  await client.query("SELECT pg_advisory_unlock(hashtext($1))", ["ai-workforce:migrations"]).catch(() => undefined);
  client.release();
  await pool.end();
}
