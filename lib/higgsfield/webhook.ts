import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { assertPublicHttpsUrl } from "../catalog/server";

function validId(generationId: string): boolean { return /^[A-Za-z0-9_-]{1,200}$/.test(generationId); }
function checkSecret(secret: string): void { if (secret.length < 32) throw new Error("HF_WEBHOOK_SECRET must have at least 32 characters."); }
export function createWebhookToken(generationId: string, secret: string): string {
  checkSecret(secret);
  if (!validId(generationId)) throw new Error("Invalid generation identifier.");
  return createHmac("sha256", secret).update(generationId).digest("hex");
}
export function verifyWebhookToken(generationId: string, token: string, secret: string): boolean {
  checkSecret(secret);
  if (!validId(generationId) || !/^[a-f0-9]{64}$/i.test(token)) return false;
  return timingSafeEqual(Buffer.from(createWebhookToken(generationId, secret), "hex"), Buffer.from(token, "hex"));
}
export function buildWebhookUrl(baseUrl: string | undefined, generationId: string, secret: string): string | undefined {
  if (!baseUrl) return undefined;
  const base = new URL(assertPublicHttpsUrl(baseUrl));
  const url = new URL("/api/webhooks/higgsfield", base.origin);
  url.searchParams.set("gid", generationId);
  url.searchParams.set("t", createWebhookToken(generationId, secret));
  return url.toString();
}
// A valid token authenticates the URL, not the provider payload. Always re-fetch status
// with the server-side API credentials and the request ID stored on the generation.
