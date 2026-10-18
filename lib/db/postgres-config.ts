import type { PoolConfig } from "pg";

/** Keep URI SSL options from silently replacing certificate verification in pg. */
export function postgresConfig(connectionString: string | undefined): PoolConfig {
  let url: URL;
  try { url = new URL(connectionString || ""); }
  catch { throw new Error("A valid PostgreSQL connection is required."); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !url.username || !url.password || url.pathname.length < 2 || url.hash) {
    throw new Error("A valid PostgreSQL connection is required.");
  }
  const permitted = new Set(["sslmode", "channel_binding"]);
  for (const name of url.searchParams.keys()) {
    if (!permitted.has(name) || url.searchParams.getAll(name).length !== 1) throw new Error("Unsupported PostgreSQL connection option.");
  }
  const mode = url.searchParams.get("sslmode");
  if (mode && !["require", "verify-full"].includes(mode)) throw new Error("PostgreSQL requires verified TLS.");
  const binding = url.searchParams.get("channel_binding");
  if (binding && binding !== "require" && binding !== "prefer") throw new Error("Unsupported PostgreSQL channel binding option.");
  url.search = "";
  return {
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: true },
    enableChannelBinding: true,
    application_name: "fusion-gen-matrix",
    max: 10,
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 15000,
  };
}
