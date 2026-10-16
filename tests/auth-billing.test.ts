import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";
import { createElement } from "react";
import { render } from "@react-email/render";
import { POST as stripeWebhook } from "@/app/api/webhooks/stripe/route";
import type { Profile } from "@/lib/types";
import { FileRepository } from "@/lib/db/repository";
import { applyBillingEvent, checkoutSchema, createCheckout, monthlyBoundary, reconcileBilling, normalizeStripeEvent, queueStripeEvent, type BillingEvent } from "@/lib/billing/stripe";
import { assertLocalPreview, assertSameOrigin, rateLimit } from "@/lib/auth/security";
import { normalizeEmail } from "@/lib/auth/profile";
import { cleanEmailCopy, SignInEmail, CreditReceipt } from "@/lib/billing/email";
import { currentUser, demoLogin, demoLogout, requireAdmin } from "@/lib/auth/server";

const mocks = vi.hoisted(() => ({
  set: vi.fn(), delete: vi.fn(), requestHeaders: new Headers()
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: mocks.set, delete: mocks.delete }), headers: async () => mocks.requestHeaders }));

let dir: string;
let db: FileRepository;
const profile = (id = "user-1"): Profile => ({ id, email: id + "@example.com", name: "Test user", role: "user", plan: "free",
  subscriptionCredits: 0, topupCredits: 50, stripeCustomerId: "cus_" + id, createdAt: "2026-01-01T00:00:00.000Z" });
const req = (extra: Record<string, string> = {}) => new Request("http://127.0.0.1:3210/api/test", {
  method: "POST", headers: { host: "127.0.0.1:3210", origin: "http://127.0.0.1:3210", ...extra }
});
const purchase = { userId: "user-1", customerId: "cus_user-1", sessionId: "cs_test_purchase", credits: 500, amount: 1000, paymentIntentId: "pi_test_purchase" };
const invoice = (changes: Partial<Extract<BillingEvent, { kind: "invoice" }>> = {}): Extract<BillingEvent, { kind: "invoice" }> => ({
  kind: "invoice", userId: "user-1", customerId: "cus_user-1", invoiceId: "in_january", subscriptionId: "sub_1",
  planId: "starter", interval: "monthly", periodStart: "2026-01-31T12:00:00.000Z", periodEnd: "2026-02-28T12:00:00.000Z", ...changes
});
async function readUser() { return (await db.read(tx => tx.get("profiles", "user-1")))!; }

beforeEach(async () => {
  await fs.mkdir(path.join(process.cwd(), ".tool-cache"), { recursive: true });
  dir = await fs.mkdtemp(path.join(process.cwd(), ".tool-cache", "auth-billing-test-"));
  vi.stubEnv("APP_MODE", "demo");
  vi.stubEnv("APP_URL", "http://127.0.0.1:3210");
  vi.stubEnv("DATA_DIR", dir);
  vi.stubEnv("SIGNUP_BONUS_CREDITS", "0");
  vi.stubEnv("ADMIN_EMAILS", "");
  vi.stubEnv("NODE_ENV", "test");
  mocks.set.mockReset(); mocks.delete.mockReset(); mocks.requestHeaders = req().headers;
  db = new FileRepository(dir);
  await db.transaction(tx => tx.insert("profiles", profile()));
});
afterEach(async () => { vi.unstubAllEnvs(); await fs.rm(dir, { recursive: true, force: true }); });

