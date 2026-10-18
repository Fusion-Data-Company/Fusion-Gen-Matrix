import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { PostgresRepository } from "../lib/db/postgres-repository";
import { migratePostgres } from "../lib/db/postgres-migration";
import { cleanupPostgresExpired, verifyPostgresSchema } from "../lib/db/postgres-maintenance";
import { matrixPostgresAdapter } from "../lib/auth/postgres-adapter";
import { ensureProfile } from "../lib/auth/profile";
import { rateLimit } from "../lib/auth/security";
import { debit, refund } from "../lib/billing/ledger";
import { applyBillingEvent, queueStripeEvent } from "../lib/billing/stripe";
import { GenerationService, type GenerationInput } from "../lib/generations/service";
import { HiggsfieldError } from "../lib/higgsfield/client";
import type { Generation, Output, Profile } from "../lib/types";

const fixture = vi.hoisted(() => ({ repo: undefined as PostgresRepository | undefined }));
vi.mock("../lib/db/repository", async importOriginal => ({
  ...await importOriginal<typeof import("../lib/db/repository")>(),
  repository: () => { if (!fixture.repo) throw new Error("Fixture unavailable"); return fixture.repo; },
}));
const names = ["profiles", "generations", "projects", "uploads", "credit_ledger", "stripe_events", "hf_webhook_events", "presets", "model_pricing", "reports", "rate_limits", "preview_sessions"];
let pool: Pool, repo: PostgresRepository, adapter: ReturnType<typeof matrixPostgresAdapter>;
const owner: Profile = { id: "507f1f77bcf86cd799439011", name: "Fixture", email: "owner@example.test", role: "user", plan: "plus", subscriptionCredits: 8, topupCredits: 12, stripeCustomerId: "cus_fixture", createdAt: "2026-01-01T00:00:00.000Z" };
const input: GenerationInput = { modelId: "alibaba/qwen-image-3/text-to-image", prompt: "A ceramic cup", settings: {}, media: [], maxCredits: 4 };
const output: Output = { kind: "image", r2Key: `u/${owner.id}/generations/fixture/0.png`, url: `/api/media/u/${owner.id}/generations/fixture/0.png`, contentType: "image/png" };
function engine() {
  const provider = {
    estimate: vi.fn(async () => ({ usd: 0.02, providerCredits: "2" })),
    submit: vi.fn(async () => ({ requestId: "fixture-" + randomUUID(), status: "queued" as const, outputs: [] })),
    status: vi.fn(async (requestId: string) => ({ requestId, status: "queued" as const, outputs: [] })),
    cancel: vi.fn(async (requestId: string) => ({ requestId, status: "canceled" as const, outputs: [] })),
  };
  const retain = vi.fn(async () => [output]);
  const mediaUrl = vi.fn(async () => "https://cdn.example.test/fixture.png");
  return { provider, retain, mediaUrl, service: new GenerationService({ repo, mode: "live", provider, retain, demoRetain: retain, mediaUrl, markup: 2, creditUsd: 0.01, maxUsd: 5 }) };
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

beforeAll(async () => {
  const socket = process.env.MATRIX_PG_SOCKET;
  if (!socket?.startsWith("/tmp/matrix-pg-") || process.env.MATRIX_PG_PORT !== "54321") throw new Error("Run pnpm test:postgres; remote database URLs are never accepted.");
  pool = new Pool({ host: socket, port: 54321, user: "matrix_fixture", database: "postgres", ssl: false, max: 12 });
  // Check the guard before applying the migration to this fresh fixture.
  await pool.query("CREATE TABLE public.unrelated_fixture (id integer)");
  await expect(migratePostgres(pool)).rejects.toThrow("dedicated empty database");
  expect((await pool.query("SELECT to_regclass('public.unrelated_fixture') AS name")).rows[0].name).toBeTruthy();
  await pool.query("DROP TABLE public.unrelated_fixture");
  expect(await migratePostgres(pool)).toMatchObject({ applied: true });
  expect(await migratePostgres(pool)).toMatchObject({ applied: false });
  await verifyPostgresSchema(pool);
  repo = new PostgresRepository(pool);
  fixture.repo = repo;
  adapter = matrixPostgresAdapter(pool);
});
beforeEach(async () => {
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("External HTTP is forbidden in PostgreSQL fixtures."); }));
  await pool.query(`TRUNCATE ${names.map(name => "fusion_matrix." + name).join(", ")}, public.accounts, public.sessions, public.users, public.verification_token CASCADE`);
  await repo.transaction(tx => tx.insert("profiles", owner));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
