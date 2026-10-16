import "server-only";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { repository } from "@/lib/db/repository";

function requestHost(request: Request) {
  const value = request.headers.get("host") || new URL(request.url).host;
  try { return new URL("http://" + value); } catch { throw new AppError("INVALID_HOST", "Invalid request host.", 400); }
}
export function assertLocalPreview(request: Request) {
  const env = getEnv();
  const host = requestHost(request);
  const configured = new URL(env.APP_URL);
  if (env.APP_MODE !== "demo" || !["127.0.0.1", "localhost", "[::1]"].includes(host.hostname) ||
      !["127.0.0.1", "localhost", "[::1]"].includes(configured.hostname) || host.port !== configured.port) {
    throw new AppError("PREVIEW_UNAVAILABLE", "Local preview is available only on this computer.", 404);
  }
}
export function assertSameOrigin(request: Request) {
  const env = getEnv();
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (!origin || site === "cross-site") throw new AppError("INVALID_ORIGIN", "Open the studio and try again.", 403);
  let source: URL;
  try { source = new URL(origin); } catch { throw new AppError("INVALID_ORIGIN", "Invalid request origin.", 403); }
  const host = requestHost(request);
  if (env.APP_MODE === "demo") {
    assertLocalPreview(request);
    if (source.host !== host.host || !["http:", "https:"].includes(source.protocol)) {
      throw new AppError("INVALID_ORIGIN", "Open the studio and try again.", 403);
    }
  } else {
    const expected = new URL(env.APP_URL);
    if (source.origin !== expected.origin || host.host !== expected.host) {
      throw new AppError("INVALID_ORIGIN", "Open the studio and try again.", 403);
    }
  }
}
export function requestIp(request: Request) {
  // A direct caller can forge forwarding headers. Only trust an explicitly configured reverse proxy.
  if (process.env.TRUST_PROXY !== "true" && process.env.VERCEL !== "1") return "direct";
  const candidate = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  return isIP(candidate) ? candidate : "unknown";
}
export async function rateLimit(scope: string, key: string, limit: number, windowSeconds: number) {
  const now = Date.now();
  const id = createHash("sha256").update(scope + ":" + key).digest("hex");
  return repository().transaction(async tx => {
    const existing = await tx.get("rate_limits", id);
    const active = existing && Date.parse(existing.expiresAt) > now;
    const count = active ? existing.count : 0;
    if (count >= limit) throw new AppError("RATE_LIMITED", "Too many requests. Please try again later.", 429);
    const expiresAt = active ? existing.expiresAt : new Date(now + windowSeconds * 1000).toISOString();
    const record = { id, count: count + 1, expiresAt, expiresAtDate: new Date(expiresAt) };
    await tx.put("rate_limits", record);
  });
}
export function safeErrorResponse(error: unknown) {
  if (error instanceof AppError) return Response.json({ error: error.message, code: error.code }, { status: error.status });
  return Response.json({ error: "This service is temporarily unavailable. Please try again.", code: "SERVICE_UNAVAILABLE" }, { status: 503 });
}
