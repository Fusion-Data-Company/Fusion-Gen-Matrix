import "server-only";
import { z } from "zod";
import { assertPublicHttpsUrl, mapToProvider } from "../catalog/server";
import type { ValidatedInput } from "../catalog/types";
import type { ProviderEstimate, ProviderOutput, ProviderResult, ProviderStatus, SignedUpload } from "./types";

export * from "./types";
const DEFAULT_BASE = "https://api.higgsfield.ai";
const statuses = z.enum(["queued", "in_progress", "completed", "failed", "nsfw", "canceled"]);
const envelope = z.object({
  request_id: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/), status: statuses,
  status_url: z.string().optional(), cancel_url: z.string().optional(),
  error: z.unknown().optional(), payload: z.unknown().optional(),
}).passthrough();
const uploadTypes = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "video/mp4", "audio/wav", "audio/x-wav"]);
const requestIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
const errorMessages: Record<number, string> = {
  400: "The provider rejected this request or its concurrency limit was reached.",
  401: "The media provider credentials were not accepted.",
  403: "The media provider account needs sufficient credits or model access.",
  404: "The model or request is unavailable to this provider account.",
  422: "The provider rejected the parameters or an idempotency key was reused with different input.",
  423: "This model is temporarily blocked.",
  429: "The provider rate limit was reached. Try again shortly.",
  503: "The model is temporarily unavailable.",
};
export class HiggsfieldError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly ambiguous: boolean;
  readonly correlationId?: string;
  constructor(message: string, options: { code?: string; status?: number; ambiguous?: boolean; correlationId?: string } = {}) {
    super(message); this.name = "HiggsfieldError";
    this.code = options.code ?? "PROVIDER_ERROR"; this.status = options.status;
    this.ambiguous = options.ambiguous ?? false; this.correlationId = options.correlationId;
  }
}
interface ClientOptions {
  credentials: string; baseUrl?: string; fetch?: typeof fetch;
  timeoutMs?: number; maxAttempts?: number; retryBaseMs?: number; retryDeadlineMs?: number;
}
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function optionalNumber(value: unknown): number | undefined { return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined; }
function normalizeOutputs(data: Record<string, unknown>): ProviderOutput[] {
  const source = { ...data, ...record(data.payload) };
  const output: ProviderOutput[] = [];
  const add = (value: unknown, kind: ProviderOutput["kind"], name?: string) => {
    const item = typeof value === "string" ? { url: value } : record(value);
    if (typeof item.url !== "string") return;
    let url: string;
    try { url = assertPublicHttpsUrl(item.url); } catch { throw new HiggsfieldError("The provider returned an invalid output URL.", { code: "INVALID_PROVIDER_RESPONSE" }); }
    if (output.some((existing) => existing.url === url && existing.kind === kind)) return;
    output.push({ kind, url, name, contentType: typeof item.content_type === "string" ? item.content_type : undefined,
      width: optionalNumber(item.width), height: optionalNumber(item.height), durationSec: optionalNumber(item.duration ?? item.duration_seconds) });
  };
  if (Array.isArray(source.images)) source.images.forEach((item) => add(item, "image"));
  if (source.image) add(source.image, "image");
  if (Array.isArray(source.videos)) source.videos.forEach((item) => add(item, "video"));
  if (source.video) add(source.video, "video");
  if (Array.isArray(source.audios)) source.audios.forEach((item) => add(item, "audio"));
  if (source.audio) add(source.audio, "audio");
  for (const key of ["zip", "mov", "jsx", "fbx", "ply"]) if (source[key]) add(source[key], key === "mov" ? "video" : "artifact", key);
  return output;
}
/**
 * Official shared contracts: https://docs.higgsfield.ai/docs/llms.txt
 * No provider request is made during construction. No logging of keys, payloads, or signed URLs.
 */
