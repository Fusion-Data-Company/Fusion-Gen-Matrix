import { Pool } from "pg";
import { postgresConfig } from "../lib/db/postgres-config";
import { migratePostgres } from "../lib/db/postgres-migration";

// No dotenv loading or inferred destination. Supply the approved direct URL via a
// secure process environment, and confirm its exact non-secret host/database.
const args = process.argv.slice(2);
const at = (name: string) => args[args.indexOf(name) + 1];
if (args.length !== 5 || args[0] !== "--apply" || args[1] !== "--host" || args[3] !== "--database") {
  console.error("Usage: pnpm db:migrate:postgres --apply --host <approved-direct-host> --database fusion_gen_matrix");
  process.exit(1);
}
let pool: Pool | undefined;
try {
  const config = postgresConfig(process.env.DATABASE_URL_UNPOOLED);
  const target = new URL(config.connectionString!);
  if (target.hostname !== at("--host") || decodeURIComponent(target.pathname.slice(1)) !== at("--database") || at("--database") !== "fusion_gen_matrix" || target.hostname.includes("-pooler")) {
    throw new Error("Migration target does not match the approved dedicated Matrix database.");
  }
  pool = new Pool({ ...config, max: 1 });
  pool.on("error", () => console.error("Matrix migration connection unavailable."));
  const result = await migratePostgres(pool);
  console.log(`Matrix migration ${result.migration}: ${result.applied ? "applied" : "already verified"}.`);
} catch {
  // pg errors can contain SQL values and connection details. Keep these off logs.
  console.error("Matrix migration stopped. Check the dedicated target, TLS, permissions and reviewed migration; no credentials were printed.");
  process.exitCode = 1;
} finally { if (pool) await pool.end(); }