afterAll(async () => { if (pool) await pool.end(); });

describe("PostgreSQL repository and transactional invariants", () => {
  it("preserves nested filters, missing fields, booleans, numeric and ISO ordering", async () => {
    await repo.transaction(async tx => {
      for (const [id, count] of [["a", 2], ["b", 10], ["c", 1]] as const) await tx.insert("stripe_events", {
        id, type: "fixture", createdAt: `2026-01-0${count === 10 ? 3 : count}T00:00:00.000Z`, payload: { pending: id !== "c", count }, ...(id === "c" ? { processedAt: "done" } : {}),
      });
    });
    expect((await repo.read(tx => tx.find("stripe_events", { "payload.pending": true, processedAt: { $exists: false }, id: { $in: ["a", "b"] } }, 20, { "payload.count": 1 }))).map(x => x.id)).toEqual(["a", "b"]);
    expect((await repo.read(tx => tx.find("stripe_events", { createdAt: { $lt: "2026-01-03T00:00:00.000Z" } }, 20))).map(x => x.id)).toEqual(["a", "c"]);
    expect(await repo.read(tx => tx.find("stripe_events", { id: { $in: [] } }))).toEqual([]);
    expect(await repo.read(tx => tx.find("stripe_events", { "payload.pending": "true" }))).toEqual([]);
    await expect(repo.read(tx => tx.find("stripe_events", { id: { $where: "unsafe" } }))).rejects.toThrow("operator");
    await expect(repo.read(tx => tx.find("stripe_events", { "id') OR TRUE --": "anything" }))).rejects.toThrow("field");
    expect(await repo.read(tx => tx.find("stripe_events", { id: "x' OR '1'='1" }))).toEqual([]);
  });
  it("rolls back ledger and balance together after a later statement fails", async () => {
    await expect(repo.transaction(async tx => {
      await debit(tx, (await tx.get("profiles", owner.id))!, 10, "rollback");
      await tx.insert("profiles", owner);
    })).rejects.toMatchObject({ code: "23505" });
    expect(await repo.read(tx => tx.get("profiles", owner.id))).toEqual(owner);
    expect(await repo.read(tx => tx.find("credit_ledger"))).toEqual([]);
  });
  it("enforces database uniqueness and nonnegative balances independently of the app", async () => {
    await expect(repo.transaction(tx => tx.put("profiles", { ...owner, topupCredits: -1 }))).rejects.toMatchObject({ code: "23514" });
    await expect(repo.transaction(tx => tx.insert("profiles", { ...owner, id: "other" }))).rejects.toMatchObject({ code: "23505" });
    await repo.transaction(tx => debit(tx, owner, 4, "unique-ledger"));
    const entry = (await repo.read(tx => tx.find("credit_ledger")))[0];
    await expect(repo.transaction(tx => tx.insert("credit_ledger", { ...entry, id: "different-id" }))).rejects.toMatchObject({ code: "23505" });
  });
  it("concurrent debits cannot overdraw or lose a ledger entry", async () => {
    const outcomes = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => repo.transaction(async tx => debit(tx, (await tx.get("profiles", owner.id))!, 4, "charge-" + i))));
    expect(outcomes.filter(x => x.status === "fulfilled")).toHaveLength(5);
    for (const result of outcomes) if (result.status === "rejected") expect(result.reason).toMatchObject({ code: "INSUFFICIENT_CREDITS" });
    expect(await repo.read(tx => tx.get("profiles", owner.id))).toMatchObject({ subscriptionCredits: 0, topupCredits: 0 });
    expect((await repo.read(tx => tx.find("credit_ledger"))).reduce((sum, entry) => sum + entry.delta, 0)).toBe(-20);
  });
  it("refunds both original buckets exactly once under concurrent delivery", async () => {
    const charged = await repo.transaction(tx => debit(tx, owner, 10, "split"));
    const generation = { id: "split", userId: owner.id, debit: charged.allocation } as Generation;
    await Promise.all(Array.from({ length: 8 }, () => repo.transaction(tx => refund(tx, generation))));
    expect(await repo.read(tx => tx.get("profiles", owner.id))).toEqual(owner);
    expect(await repo.read(tx => tx.find("credit_ledger", { reason: "generation_refund" }))).toHaveLength(2);
  });
  it("keeps a stable read snapshot and rejects writes through read", async () => {
    await repo.read(async tx => {
      const before = await tx.get("profiles", owner.id);
      await repo.transaction(write => write.put("profiles", { ...owner, name: "Changed" }));
      expect(await tx.get("profiles", owner.id)).toEqual(before);
    });
    await expect(repo.read(tx => tx.remove("profiles", owner.id))).rejects.toMatchObject({ code: "25006" });
  });
  it("bounds serialization retries without replaying other errors", async () => {
    const retry = vi.fn(async () => { throw Object.assign(new Error("Fixture serialization"), { code: "40001" }); });
    await expect(repo.transaction(retry)).rejects.toMatchObject({ code: "40001" });
    expect(retry).toHaveBeenCalledTimes(10);
    const rejected = vi.fn(async () => { throw Object.assign(new Error("Fixture constraint"), { code: "23505" }); });
    await expect(repo.transaction(rejected)).rejects.toMatchObject({ code: "23505" });
    expect(rejected).toHaveBeenCalledTimes(1);
  });
  it("does not retry an ambiguous COMMIT transport failure", async () => {
    const realConnect = pool.connect.bind(pool);
    const callback = vi.fn(async () => "result");
    vi.spyOn(pool, "connect").mockImplementationOnce(async () => {
      const client = await realConnect();
      const query = client.query.bind(client);
      client.query = (async (sql: string, ...args: unknown[]) => {
        if (sql === "COMMIT") { await query("COMMIT"); throw Object.assign(new Error("Fixture transport loss after commit"), { code: "ECONNRESET" }); }
        return (query as (...args: unknown[]) => Promise<unknown>)(sql, ...args);
      }) as typeof client.query;
      const release = client.release.bind(client);
      client.release = () => release(true);
      return client;
    });
    await expect(repo.transaction(callback)).rejects.toMatchObject({ code: "ECONNRESET" });
    expect(callback).toHaveBeenCalledTimes(1);
  });
  it("enforces rate limits atomically and preserves expiry dates", async () => {
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => rateLimit("fixture", "same-key", 3, 60)));
    expect(results.filter(x => x.status === "fulfilled")).toHaveLength(3);
    for (const result of results) if (result.status === "rejected") expect(result.reason).toMatchObject({ code: "RATE_LIMITED" });
    const record = (await repo.read(tx => tx.find("rate_limits")))[0];
    expect(record.count).toBe(3); expect(record.expiresAtDate).toBeInstanceOf(Date);
  });
});

