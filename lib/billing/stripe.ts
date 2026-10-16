import "server-only";
import { createHash } from "node:crypto";
import Stripe from "stripe";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import type { Profile, EventRecord } from "@/lib/types";
import { repository, type Repository, type Transaction } from "@/lib/db/repository";
import { changeCredits } from "./ledger";
import { plans, packs, getPlan, stripePrice } from "./plans";
import { sendCreditReceipt } from "./email";

type PaidPlan = Exclude<Profile["plan"], "free">;
type Interval = "monthly" | "annual";
type Pack = keyof typeof packs;
type Purchase = { userId: string; customerId: string; sessionId: string; credits: number; amount: number; paymentIntentId?: string };
export type BillingEvent =
  | { kind: "topup"; purchase: Purchase }
  | { kind: "invoice"; userId: string; customerId: string; invoiceId: string; subscriptionId: string; planId: PaidPlan; interval: Interval; periodStart: string; periodEnd: string }
  | { kind: "subscription"; userId: string; customerId: string; subscriptionId: string; planId: PaidPlan; status: string; periodEnd: string; deleted: boolean }
  | { kind: "refund"; purchase: Purchase; chargeId: string; amountRefunded: number }
  | { kind: "ignored" };
type Term = { userId: string; customerId: string; subscriptionId: string; invoiceId: string; planId: PaidPlan; interval: Interval; periodStart: string; periodEnd: string; grantIndex: number; canceled?: boolean; expired?: boolean };
const APP = "fusion-gen-matrix";
const nowIso = () => new Date().toISOString();
const objectId = (value: string | { id: string } | null | undefined) => typeof value === "string" ? value : value?.id;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const packPrice = (id: Pack) => process.env["STRIPE_PRICE_TOPUP_" + id.toUpperCase()] || "";
const termId = (userId: string) => "billing-term:" + userId;
const purchaseId = (sessionId: string) => "billing-purchase:" + sessionId;
function asTerm(record: EventRecord | null): Term | null { return record?.type === "billing_term" ? record.payload as unknown as Term : null; }
function eventRecord(id: string, type: string, payload: object): EventRecord {
  return { id, type, createdAt: nowIso(), payload: payload as Record<string, unknown> };
}
export function billingConfigured() {
  const env = getEnv();
  const key = process.env.STRIPE_SECRET_KEY;
  return env.APP_MODE === "live" && process.env.BILLING_PRICES_CONFIRMED === "true" && Boolean(key) &&
    (!(key?.startsWith("sk_live_") || key?.startsWith("rk_live_")) || env.ENABLE_LIVE_BILLING === "true");
}
export function stripeClient() {
  if (!billingConfigured()) throw new AppError("BILLING_NOT_CONFIGURED", "Billing is not configured for this studio.", 503);
  return new Stripe(process.env.STRIPE_SECRET_KEY!, { timeout: 10000, maxNetworkRetries: 1, typescript: true });
}
function configuredPlan(priceId: string) {
  for (const plan of plans) {
    if (plan.id === "free") continue;
    for (const interval of ["monthly", "annual"] as const) {
      if (stripePrice(plan.id, interval) && stripePrice(plan.id, interval) === priceId) return { planId: plan.id as PaidPlan, interval };
    }
  }
  return null;
}
function configuredPack(priceId: string) {
  for (const pack of Object.keys(packs) as Pack[]) if (packPrice(pack) && packPrice(pack) === priceId) return pack;
  return null;
}
export const checkoutSchema = z.object({
  planId: z.enum(["starter", "plus", "ultra"]).optional(),
  interval: z.enum(["monthly", "annual"]).default("monthly"),
  packId: z.enum(["small", "medium", "large"]).optional(),
  idempotencyKey: z.uuid().optional()
}).strict().refine(value => Boolean(value.planId) !== Boolean(value.packId), "Choose one plan or credit pack.");

