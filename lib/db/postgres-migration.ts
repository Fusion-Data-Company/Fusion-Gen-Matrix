import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Pool } from "pg";

export const migrationId = "0001_matrix";
export async function initialMigration() {
  const sql = await readFile(new URL("../../migrations/postgres/0001_matrix.sql", import.meta.url), "utf8");
  return { sql, checksum: createHash("sha256").update(sql).digest("hex") };
}

/** Explicit operator command only. Never called by application startup. */
export async function migratePostgres(pool: Pool) {
  const { sql, checksum } = await initialMigration();
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '8s'");
    await client.query("SET LOCAL statement_timeout = '30s'");
    await client.query("SELECT pg_advisory_xact_lock(73469021, 1)");
    const existing = await client.query("SELECT to_regnamespace('fusion_matrix') AS schema");
    if (existing.rows[0].schema) {
      const installed = await client.query("SELECT checksum, application FROM fusion_matrix.schema_migrations WHERE id = $1", [migrationId]);
      if (installed.rows[0]?.checksum !== checksum || installed.rows[0]?.application !== "fusion-gen-matrix") throw new Error("Matrix migration differs from the installed schema. Review required.");
      await client.query("COMMIT");
      return { applied: false, migration: migrationId };
    }
    // First installation is allowed only in an empty database. No existing application
    // or Auth.js tables are adopted, even if their names happen to match.
    const occupied = await client.query(`SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema' AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e') LIMIT 1`);
    if (occupied.rowCount) throw new Error("Matrix requires a dedicated empty database. Existing relations were found.");
    await client.query(sql);
    await client.query("INSERT INTO fusion_matrix.schema_migrations (id, checksum, application) VALUES ($1, $2, 'fusion-gen-matrix')", [migrationId, checksum]);
    await client.query("COMMIT");
    return { applied: true, migration: migrationId };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { discard = true; }
    throw error;
  } finally { client.release(discard); }
}