describe("PostgreSQL generation ownership and state", () => {
  it("releases its database snapshot before transferring provider media", async () => {
    await repo.transaction(tx => tx.insert("uploads", { id: "owned-upload", userId: owner.id, name: "fixture.png", kind: "image", url: "/owned", r2Key: `u/${owner.id}/uploads/fixture.png`, contentType: "image/png", bytes: 1, createdAt: owner.createdAt }));
    const { service, mediaUrl } = engine();
    mediaUrl.mockImplementation(async () => {
      const result = await pool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND state = 'idle in transaction'");
      expect(result.rows[0].n).toBe(0);
      return "https://cdn.example.test/fixture.png";
    });
    await service.quote(owner.id, { ...input, modelId: "alibaba/qwen-image-3/edit", media: [{ id: "owned-upload", role: "reference" }] });
    expect(mediaUrl).toHaveBeenCalledTimes(1);
  });
  it("concurrent identical requests reserve credits and submit only once", async () => {
    const { service, provider } = engine(), key = randomUUID();
    const results = await Promise.all(Array.from({ length: 8 }, () => service.create(owner.id, input, key)));
    expect(new Set(results.map(x => x.id)).size).toBe(1);
    expect(provider.submit).toHaveBeenCalledTimes(1);
    expect(await repo.read(tx => tx.find("generations"))).toHaveLength(1);
    expect(await repo.read(tx => tx.get("profiles", owner.id))).toMatchObject({ subscriptionCredits: 4, topupCredits: 12 });
    await expect(service.create(owner.id, { ...input, prompt: "changed" }, key)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });
  it("serializes predicate checks so simultaneous requests cannot exceed the plan limit", async () => {
    await repo.transaction(tx => tx.put("profiles", { ...owner, plan: "free" }));
    const { service } = engine();
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => service.create(owner.id, input, randomUUID())));
    expect(results.filter(x => x.status === "fulfilled")).toHaveLength(1);
    for (const result of results) if (result.status === "rejected") expect(result.reason).toMatchObject({ code: "CONCURRENCY_LIMIT" });
    expect(await repo.read(tx => tx.find("credit_ledger"))).toHaveLength(1);
  });
  it("rejects foreign projects, uploads, generation reads and cancellations", async () => {
    await repo.transaction(async tx => {
      await tx.insert("projects", { id: "foreign-project", userId: "other", name: "Private", createdAt: owner.createdAt, updatedAt: owner.createdAt });
      await tx.insert("uploads", { id: "foreign-upload", userId: "other", name: "private.png", kind: "image", url: "/private", r2Key: "u/other/uploads/private.png", contentType: "image/png", bytes: 1, createdAt: owner.createdAt });
    });
    const { service, provider } = engine();
    await expect(service.create(owner.id, { ...input, projectId: "foreign-project" }, randomUUID())).rejects.toMatchObject({ status: 404 });
    await expect(service.create(owner.id, { ...input, media: [{ id: "foreign-upload", role: "reference" }] }, randomUUID())).rejects.toMatchObject({ status: 404 });
    expect(provider.submit).not.toHaveBeenCalled();
    const created = await service.create(owner.id, input, randomUUID());
    await expect(service.owned("other", created.id)).rejects.toMatchObject({ status: 404 });
    await expect(service.cancel("other", created.id)).rejects.toMatchObject({ status: 404 });
  });
  it.each(["failed", "nsfw", "canceled"] as const)("duplicate %s notifications refund once", async status => {
    const { service } = engine(), generation = await service.create(owner.id, input, randomUUID());
    await Promise.all(Array.from({ length: 6 }, () => service.apply(generation, { requestId: generation.requestId!, status, outputs: [] })));
    expect(await repo.read(tx => tx.get("generations", generation.id))).toMatchObject({ status });
    expect(await repo.read(tx => tx.get("profiles", owner.id))).toEqual(owner);
    expect(await repo.read(tx => tx.find("credit_ledger", { reason: "generation_refund" }))).toHaveLength(1);
  });
  it("keeps ambiguous submissions reserved and does not submit again on a repeated key", async () => {
    const { service, provider } = engine(), key = randomUUID();
    provider.submit.mockRejectedValue(new HiggsfieldError("Fixture timeout", { ambiguous: true }));
    expect(await service.create(owner.id, input, key)).toMatchObject({ status: "pending_submit" });
    expect(await service.create(owner.id, input, key)).toMatchObject({ status: "pending_submit" });
    expect(provider.submit).toHaveBeenCalledTimes(1);
    expect(await repo.read(tx => tx.find("credit_ledger", { reason: "generation_refund" }))).toEqual([]);
  });
  it("a failed retention remains retriable, then completion survives a new repository", async () => {
    const { service, retain } = engine(), generation = await service.create(owner.id, input, randomUUID());
    retain.mockRejectedValueOnce(new Error("Fixture storage unavailable"));
    const result = { requestId: generation.requestId!, status: "completed" as const, outputs: [] };
    const pending = await service.apply(generation, result);
    expect(pending).toMatchObject({ status: "in_progress", outputs: [] });
    await service.apply(pending, result);
    expect(await new PostgresRepository(pool).read(tx => tx.get("generations", generation.id))).toMatchObject({ status: "completed", outputs: [output] });
    expect(await repo.read(tx => tx.find("credit_ledger", { reason: "generation_refund" }))).toEqual([]);
  });
  it("fences stale retention workers and cannot resurrect a refunded cancellation", async () => {
    const { service, retain } = engine(), generation = await service.create(owner.id, input, randomUUID());
    const firstStarted = deferred<void>(), secondStarted = deferred<void>(), first = deferred<Output[]>(), second = deferred<Output[]>();
    retain.mockImplementationOnce(() => { firstStarted.resolve(); return first.promise; }).mockImplementationOnce(() => { secondStarted.resolve(); return second.promise; });
    const result = { requestId: generation.requestId!, status: "completed" as const, outputs: [] };
    const stale = service.apply(generation, result); await firstStarted.promise;
    await repo.transaction(async tx => tx.put("generations", { ...(await tx.get("generations", generation.id))!, finalizingUntil: new Date(0).toISOString() }));
    const fresh = service.apply(generation, result); await secondStarted.promise;
    const lease = (await repo.read(tx => tx.get("generations", generation.id)))!.finalizingToken;
    first.resolve([output]); await stale;
    expect(await repo.read(tx => tx.get("generations", generation.id))).toMatchObject({ finalizingToken: lease, outputs: [] });
    await service.cancel(owner.id, generation.id);
    second.resolve([output]); await fresh;
    expect(await repo.read(tx => tx.get("generations", generation.id))).toMatchObject({ status: "canceled", outputs: [] });
    expect(await repo.read(tx => tx.get("profiles", owner.id))).toEqual(owner);
  });
  it("retains tombstones and never reuses a deleted request key", async () => {
    const { service } = engine(), key = randomUUID(), generation = await service.create(owner.id, input, key);
    await repo.transaction(tx => tx.put("generations", { ...generation, deletedAt: owner.createdAt }));
    await expect(service.create(owner.id, input, key)).rejects.toMatchObject({ code: "GENERATION_DELETED" });
    await expect(service.owned(owner.id, generation.id)).rejects.toMatchObject({ status: 404 });
    expect(await service.owned(owner.id, generation.id, true)).toMatchObject({ id: generation.id });
  });
});

