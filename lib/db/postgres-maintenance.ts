import "server-only";
import type { Pool, PoolClient } from "pg";

/** Bounded replacements for MongoDB TTL indexes. Authorization checks expiry independently. */
export async function cleanupPostgresExpired(pool: Pool, now = new Date(), limit = 1000) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 5000 || !Number.isFinite(now.getTime())) throw new Error("Invalid expiry cleanup request.");
  let removed = 0;
  for (const table of ["sessions", "verification_token"] as const) {
    const result = await pool.query(`DELETE FROM public.${table} WHERE ctid IN (
      SELECT ctid FROM public.${table} WHERE expires <= $1 ORDER BY expires LIMIT $2
    ) AND expires <= $1`, [now, limit]);
    removed += result.rowCount ?? 0;
  }
  for (const table of ["rate_limits", "preview_sessions"] as const) {
    const result = await pool.query(`DELETE FROM fusion_matrix.${table} WHERE id IN (
      SELECT id FROM fusion_matrix.${table} WHERE document #> '{expiresAt}' <= $1::jsonb
      ORDER BY document #> '{expiresAt}' LIMIT $2
    ) AND document #> '{expiresAt}' <= $1::jsonb`, [JSON.stringify(now.toISOString()), limit]);
    removed += result.rowCount ?? 0;
  }
  return { removed };
}


export async function verifyPostgresSchema(pool: Pool | PoolClient) {
  const result = await pool.query("SELECT application FROM fusion_matrix.schema_migrations WHERE id = $1", ["0001_matrix"]);
  if (result.rows[0]?.application !== "fusion-gen-matrix") throw new Error("The dedicated Matrix PostgreSQL schema is not initialized.");
}