describe("identity boundaries", () => {
  it("rejects non-loopback preview hosts and cross-origin writes", () => {
    expect(() => assertLocalPreview(req({ host: "example.com:3210" }))).toThrow("Local preview");
    expect(() => assertSameOrigin(req({ origin: "https://example.com" }))).toThrow("Open the studio");
    expect(() => assertSameOrigin(req({ "sec-fetch-site": "cross-site" }))).toThrow("Open the studio");
    expect(() => assertSameOrigin(req())).not.toThrow();
  });
  it("uses a hash-only session store and grants local credits once", async () => {
    const user = await demoLogin("Person@preview.local", req());
    expect(user.topupCredits).toBe(200);
    expect(user.role).toBe("user");
    const [name, token, options] = mocks.set.mock.calls[0];
    expect(options).toMatchObject({ httpOnly: true, sameSite: "strict" });
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    const stored = await db.read(tx => tx.get("preview_sessions", createHash("sha256").update(token).digest("hex")));
    expect(stored?.userId).toBe(user.id);
    expect(await db.read(tx => tx.get("preview_sessions", token))).toBeNull();
    const signed = req({ cookie: name + "=" + token });
    expect((await currentUser(signed))?.id).toBe(user.id);
    await demoLogin("person@preview.local", signed);
    expect((await db.read(tx => tx.get("profiles", user.id)))?.topupCredits).toBe(200);
    expect(await currentUser(signed)).toBeNull();
  });
  it("keeps preview admin limited to the named local operator", async () => {
    await demoLogin("other@preview.local", req());
    let [name, token] = mocks.set.mock.calls.at(-1)!;
    await expect(requireAdmin(req({ cookie: name + "=" + token }))).rejects.toMatchObject({ status: 404 });
    await demoLogin("operator@preview.local", req());
    [name, token] = mocks.set.mock.calls.at(-1)!;
    expect((await requireAdmin(req({ cookie: name + "=" + token }))).role).toBe("admin");
  });
  it("revokes the stored preview session on logout", async () => {
    await demoLogin("person@preview.local", req());
    const [name, token] = mocks.set.mock.calls[0];
    const signed = req({ cookie: name + "=" + token });
    mocks.requestHeaders = signed.headers;
    await demoLogout();
    expect(await currentUser(signed)).toBeNull();
    expect(mocks.delete).toHaveBeenCalledWith(name);
  });
  it("expires preview sessions and treats unknown tokens as signed out", async () => {
    await demoLogin("person@preview.local", req());
    const [name, token] = mocks.set.mock.calls[0];
    await db.transaction(async tx => {
      const id = createHash("sha256").update(token).digest("hex");
      const session = (await tx.get("preview_sessions", id))!;
      await tx.put("preview_sessions", { ...session, expiresAt: "2020-01-01T00:00:00.000Z" });
    });
    expect(await currentUser(req({ cookie: name + "=" + token }))).toBeNull();
    expect(await currentUser(req({ cookie: name + "=invalid" }))).toBeNull();
  });
  it("keeps public showcase visitors signed out", async () => {
    vi.stubEnv("APP_MODE", "showcase");
    expect(await currentUser(new Request("https://example.com"))).toBeNull();
    await expect(demoLogin("operator@preview.local", req())).rejects.toMatchObject({ status: 404 });
  });
  it("serializes rate limiting across competing requests", async () => {
    const results = await Promise.allSettled([rateLimit("test", "same", 1, 60), rateLimit("test", "same", 1, 60)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    const records = await db.read(tx => tx.find("rate_limits"));
    expect(records).toHaveLength(1);
    expect(records[0].count).toBe(1);
  });
  it("normalizes one email and rejects recipient lists", () => {
    expect(normalizeEmail(" Test@Example.com ")).toBe("test@example.com");
    expect(() => normalizeEmail("one@example.com,two@example.com")).toThrow();
    expect(cleanEmailCopy("Credits — “ready”…")).toBe('Credits - "ready"...');
  });
});

describe("email rendering", () => {
  it("renders branded HTML and plain text emails without sending them", async () => {
    const url = "https://studio.example.com/api/auth/callback/resend?token=sample";
    const signIn = createElement(SignInEmail, { url });
    const html = await render(signIn);
    const text = await render(signIn, { plainText: true });
    expect(html).toContain("FUSION GEN MATRIX");
    expect(text).toContain("10 minutes");
    expect(text).toContain(url);
    const receipt = await render(createElement(CreditReceipt, { credits: 500, accountUrl: "https://studio.example.com/account" }), { plainText: true });
    expect(receipt).toContain("500 credits");
    expect(receipt).toContain("do not expire");
  });
});

describe("billing ledger and lifecycle", () => {
  it("rejects ambiguous cart choices and never opens checkout in demo", async () => {
    expect(checkoutSchema.safeParse({ planId: "starter", packId: "small" }).success).toBe(false);
    expect(checkoutSchema.safeParse({ packId: "small", price: 1 }).success).toBe(false);
    await expect(createCheckout(profile(), { packId: "small" })).rejects.toMatchObject({ code: "BILLING_NOT_CONFIGURED" });
  });
  it("grants a paid top-up once across event replay and delayed-payment events", async () => {
    await applyBillingEvent("evt_a", "checkout.session.completed", { kind: "topup", purchase }, db);
    await applyBillingEvent("evt_a", "checkout.session.completed", { kind: "topup", purchase }, db);
    await applyBillingEvent("evt_b", "checkout.session.async_payment_succeeded", { kind: "topup", purchase }, db);
    expect((await readUser()).topupCredits).toBe(550);
    const entries = await db.read(tx => tx.find("credit_ledger", { reason: "topup_purchase" }));
    expect(entries).toHaveLength(1);
  });
  it("rejects events mapped to another customer's profile without saving them", async () => {
    await expect(applyBillingEvent("evt_wrong", "checkout.session.completed", { kind: "topup", purchase: { ...purchase, customerId: "cus_someone_else" } }, db)).rejects.toThrow("owner");
    expect((await readUser()).topupCredits).toBe(50);
    expect(await db.read(tx => tx.get("stripe_events", "evt_wrong"))).toBeNull();
  });
  it("resets subscription credits on a new paid invoice while preserving top-ups", async () => {
    await applyBillingEvent("evt_invoice", "invoice.paid", invoice(), db);
    await db.transaction(async tx => tx.put("profiles", { ...(await readUser()), subscriptionCredits: 123 }));
    await applyBillingEvent("evt_renewal", "invoice.paid", invoice({ invoiceId: "in_feb", periodStart: "2026-02-28T12:00:00.000Z", periodEnd: "2026-03-31T12:00:00.000Z" }), db);
    const user = await readUser();
    expect(user.subscriptionCredits).toBe(1000);
    expect(user.topupCredits).toBe(50);
    expect(user.plan).toBe("starter");
    await applyBillingEvent("evt_old_delivery", "invoice.paid", invoice(), db);
    expect((await readUser()).subscriptionCredits).toBe(1000);
  });
  it("deduplicates simultaneous Stripe event deliveries", async () => {
    await Promise.all(Array.from({ length: 8 }, () => applyBillingEvent("evt_concurrent", "checkout.session.completed", { kind: "topup", purchase }, db)));
    expect((await readUser()).topupCredits).toBe(550);
  });
  it("applies cumulative partial refunds once and never makes a balance negative", async () => {
    await applyBillingEvent("evt_buy", "checkout.session.completed", { kind: "topup", purchase }, db);
    await applyBillingEvent("evt_refund_a", "charge.refunded", { kind: "refund", purchase, chargeId: "ch_1", amountRefunded: 200 }, db);
    await applyBillingEvent("evt_refund_b", "charge.refunded", { kind: "refund", purchase, chargeId: "ch_1", amountRefunded: 200 }, db);
    expect((await readUser()).topupCredits).toBe(450);
    await db.transaction(async tx => tx.put("profiles", { ...(await readUser()), topupCredits: 20 }));
    await applyBillingEvent("evt_refund_full", "charge.refunded", { kind: "refund", purchase, chargeId: "ch_1", amountRefunded: 1000 }, db);
    const user = await readUser();
    expect(user.topupCredits).toBe(0);
    expect(user.billingReview).toBe(true);
    const state = await db.read(tx => tx.get("stripe_events", "billing-purchase:" + purchase.sessionId));
    expect(state?.payload?.uncollectedCredits).toBe(380);
  });
  it("handles a refund arriving before the purchase webhook", async () => {
    await applyBillingEvent("evt_refund_first", "charge.refunded", { kind: "refund", purchase, chargeId: "ch_1", amountRefunded: 1000 }, db);
    await applyBillingEvent("evt_purchase_late", "checkout.session.completed", { kind: "topup", purchase }, db);
    expect((await readUser()).topupCredits).toBe(50);
  });
  it("resets annual credits monthly using the original month-end anchor", async () => {
    await applyBillingEvent("evt_annual", "invoice.paid", invoice({ interval: "annual", periodEnd: "2027-01-31T12:00:00.000Z" }), db);
    await db.transaction(async tx => tx.put("profiles", { ...(await readUser()), subscriptionCredits: 7 }));
    expect(monthlyBoundary("2026-01-31T12:00:00.000Z", 1)).toBe("2026-02-28T12:00:00.000Z");
    expect(monthlyBoundary("2026-01-31T12:00:00.000Z", 2)).toBe("2026-03-31T12:00:00.000Z");
    const first = await reconcileBilling(new Date("2026-03-01T00:00:00.000Z"), db);
    expect(first.renewed).toBe(1);
    expect((await readUser()).subscriptionCredits).toBe(1000);
    const second = await reconcileBilling(new Date("2026-03-01T00:00:00.000Z"), db);
    expect(second.renewed).toBe(0);
    expect((await readUser()).topupCredits).toBe(50);
  });
  it("keeps canceled credits until paid period end, then expires only that bucket", async () => {
    await applyBillingEvent("evt_invoice", "invoice.paid", invoice(), db);
    await applyBillingEvent("evt_cancel", "customer.subscription.deleted", {
      kind: "subscription", userId: "user-1", customerId: "cus_user-1", subscriptionId: "sub_1", planId: "starter",
      status: "canceled", deleted: true, periodEnd: "2026-02-28T12:00:00.000Z"
    }, db);
    await reconcileBilling(new Date("2026-02-15T00:00:00.000Z"), db);
    expect((await readUser()).subscriptionCredits).toBe(1000);
    const result = await reconcileBilling(new Date("2026-02-28T12:00:00.000Z"), db);
    expect(result.expired).toBe(1);
    expect(await readUser()).toMatchObject({ plan: "free", subscriptionCredits: 0, topupCredits: 50 });
  });
  it("flags overlapping subscriptions without granting two allowances", async () => {
    await applyBillingEvent("evt_first", "invoice.paid", invoice({ periodEnd: "2026-03-31T12:00:00.000Z" }), db);
    await applyBillingEvent("evt_second", "invoice.paid", invoice({ subscriptionId: "sub_2", invoiceId: "in_other", periodStart: "2026-02-01T12:00:00.000Z" }), db);
    expect(await readUser()).toMatchObject({ billingReview: true, subscriptionId: "sub_1", subscriptionCredits: 1000 });
  });
});

describe("Stripe ingress", () => {
  function liveFixtures() {
    vi.stubEnv("APP_MODE", "live");
    vi.stubEnv("APP_URL", "https://studio.example.com");
    vi.stubEnv("BILLING_PRICES_CONFIRMED", "true");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fixture_not_a_credential");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_fixture_not_a_credential");
    for (const key of ["MONGODB_URI", "AUTH_SECRET", "AUTH_RESEND_KEY", "EMAIL_FROM", "HF_CREDENTIALS", "HF_WEBHOOK_SECRET", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "CRON_SECRET"]) vi.stubEnv(key, ["AUTH_SECRET", "HF_WEBHOOK_SECRET", "CRON_SECRET"].includes(key) ? "test-fixture-not-a-credential-32-characters" : "test-fixture");
  }
  it("queues only verified event identity and persists work until successful processing", async () => {
    const event = { id: "evt_queued", type: "checkout.session.completed" as const };
    await queueStripeEvent(event, db);
    await queueStripeEvent(event, db);
    const before = await db.read(tx => tx.get("stripe_events", event.id));
    expect(before?.payload).toEqual({ pending: true });
    expect(before?.processedAt).toBeUndefined();
    await applyBillingEvent(event.id, event.type, { kind: "topup", purchase }, db);
    expect(await queueStripeEvent(event, db)).toEqual({ duplicate: true });
    expect((await readUser()).topupCredits).toBe(550);
  });
  it("grants nothing for a completed but unpaid Checkout Session", async () => {
    const stripe = { checkout: { sessions: { retrieve: vi.fn().mockResolvedValue({ id: "cs_unpaid", mode: "payment", payment_status: "unpaid", metadata: { app: "fusion-gen-matrix" } }) } } } as unknown as Stripe;
    const event = { id: "evt_unpaid", type: "checkout.session.completed", data: { object: { id: "cs_unpaid" } } } as Stripe.Event;
    const normalized = await normalizeStripeEvent(event, stripe);
    expect(normalized).toEqual({ kind: "ignored" });
    await applyBillingEvent(event.id, event.type, normalized, db);
    expect((await readUser()).topupCredits).toBe(50);
  });
  it("rejects tampered raw webhook bodies before database or provider access", async () => {
    liveFixtures();
    const body = JSON.stringify({ id: "evt_test", object: "event", type: "checkout.session.completed", livemode: false, data: { object: {} } });
    const stripe = new Stripe("sk_test_fixture_not_a_credential");
    const signature = stripe.webhooks.generateTestHeaderString({ payload: body, secret: "whsec_fixture_not_a_credential" });
    const response = await stripeWebhook(new Request("https://studio.example.com/api/webhooks/stripe", { method: "POST", headers: { "stripe-signature": signature }, body: body + " " }));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("INVALID_SIGNATURE");
  });
  it("rejects a correctly signed event from the other billing mode", async () => {
    liveFixtures();
    const body = JSON.stringify({ id: "evt_test", object: "event", type: "checkout.session.completed", livemode: true, data: { object: {} } });
    const stripe = new Stripe("sk_test_fixture_not_a_credential");
    const signature = stripe.webhooks.generateTestHeaderString({ payload: body, secret: "whsec_fixture_not_a_credential" });
    const response = await stripeWebhook(new Request("https://studio.example.com/api/webhooks/stripe", { method: "POST", headers: { "stripe-signature": signature }, body }));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("BILLING_MODE_MISMATCH");
  });
  it("rejects oversized webhook bodies before signature parsing", async () => {
    liveFixtures();
    const response = await stripeWebhook(new Request("https://studio.example.com/api/webhooks/stripe", { method: "POST", headers: { "stripe-signature": "invalid" }, body: "x".repeat(1024 * 1024 + 1) }));
    expect(response.status).toBe(413);
  });
});