describe("Postgres billing and Auth.js", () => {
  it("concurrent billing deliveries and retries grant a purchase only once", async () => {
    const purchase = { userId: owner.id, customerId: owner.stripeCustomerId!, sessionId: "cs_fixture", credits: 500, amount: 1000, paymentIntentId: "pi_fixture" };
    await Promise.all(Array.from({ length: 8 }, () => queueStripeEvent({ id: "evt_fixture", type: "checkout.session.completed" }, repo)));
    expect(await repo.read(tx => tx.find("stripe_events", { "payload.pending": true }))).toHaveLength(1);
    await Promise.all(Array.from({ length: 8 }, (_, i) => applyBillingEvent(i % 2 ? "evt_fixture" : "evt_second", "checkout.session.completed", { kind: "topup", purchase }, repo)));
    expect(await repo.read(tx => tx.get("profiles", owner.id))).toMatchObject({ topupCredits: 512 });
    expect(await repo.read(tx => tx.find("credit_ledger", { reason: "topup_purchase" }))).toHaveLength(1);
    expect(await repo.read(tx => tx.find("stripe_events", { "payload.pending": true }))).toHaveLength(0);
    expect(await repo.read(tx => tx.find("stripe_events", { "payload.receiptSent": false }))).toHaveLength(1);
    await expect(applyBillingEvent("evt_wrong", "checkout.session.completed", { kind: "topup", purchase: { ...purchase, sessionId: "cs_wrong", customerId: "cus_wrong" } }, repo)).rejects.toThrow("owner");
    expect(await repo.read(tx => tx.get("stripe_events", "evt_wrong"))).toBeNull();
  });
  it("keeps legacy string IDs through Auth.js, profile creation and database sessions", async () => {
    await pool.query('INSERT INTO public.users (id, email, name) VALUES ($1, $2, $3)', [owner.id, owner.email, owner.name]);
    const user = await adapter.getUser!(owner.id);
    expect(user?.id).toBe(owner.id);
    expect(await ensureProfile(user!.id, user!.email, user!.name, repo)).toEqual(owner);
    const expires = new Date(Date.now() + 60000);
    await adapter.createSession!({ sessionToken: "fixture-session", userId: owner.id, expires });
    expect(await adapter.getSessionAndUser!("fixture-session")).toMatchObject({ user: { id: owner.id }, session: { userId: owner.id, expires } });
    expect(await adapter.updateSession!({ sessionToken: "fixture-session", expires: new Date(expires.getTime() + 1000) })).toMatchObject({ userId: owner.id });
    await adapter.deleteSession!("fixture-session");
    expect(await adapter.getSessionAndUser!("fixture-session")).toBeNull();
  });
  it("creates text IDs and applies a signup bonus once under repeated sign-in", async () => {
    const user = await adapter.createUser!({ id: "ignored-by-official-adapter", name: "New", email: "new@example.test", emailVerified: null });
    expect(typeof user.id).toBe("string"); expect(user.id).toMatch(/^[0-9a-f-]{36}$/);
    vi.stubEnv("SIGNUP_BONUS_CREDITS", "5");
    await Promise.all(Array.from({ length: 6 }, () => ensureProfile(user.id, user.email, user.name, repo)));
    expect(await repo.read(tx => tx.get("profiles", user.id))).toMatchObject({ id: user.id, topupCredits: 5 });
    expect(await repo.read(tx => tx.find("credit_ledger", { reason: "signup_bonus" }))).toHaveLength(1);
    await Promise.all([adapter.updateUser!({ id: user.id, name: "Updated" }), adapter.updateUser!({ id: user.id, image: "https://example.test/avatar.png" })]);
    expect(await adapter.getUser!(user.id)).toMatchObject({ name: "Updated", image: "https://example.test/avatar.png" });
  });
  it("consumes tokens once and fails closed for expired tokens and sessions", async () => {
    const user = await adapter.createUser!({ id: "fixture", name: "New", email: "tokens@example.test", emailVerified: null });
    const token = { identifier: user.email, token: "fixture-token-hash", expires: new Date(Date.now() + 60000) };
    await adapter.createVerificationToken!(token);
    const attempts = await Promise.all(Array.from({ length: 8 }, () => adapter.useVerificationToken!(token)));
    expect(attempts.filter(Boolean)).toHaveLength(1);
    const expired = { ...token, token: "expired-fixture", expires: new Date(0) };
    await adapter.createVerificationToken!(expired);
    expect(await adapter.useVerificationToken!(expired)).toBeNull();
    await adapter.createSession!({ userId: user.id, sessionToken: "expired-session", expires: new Date(0) });
    expect(await adapter.getSessionAndUser!("expired-session")).toBeNull();
    expect(await adapter.updateSession!({ sessionToken: "expired-session", expires: new Date(Date.now() + 60000) })).toBeNull();
    expect((await pool.query("SELECT count(*)::int AS n FROM public.verification_token")).rows[0].n).toBe(0);
  });
  it("atomically removes auth sessions/accounts on user deletion while retaining the ledger", async () => {
    await pool.query('INSERT INTO public.users (id, email) VALUES ($1, $2)', [owner.id, owner.email]);
    await adapter.createSession!({ userId: owner.id, sessionToken: "fixture-session", expires: new Date(Date.now() + 60000) });
    await adapter.linkAccount!({ userId: owner.id, type: "oauth", provider: "fixture", providerAccountId: "account" });
    expect(await adapter.getUserByAccount!({ provider: "fixture", providerAccountId: "account" })).toMatchObject({ id: owner.id });
    await repo.transaction(tx => debit(tx, owner, 4, "audit"));
    await adapter.deleteUser!(owner.id);
    expect(await adapter.getSessionAndUser!("fixture-session")).toBeNull();
    expect(await adapter.getUserByAccount!({ provider: "fixture", providerAccountId: "account" })).toBeNull();
    expect(await repo.read(tx => tx.find("credit_ledger"))).toHaveLength(1);
    expect(await repo.read(tx => tx.get("profiles", owner.id))).toBeTruthy();
  });
  it("does not delete a rate-limit window refreshed while cleanup waits on its row lock", async () => {
    await repo.transaction(tx => tx.insert("rate_limits", { id: "racing-expiry", count: 3, expiresAt: new Date(0).toISOString() }));
    const writer = await pool.connect();
    let cleaning: Promise<{ removed: number }> | undefined;
    try {
      await writer.query("BEGIN");
      await writer.query("UPDATE fusion_matrix.rate_limits SET document = $2::jsonb WHERE id = $1", ["racing-expiry", JSON.stringify({ id: "racing-expiry", count: 1, expiresAt: new Date(Date.now() + 60000).toISOString() })]);
      cleaning = cleanupPostgresExpired(pool);
      await vi.waitFor(async () => {
        const result = await pool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE 'DELETE FROM fusion_matrix.rate_limits%'");
        expect(result.rows[0].n).toBe(1);
      }, { timeout: 2000, interval: 10 });
      await writer.query("COMMIT");
      expect(await cleaning).toEqual({ removed: 0 });
      expect(await repo.read(tx => tx.get("rate_limits", "racing-expiry"))).toMatchObject({ count: 1 });
    } finally {
      await writer.query("ROLLBACK"); writer.release();
      if (cleaning) await cleaning;
    }
  });
  it("replaces TTL cleanup without deleting live sessions or idempotency records", async () => {
    const user = await adapter.createUser!({ id: "fixture", name: "New", email: "expiry@example.test", emailVerified: null });
    await adapter.createSession!({ userId: user.id, sessionToken: "old", expires: new Date(0) });
    await adapter.createSession!({ userId: user.id, sessionToken: "live", expires: new Date(Date.now() + 60000) });
    await adapter.createVerificationToken!({ identifier: user.email, token: "old", expires: new Date(0) });
    await repo.transaction(async tx => {
      await tx.insert("rate_limits", { id: "old", count: 1, expiresAt: new Date(0).toISOString() });
      await tx.insert("preview_sessions", { id: "old", userId: owner.id, expiresAt: new Date(0).toISOString() });
      await tx.insert("hf_webhook_events", { id: "durable", type: "fixture", createdAt: new Date(0).toISOString() });
    });
    expect(await cleanupPostgresExpired(pool)).toEqual({ removed: 4 });
    expect(await adapter.getSessionAndUser!("live")).toBeTruthy();
    expect(await repo.read(tx => tx.get("hf_webhook_events", "durable"))).toBeTruthy();
  });
});
