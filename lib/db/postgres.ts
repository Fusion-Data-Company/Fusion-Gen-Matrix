import "server-only";
import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";
import { postgresConfig } from "./postgres-config";

const shared = globalThis as typeof globalThis & { fusionPostgres?: Pool };
export function postgresPool(): Pool {
  if (!shared.fusionPostgres) {
    const pool = new Pool(postgresConfig(process.env.DATABASE_URL));
    // Pool errors can contain connection metadata. Do not log the raw error.
    pool.on("error", () => console.error("Matrix PostgreSQL connection unavailable."));
    if (process.env.VERCEL === "1") attachDatabasePool(pool);
    shared.fusionPostgres = pool;
  }
  return shared.fusionPostgres;
}
