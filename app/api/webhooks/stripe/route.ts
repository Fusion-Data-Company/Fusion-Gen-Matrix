import { after } from "next/server";
import { stripeClient, queueStripeEvent, processStripeEvent, retryCreditReceipts } from "@/lib/billing/stripe";
import { safeErrorResponse } from "@/lib/auth/security";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
export const runtime = "nodejs";
export const maxDuration = 60;
async function rawBody(request: Request) {
  const limit = 1024 * 1024;
  if (Number(request.headers.get("content-length") || 0) > limit) throw new AppError("PAYLOAD_TOO_LARGE", "Webhook payload is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) return "";
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > limit) { await reader.cancel(); throw new AppError("PAYLOAD_TOO_LARGE", "Webhook payload is too large.", 413); }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
export async function POST(request: Request) {
  try {
    if (getEnv().APP_MODE !== "live" || !process.env.STRIPE_WEBHOOK_SECRET) throw new AppError("BILLING_NOT_CONFIGURED", "Stripe webhooks are not configured.", 503);
    const stripe = stripeClient();
    const signature = request.headers.get("stripe-signature");
    if (!signature) throw new AppError("INVALID_SIGNATURE", "Invalid webhook signature.", 400);
    const body = await rawBody(request);
    let event;
    try { event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET); }
    catch { throw new AppError("INVALID_SIGNATURE", "Invalid webhook signature.", 400); }
    const liveKey = /^(sk|rk)_live_/.test(process.env.STRIPE_SECRET_KEY || "");
    if (event.livemode !== liveKey) throw new AppError("BILLING_MODE_MISMATCH", "The webhook belongs to another billing mode.", 400);
    const result = await queueStripeEvent(event);
    if (!result.duplicate) after(async () => {
      try { await processStripeEvent(event, stripe); await retryCreditReceipts(1); }
      catch { console.error("Stripe event remains queued for reconciliation."); }
    });
    return Response.json({ received: true, duplicate: result.duplicate });
  } catch (error) { return safeErrorResponse(error); }
}
