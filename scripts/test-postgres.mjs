import { mkdtemp, mkdir, rm, chmod, access } from "node:fs/promises";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

// Always creates its own local cluster. DATABASE_URL and all provider credentials
// are excluded from child environments; this runner cannot target Neon.
const exec = promisify(execFile);
const bin = process.env.MATRIX_PG_BIN || "/opt/homebrew/opt/postgresql@18/bin";
for (const name of ["initdb", "pg_ctl"]) await access(path.join(bin, name));
const cache = path.join(process.cwd(), ".tool-cache");
await mkdir(cache, { recursive: true });
const root = await mkdtemp(path.join(cache, "postgres-fixture-"));
await chmod(root, 0o700);
const socket = await mkdtemp("/tmp/matrix-pg-");
await chmod(socket, 0o700);
const data = path.join(root, "cluster");
const cleanEnv = { PATH: process.env.PATH || "/usr/bin:/bin", LANG: "C", LC_ALL: "C", TZ: "UTC" };
let started = false, child;
const interrupt = () => { if (child) child.kill("SIGTERM"); };
process.once("SIGINT", interrupt);
process.once("SIGTERM", interrupt);
try {
  await exec(path.join(bin, "initdb"), ["-D", data, "--username=matrix_fixture", "--auth-local=trust", "--auth-host=reject", "--encoding=UTF8", "--locale=C", "--no-instructions"], { env: cleanEnv });
  await exec(path.join(bin, "pg_ctl"), ["-D", data, "-l", path.join(root, "postgres.log"), "-o", `-h '' -k ${socket} -p 54321 -c unix_socket_permissions=0700 -c max_connections=30`, "-w", "start"], { env: cleanEnv });
  started = true;
  console.log("Isolated PostgreSQL fixture ready (private Unix socket; no TCP listener).");
  process.exitCode = await new Promise((resolve, reject) => {
    child = spawn(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.postgres.config.ts"], {
      stdio: "inherit",
      env: { ...cleanEnv, NODE_ENV: "test", APP_MODE: "demo", APP_URL: "http://127.0.0.1:3210", SIGNUP_BONUS_CREDITS: "0", ADMIN_EMAILS: "", MATRIX_PG_SOCKET: socket, MATRIX_PG_PORT: "54321" },
    });
    child.once("error", reject);
    child.once("exit", code => resolve(code ?? 1));
  });
} finally {
  process.removeListener("SIGINT", interrupt);
  process.removeListener("SIGTERM", interrupt);
  if (started) await exec(path.join(bin, "pg_ctl"), ["-D", data, "-m", "fast", "-w", "stop"], { env: cleanEnv });
  await rm(root, { recursive: true, force: true });
  await rm(socket, { recursive: true, force: true });
  console.log("Isolated PostgreSQL fixture stopped and removed.");
}