export async function createCheckout(user: Profile, raw: unknown) {
  const input = checkoutSchema.safeParse(raw);
  if (!input.success) throw new AppError("INVALID_CHECKOUT", "Choose one plan or credit pack.");
  const stripe = stripeClient();
  const { planId, interval, packId } = input.data;
  const price = packId ? packPrice(packId) : stripePrice(planId!, interval);
  if (!price) throw new AppError("PRICE_NOT_CONFIGURED", "This price has not been configured.", 503);
  const fresh = await repository().read(tx => tx.get("profiles", user.id));
  if (!fresh) throw new AppError("UNAUTHENTICATED", "Sign in to continue.", 401);
  if (planId && fresh.subscriptionId && fresh.plan !== "free") throw new AppError("USE_BILLING_PORTAL", "Manage your existing plan in the billing portal.", 409);
  let customerId = fresh.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({ email: fresh.email, name: fresh.name, metadata: { app: APP, userId: fresh.id } },
      { idempotencyKey: APP + "-customer-" + digest(fresh.id) });
    customerId = await repository().transaction(async tx => {
      const latest = await tx.get("profiles", fresh.id);
      if (!latest) throw new AppError("UNAUTHENTICATED", "Sign in to continue.", 401);
      if (latest.stripeCustomerId) return latest.stripeCustomerId;
      await tx.put("profiles", { ...latest, stripeCustomerId: customer.id });
      return customer.id;
    });
  }
  const key = input.data.idempotencyKey || String(Math.floor(Date.now() / 600000));
  const metadata = { app: APP, userId: fresh.id, ...(packId ? { packId } : { planId: planId!, interval }) };
  const session = await stripe.checkout.sessions.create({
    customer: customerId, mode: packId ? "payment" : "subscription",
    client_reference_id: fresh.id, line_items: [{ price, quantity: 1 }], metadata,
    success_url: new URL("/account/billing?checkout=success", getEnv().APP_URL).href,
    cancel_url: new URL("/pricing?checkout=canceled", getEnv().APP_URL).href,
    ...(packId ? { payment_intent_data: { metadata } } : { subscription_data: { metadata } })
  }, { idempotencyKey: APP + "-checkout-" + digest([fresh.id, price, key].join(":")) });
  if (!session.url) throw new AppError("CHECKOUT_UNAVAILABLE", "Checkout is unavailable. Please try again.", 503);
  return { url: session.url };
}
export async function createPortal(user: Profile) {
  const stripe = stripeClient();
  const latest = await repository().read(tx => tx.get("profiles", user.id));
  if (!latest?.stripeCustomerId) throw new AppError("NO_BILLING_ACCOUNT", "Complete a checkout before opening the billing portal.", 409);
  const portal = await stripe.billingPortal.sessions.create({ customer: latest.stripeCustomerId, return_url: new URL("/account/billing", getEnv().APP_URL).href });
  return { url: portal.url };
}
async function customerOwner(customerId: string | undefined) {
  if (!customerId) return null;
  const profiles = await repository().read(tx => tx.find("profiles", { stripeCustomerId: customerId }, 2));
  return profiles.length === 1 ? profiles[0] : null;
}
async function canonicalPurchase(session: Stripe.Checkout.Session, stripe: Stripe): Promise<Purchase | null> {
  if (session.mode !== "payment" || session.payment_status !== "paid" || session.metadata?.app !== APP) return null;
  const customerId = objectId(session.customer);
  const owner = await customerOwner(customerId);
  if (!owner || session.client_reference_id !== owner.id || session.metadata.userId !== owner.id) return null;
  const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 2 });
  if (items.has_more || items.data.length !== 1 || items.data[0].quantity !== 1) throw new Error("Unexpected checkout line items.");
  const pack = configuredPack(items.data[0].price?.id || "");
  if (!pack) throw new Error("Unrecognized studio credit price.");
  return { userId: owner.id, customerId: customerId!, sessionId: session.id, credits: packs[pack], amount: session.amount_total || 0, paymentIntentId: objectId(session.payment_intent) };
}
export async function normalizeStripeEvent(event: Stripe.Event, stripe: Stripe): Promise<BillingEvent> {
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = await stripe.checkout.sessions.retrieve(event.data.object.id);
    const purchase = await canonicalPurchase(session, stripe);
    return purchase ? { kind: "topup", purchase } : { kind: "ignored" };
  }
  if (event.type === "invoice.paid") {
    const invoice = await stripe.invoices.retrieve(event.data.object.id);
    if (invoice.status !== "paid" || !["subscription_create", "subscription_cycle"].includes(invoice.billing_reason || "")) return { kind: "ignored" };
    const subscriptionId = objectId(invoice.parent?.subscription_details?.subscription);
    const customerId = objectId(invoice.customer);
    const owner = await customerOwner(customerId);
    if (!subscriptionId || !owner) return { kind: "ignored" };
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    if (sub.metadata.app !== APP || sub.metadata.userId !== owner.id || objectId(sub.customer) !== customerId) return { kind: "ignored" };
    const lines = await stripe.invoices.listLineItems(invoice.id, { limit: 100 });
    if (lines.has_more) throw new Error("Invoice has too many line items.");
    const matched = lines.data.flatMap(line => {
      const plan = configuredPlan(objectId(line.pricing?.price_details?.price) || "");
      return plan && !line.parent?.subscription_item_details?.proration ? [{ line, plan }] : [];
    });
    if (matched.length !== 1 || matched[0].line.quantity !== 1) throw new Error("Invoice does not match one configured studio plan.");
    const { line, plan } = matched[0];
    return { kind: "invoice", userId: owner.id, customerId: customerId!, invoiceId: invoice.id,
      subscriptionId, ...plan, periodStart: new Date(line.period.start * 1000).toISOString(), periodEnd: new Date(line.period.end * 1000).toISOString() };
  }
  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const sub = await stripe.subscriptions.retrieve(event.data.object.id);
    const customerId = objectId(sub.customer);
    const owner = await customerOwner(customerId);
    if (!owner || sub.metadata.app !== APP || sub.metadata.userId !== owner.id) return { kind: "ignored" };
    if (sub.items.data.length !== 1 || sub.items.has_more) throw new Error("Subscription has unsupported items.");
    const item = sub.items.data[0];
    const plan = configuredPlan(item.price.id);
    if (!plan) throw new Error("Subscription plan is not configured.");
    return { kind: "subscription", userId: owner.id, customerId: customerId!, subscriptionId: sub.id, planId: plan.planId,
      status: sub.status, periodEnd: new Date(item.current_period_end * 1000).toISOString(), deleted: sub.status === "canceled" || event.type === "customer.subscription.deleted" };
  }
  if (event.type === "charge.refunded") {
    const charge = await stripe.charges.retrieve(event.data.object.id);
    const paymentIntent = objectId(charge.payment_intent);
    if (!paymentIntent) return { kind: "ignored" };
    const sessions = await stripe.checkout.sessions.list({ payment_intent: paymentIntent, limit: 2 });
    if (sessions.data.length !== 1 || sessions.has_more) return { kind: "ignored" };
    const purchase = await canonicalPurchase(sessions.data[0], stripe);
    return purchase ? { kind: "refund", purchase, chargeId: charge.id, amountRefunded: charge.amount_refunded } : { kind: "ignored" };
  }
  return { kind: "ignored" };
}
async function ownedProfile(tx: Transaction, userId: string, customerId: string) {
  const user = await tx.get("profiles", userId);
  if (!user || user.stripeCustomerId !== customerId) throw new Error("Billing owner could not be verified.");
  return user;
}
async function grantPurchase(tx: Transaction, purchase: Purchase) {
  let user = await ownedProfile(tx, purchase.userId, purchase.customerId);
  const record = await tx.get("stripe_events", purchaseId(purchase.sessionId));
  if (record) return { user, record };
  user = await changeCredits(tx, user, purchase.credits, "topup", "topup_purchase", purchase.sessionId);
  const created = eventRecord(purchaseId(purchase.sessionId), "billing_purchase", { ...purchase, refundedCredits: 0, receiptSent: false });
  await tx.insert("stripe_events", created);
  return { user, record: created };
}
export async function applyBillingEvent(eventId: string, eventType: string, input: BillingEvent, db: Repository = repository()) {
  return db.transaction(async tx => {
    if ((await tx.get("stripe_events", eventId))?.processedAt) return { duplicate: true };
    if (input.kind === "topup") await grantPurchase(tx, input.purchase);
    if (input.kind === "refund") {
      const { purchase, amountRefunded, chargeId } = input;
      const grant = await grantPurchase(tx, purchase);
      const previous = Number(grant.record.payload?.refundedCredits || 0);
      const target = purchase.amount > 0 ? Math.min(purchase.credits, Math.ceil(purchase.credits * Math.max(0, amountRefunded) / purchase.amount)) : 0;
      if (target > previous) {
        const debit = Math.min(grant.user.topupCredits, target - previous);
        const user = debit ? await changeCredits(tx, grant.user, -debit, "topup", "stripe_refund", chargeId + ":" + target) : grant.user;
        await tx.put("profiles", { ...user, billingReview: true });
        await tx.put("stripe_events", { ...grant.record, payload: { ...grant.record.payload, refundedCredits: target, uncollectedCredits: Number(grant.record.payload?.uncollectedCredits || 0) + target - previous - debit } });
      }
    }
    if (input.kind === "invoice") {
      let user = await ownedProfile(tx, input.userId, input.customerId);
      const oldTerm = asTerm(await tx.get("stripe_events", termId(user.id)));
      const isNewer = !oldTerm || Date.parse(input.periodStart) > Date.parse(oldTerm.periodStart);
      if (isNewer) {
        const overlapping = oldTerm && oldTerm.subscriptionId !== input.subscriptionId && Date.parse(oldTerm.periodEnd) > Date.parse(input.periodStart);
        if (overlapping) {
          await tx.put("profiles", { ...user, billingReview: true });
        } else {
          if (user.subscriptionCredits) user = await changeCredits(tx, user, -user.subscriptionCredits, "subscription", "subscription_reset", input.invoiceId);
          user = await changeCredits(tx, user, getPlan(input.planId).credits, "subscription", "subscription_grant", input.invoiceId);
          user = { ...user, plan: input.planId, subscriptionId: input.subscriptionId, planRenewsAt: input.periodEnd };
          await tx.put("profiles", user);
          const term: Term = { ...input, grantIndex: 0 };
          await tx.put("stripe_events", eventRecord(termId(user.id), "billing_term", term));
        }
      }
    }
    if (input.kind === "subscription") {
      const user = await ownedProfile(tx, input.userId, input.customerId);
      const record = await tx.get("stripe_events", termId(user.id));
      const term = asTerm(record);
      if (term && term.subscriptionId === input.subscriptionId && !term.expired) {
        if (input.deleted) await tx.put("stripe_events", { ...record!, payload: { ...term, canceled: true } });
        else if (input.status === "active") await tx.put("profiles", { ...user, plan: input.planId });
      }
    }
    await tx.put("stripe_events", { id: eventId, type: eventType, createdAt: nowIso(), processedAt: nowIso(), payload: { kind: input.kind } });
    return { duplicate: false };
  });
}
/** Preserve the original day/time anchor, clamping month ends instead of drifting. */
export function monthlyBoundary(start: string, month: number) {
  const date = new Date(start);
  const originalDay = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + month);
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(originalDay, end));
  return date.toISOString();
}
export async function reconcileBilling(now = new Date(), db: Repository = repository()) {
  const records = await db.read(tx => tx.find("stripe_events", { type: "billing_term" }, 5000));
  let renewed = 0, expired = 0;
  for (const record of records) {
    const result = await db.transaction(async tx => {
      const fresh = await tx.get("stripe_events", record.id);
      const term = asTerm(fresh);
      if (!term || term.expired) return "none";
      let user = await tx.get("profiles", term.userId);
      if (!user || user.subscriptionId !== term.subscriptionId) return "none";
      if (now.getTime() >= Date.parse(term.periodEnd)) {
        if (user.subscriptionCredits) user = await changeCredits(tx, user, -user.subscriptionCredits, "subscription", "subscription_expired", term.subscriptionId + ":" + term.periodEnd);
        const updated = { ...user, plan: "free" as const };
        delete updated.subscriptionId;
        delete updated.planRenewsAt;
        await tx.put("profiles", updated);
        await tx.put("stripe_events", { ...fresh!, payload: { ...term, expired: true } });
        return "expired";
      }
      if (term.interval !== "annual") return "none";
      let index = term.grantIndex, changed = false;
      while (index < 11) {
        const boundary = monthlyBoundary(term.periodStart, index + 1);
        if (Date.parse(boundary) > now.getTime() || Date.parse(boundary) >= Date.parse(term.periodEnd)) break;
        index++;
        const ref = term.invoiceId + ":month:" + index;
        if (user.subscriptionCredits) user = await changeCredits(tx, user, -user.subscriptionCredits, "subscription", "subscription_reset", ref);
        user = await changeCredits(tx, user, getPlan(term.planId).credits, "subscription", "subscription_grant", ref);
        changed = true;
      }
      if (changed) await tx.put("stripe_events", { ...fresh!, payload: { ...term, grantIndex: index } });
      return changed ? "renewed" : "none";
    });
    if (result === "renewed") renewed++;
    if (result === "expired") expired++;
  }
  return { renewed, expired, inspected: records.length, limit: 5000 };
}
export async function retryCreditReceipts(limit = 10) {
  if (!billingConfigured()) return { sent: 0, pending: 0 };
  const records = await repository().read(tx => tx.find("stripe_events", { type: "billing_purchase", "payload.receiptSent": false }, Math.min(limit, 50)));
  let sent = 0;
  for (const record of records) {
    const payload = record.payload as unknown as Purchase & { receiptSent?: boolean };
    const user = await repository().read(tx => tx.get("profiles", payload.userId));
    if (!user || user.stripeCustomerId !== payload.customerId) continue;
    try {
      await sendCreditReceipt(user.email, payload.credits, payload.sessionId);
      await repository().transaction(async tx => {
        const latest = await tx.get("stripe_events", record.id);
        if (latest) await tx.put("stripe_events", { ...latest, payload: { ...latest.payload, receiptSent: true } });
      });
      sent++;
    } catch {
      // A durable purchase record keeps this receipt eligible for the next reconciler run.
    }
  }
  return { sent, pending: records.length - sent };
}

