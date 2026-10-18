import { afterEach, describe, expect, it, vi } from "vitest";
import { postgresConfig } from "../lib/db/postgres-config";
import { getEnv } from "../lib/env";

afterEach(() => vi.unstubAllEnvs());
describe("Postgres connection and activation boundaries", () => {
  it("enforces certificate verification even with the Neon sslmode=require URL", () => {
    const result = postgresConfig("postgresql://fixture:fixture@db.example.invalid/fusion_gen_matrix?sslmode=require&channel_binding=require");
    expect(result.ssl).toEqual({ rejectUnauthorized: true });
    expect(result.enableChannelBinding).toBe(true);
    expect(new URL(result.connectionString!).search).toBe("");
    expect(result.max).toBe(10);
  });
  it.each(["sslmode=disable", "sslmode=no-verify", "sslmode=prefer", "sslmode=verify-ca", "sslmode=require&sslmode=disable", "sslcert=/private/key", "sslkey=/private/key", "sslrootcert=/private/ca", "options=unsafe", "host=another-host", "channel_binding=disable"])("rejects unsafe or unsupported option %s", option => {
    expect(() => postgresConfig("postgresql://fixture:fixture@db.example.invalid/fusion_gen_matrix?" + option)).toThrow();
  });
  it.each([undefined, "", "not a url", "https://fixture:fixture@db.example.invalid/matrix", "postgresql://db.example.invalid/", "postgresql://fixture@db.example.invalid/matrix"])("rejects malformed or incomplete connection without exposing it", value => {
    expect(() => postgresConfig(value)).toThrow("valid PostgreSQL connection");
  });
  it("defaults to the requested Neon and Vercel Blob stack", () => {
    vi.stubEnv("APP_MODE", "showcase");
    vi.stubEnv("DATABASE_PROVIDER", undefined); vi.stubEnv("MEDIA_STORAGE_PROVIDER", undefined);
    expect(getEnv()).toMatchObject({ DATABASE_PROVIDER: "postgres", MEDIA_STORAGE_PROVIDER: "vercel-blob" });
  });
  it("requires only the selected live database, including explicit legacy compatibility", () => {
    vi.stubEnv("APP_MODE", "live"); vi.stubEnv("APP_URL", "https://matrix.example.test");
    vi.stubEnv("DATABASE_PROVIDER", "mongodb"); vi.stubEnv("MEDIA_STORAGE_PROVIDER", "r2");
    for (const key of ["AUTH_SECRET", "HF_WEBHOOK_SECRET", "CRON_SECRET", "AUTH_RESEND_KEY", "EMAIL_FROM", "HF_CREDENTIALS", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"]) vi.stubEnv(key, "isolated-fixture-at-least-32-characters");
    vi.stubEnv("MONGODB_URI", ""); vi.stubEnv("DATABASE_URL", "");
    expect(() => getEnv()).toThrow("MONGODB_URI");
    vi.stubEnv("DATABASE_PROVIDER", "postgres");
    expect(() => getEnv()).toThrow("DATABASE_URL");
    vi.stubEnv("DATABASE_URL", "postgresql://fixture:fixture@db.example.invalid/fusion_gen_matrix");
    expect(getEnv().DATABASE_PROVIDER).toBe("postgres");
    vi.stubEnv("DATABASE_PROVIDER", "");
    expect(() => getEnv()).toThrow("DATABASE_PROVIDER");
  });
});