export class HiggsfieldClient {
  readonly baseUrl: string;
  private readonly credentials: string;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly retryBaseMs: number;
  private readonly retryDeadlineMs: number;
  constructor(options: ClientOptions) {
    if (!/^[^\s:]+:[^\s:]+$/.test(options.credentials)) throw new HiggsfieldError("Set HF_CREDENTIALS as key_id:key_secret.", { code: "PROVIDER_NOT_CONFIGURED" });
    const base = new URL(options.baseUrl ?? DEFAULT_BASE);
    if (base.origin !== DEFAULT_BASE || (base.pathname !== "/" && base.pathname !== "") || base.search || base.hash || base.username || base.password) throw new HiggsfieldError("Use the documented https://api.higgsfield.ai API origin.", { code: "INVALID_PROVIDER_ORIGIN" });
    this.baseUrl = base.origin; this.credentials = options.credentials; this.fetcher = options.fetch ?? fetch;
    this.timeoutMs = Math.min(30000, Math.max(1, options.timeoutMs ?? 12000));
    this.maxAttempts = Math.min(4, Math.max(1, options.maxAttempts ?? 3));
    this.retryBaseMs = Math.min(2000, Math.max(0, options.retryBaseMs ?? 250));
    this.retryDeadlineMs = Math.min(60000, Math.max(1, options.retryDeadlineMs ?? 30000));
  }
  private endpoint(path: string): URL {
    if (!/^[A-Za-z0-9._/-]+$/.test(path) || path.startsWith("/") || path.split("/").some((segment) => segment === "." || segment === "..")) throw new HiggsfieldError("Invalid provider endpoint.", { code: "INVALID_PROVIDER_ENDPOINT" });
    return new URL("/" + path, this.baseUrl);
  }
  private requestUrl(requestId: string, operation: "status" | "cancel", returnedUrl?: string): URL {
    const parsed = requestIdSchema.safeParse(requestId);
    if (!parsed.success) throw new HiggsfieldError("Invalid provider request identifier.", { code: "INVALID_REQUEST_ID" });
    const expected = this.endpoint("requests/" + requestId + "/" + operation);
    if (!returnedUrl) return expected;
    const received = new URL(returnedUrl);
    if (received.origin !== expected.origin || received.pathname !== expected.pathname || received.username || received.password || received.hash || received.search) throw new HiggsfieldError("The provider returned an unexpected request URL.", { code: "INVALID_PROVIDER_RESPONSE" });
    return received;
  }
  private async request(url: URL, method: "GET" | "POST", body: Record<string, unknown> | undefined, options: { idempotencyKey?: string; retry?: boolean; generation?: boolean } = {}): Promise<{ data: unknown; correlationId?: string; status: number }> {
    const started = Date.now();
    let lastError: HiggsfieldError | undefined;
    let priorAmbiguousFailure = false;
    const serialized = body === undefined ? undefined : JSON.stringify(body);
    for (let attempt = 0; attempt < (options.retry ? this.maxAttempts : 1); attempt++) {
      const remaining = this.retryDeadlineMs - (Date.now() - started);
      if (remaining <= 0) break;
      let response: Response;
      try {
        response = await this.fetcher(url.toString(), {
          method, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(Math.min(this.timeoutMs, remaining)),
          headers: { Authorization: "Key " + this.credentials, ...(serialized ? { "Content-Type": "application/json" } : {}),
            ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}) },
          body: serialized,
        });
      } catch {
        priorAmbiguousFailure ||= Boolean(options.generation);
        lastError = new HiggsfieldError("The provider response was interrupted. The submission outcome must be reconciled using the same idempotency key.", { code: "PROVIDER_NETWORK_ERROR", ambiguous: options.generation ?? false });
        if (!options.retry || attempt + 1 >= this.maxAttempts) throw lastError;
        await this.backoff(attempt, started);
        continue;
      }
      const correlationId = response.headers.get("X-Correlation-ID") ?? undefined;
      if (!response.ok) {
        // Provider error bodies can echo submitted content. Do not surface or log them.
        const retryable = response.status === 429 || response.status >= 500;
        priorAmbiguousFailure ||= Boolean(options.generation && response.status >= 500);
        lastError = new HiggsfieldError(errorMessages[response.status] ?? "The media provider could not complete this request.", {
          code: response.status === 429 ? "PROVIDER_RATE_LIMIT" : "PROVIDER_HTTP_ERROR",
          status: response.status, ambiguous: priorAmbiguousFailure, correlationId,
        });
        try { await response.body?.cancel(); } catch { /* Error details remain intentionally private. */ }
        if (retryable && options.retry && attempt + 1 < this.maxAttempts) { await this.backoff(attempt, started); continue; }
        throw lastError;
      }
      if (response.status === 202 || response.status === 204) {
        let text: string;
        try { text = await response.text(); } catch { throw new HiggsfieldError("The provider response body was interrupted.", { code: "INVALID_PROVIDER_RESPONSE", ambiguous: options.generation, correlationId }); }
        if (!text.trim()) return { data: {}, correlationId, status: response.status };
        try { return { data: JSON.parse(text), correlationId, status: response.status }; }
        catch { throw new HiggsfieldError("The provider returned an unreadable response.", { code: "INVALID_PROVIDER_RESPONSE", ambiguous: options.generation, correlationId }); }
      }
      try { return { data: await response.json(), correlationId, status: response.status }; }
      catch { throw new HiggsfieldError("The provider returned an unreadable response.", { code: "INVALID_PROVIDER_RESPONSE", ambiguous: options.generation, correlationId }); }
    }
    throw lastError ?? new HiggsfieldError("The provider retry deadline was exceeded.", { code: "PROVIDER_TIMEOUT", ambiguous: options.generation });
  }
  private async backoff(attempt: number, started: number): Promise<void> {
    const delay = Math.min(this.retryBaseMs * 2 ** attempt * (0.75 + Math.random() * 0.5), this.retryDeadlineMs - (Date.now() - started));
    if (delay > 0) await new Promise<void>((resolve) => setTimeout(resolve, delay));
  }
  private normalize(data: unknown, correlationId?: string, submitted = false): ProviderResult {
    const parsed = envelope.safeParse(data);
    if (!parsed.success) throw new HiggsfieldError("The provider returned an invalid request status.", { code: "INVALID_PROVIDER_RESPONSE", ambiguous: submitted, correlationId });
    const entry = parsed.data;
    let statusUrl: string | undefined; let cancelUrl: string | undefined;
    try {
      if (entry.status_url) statusUrl = this.requestUrl(entry.request_id, "status", entry.status_url).toString();
      if (entry.cancel_url) cancelUrl = this.requestUrl(entry.request_id, "cancel", entry.cancel_url).toString();
    } catch { throw new HiggsfieldError("The provider returned an unexpected request URL.", { code: "INVALID_PROVIDER_RESPONSE", ambiguous: submitted, correlationId }); }
    const status: ProviderStatus = entry.status;
    let outputs: ProviderOutput[];
    try { outputs = normalizeOutputs(entry); } catch { throw new HiggsfieldError("The provider returned unusable output information.", { code: "INVALID_PROVIDER_RESPONSE", ambiguous: submitted, correlationId }); }
    return { requestId: entry.request_id, status, outputs, statusUrl, cancelUrl, correlationId,
      error: status === "failed" ? "Generation failed at the provider." : status === "nsfw" ? "Blocked by the content filter." : undefined };
  }
  async submit(input: ValidatedInput, options: { idempotencyKey: string; webhookUrl?: string }): Promise<ProviderResult> {
    if (!/^[\x21-\x7e]{1,255}$/.test(options.idempotencyKey)) throw new HiggsfieldError("A persisted idempotency key is required.", { code: "INVALID_IDEMPOTENCY_KEY" });
    const mapped = mapToProvider(input);
    const url = this.endpoint(mapped.path);
    if (options.webhookUrl) url.searchParams.set("hf_webhook", assertPublicHttpsUrl(options.webhookUrl));
    const response = await this.request(url, "POST", mapped.body, { idempotencyKey: options.idempotencyKey, retry: true, generation: true });
    return this.normalize(response.data, response.correlationId, true);
  }
  async status(requestId: string, statusUrl?: string): Promise<ProviderResult> {
    const response = await this.request(this.requestUrl(requestId, "status", statusUrl), "GET", undefined, { retry: true });
    const result = this.normalize(response.data, response.correlationId);
    if (result.requestId !== requestId) throw new HiggsfieldError("The provider returned a different request.", { code: "INVALID_PROVIDER_RESPONSE" });
    return result;
  }
  async cancel(requestId: string, cancelUrl?: string): Promise<ProviderResult> {
    const response = await this.request(this.requestUrl(requestId, "cancel", cancelUrl), "POST", undefined);
    if (response.status === 202) return { requestId, status: "canceled", outputs: [], correlationId: response.correlationId };
    return this.normalize(response.data, response.correlationId);
  }
  async estimate(input: ValidatedInput): Promise<ProviderEstimate> {
    const mapped = mapToProvider(input);
    const response = await this.request(this.endpoint("estimate/" + mapped.path), "POST", mapped.body, { retry: true });
    const data = record(response.data);
    const usd = typeof data.usd === "string" && /^\d+(\.\d+)?$/.test(data.usd) ? Number(data.usd) : NaN;
    if (!Number.isFinite(usd) || usd < 0 || typeof data.credits !== "string") throw new HiggsfieldError("The provider did not return a valid price estimate.", { code: "INVALID_PROVIDER_RESPONSE" });
    return { usd, providerCredits: data.credits, correlationId: response.correlationId };
  }
  async signedUpload(contentType: string): Promise<SignedUpload> {
    if (!uploadTypes.has(contentType)) throw new HiggsfieldError("Choose a JPEG, PNG, WebP, GIF, MP4, or WAV file.", { code: "UNSUPPORTED_UPLOAD_TYPE" });
    const response = await this.request(this.endpoint("files/generate-upload-url"), "POST", { content_type: contentType });
    const schema = z.object({ upload_url: z.string(), public_url: z.string(), content_type: z.string(), upload_headers: z.record(z.string(), z.string()) });
    const parsed = schema.safeParse(response.data);
    if (!parsed.success || parsed.data.content_type !== contentType) throw new HiggsfieldError("The provider returned invalid upload instructions.", { code: "INVALID_PROVIDER_RESPONSE" });
    for (const [key, value] of Object.entries(parsed.data.upload_headers)) {
      if (key.toLowerCase() === "content-type" && value !== contentType) throw new HiggsfieldError("The upload content type does not match.", { code: "INVALID_PROVIDER_RESPONSE" });
      if (!/^[!#$%&'*+.^_\x60|~0-9a-z-]+$/i.test(key) || /[\r\n]/.test(value) || ["authorization", "cookie", "proxy-authorization", "host"].includes(key.toLowerCase())) throw new HiggsfieldError("The provider returned unsupported upload headers.", { code: "INVALID_PROVIDER_RESPONSE" });
    }
    return { uploadUrl: assertPublicHttpsUrl(parsed.data.upload_url), publicUrl: assertPublicHttpsUrl(parsed.data.public_url), contentType, headers: parsed.data.upload_headers };
  }
}