export async function queueStripeEvent(event: Pick<Stripe.Event, "id" | "type">, db: Repository = repository()) {
  return db.transaction(async tx => {
    const existing = await tx.get("stripe_events", event.id);
    if (existing?.processedAt) return { duplicate: true };
    if (!existing) await tx.insert("stripe_events", {
      id: event.id, type: event.type, createdAt: nowIso(), payload: { pending: true }
    });
    return { duplicate: false };
  });
}
export async function processStripeEvent(event: Stripe.Event, stripe = stripeClient()) {
  const existing = await repository().read(tx => tx.get("stripe_events", event.id));
  if (existing?.processedAt) return { duplicate: true };
  return applyBillingEvent(event.id, event.type, await normalizeStripeEvent(event, stripe));
}
export async function retryStripeEvents(limit = 5) {
  if (!billingConfigured()) return { processed: 0, pending: 0 };
  const records = await repository().read(tx => tx.find("stripe_events", { "payload.pending": true }, Math.min(limit, 20)));
  const stripe = stripeClient();
  let processed = 0;
  for (const record of records) {
    try {
      const event = await stripe.events.retrieve(record.id);
      await processStripeEvent(event, stripe);
      processed++;
    } catch {
      // Keep the event pending. A future reconciler run can retry provider or database failures.
    }
  }
  return { processed, pending: records.length - processed };
}
