/** Node-only example. Never import this file from an application route or client component. */
import { createHiggsfieldClient } from "@higgsfield/client/v2";
import { loadEnvFile } from "node:process";
import { lstat, mkdir, open, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MODEL = "bytedance/seedance-2.5/text-to-video";
export const INPUT = Object.freeze({
  prompt: "A cinematic scene at sunset", duration: 5, resolution: "720p", aspect_ratio: "16:9",
});
const API_ORIGIN = "https://api.higgsfield.ai";
const EXAMPLE_DIR = path.dirname(fileURLToPath(import.meta.url));
const RUN_DIR = path.resolve(EXAMPLE_DIR, "../../.data/higgsfield-sdk");
const RECEIPT = "seedance-attempt.json";
const ID = /^[A-Za-z0-9_-]{1,200}$/;
type State = "queued" | "in_progress" | "completed" | "failed" | "canceled" | "moderated";
export class ExampleError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = "ExampleError"; }
}
export interface Api {
  estimate(): Promise<number>;
  subscribe(idempotencyKey: string): Promise<unknown>;
  status(requestId: string): Promise<unknown>;
  verify(url: string): Promise<void>;
}
interface Receipt {
  model: typeof MODEL;
  input: typeof INPUT;
  startedAt: string;
  idempotencyKey: string;
  approvedMaxUsd: number;
  estimatedUsd: number;
  status: State | "submission_attempted";
  requestId?: string;
  videoUrl?: string;
  verified?: boolean;
  updatedAt?: string;
  errorCode?: string;
}
function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function estimateUsd(value: unknown): number {
  const estimate = object(value);
  let usd = estimate.usd;
  if (!Object.hasOwn(estimate, "usd") && estimate.type === "description") {
    // The live model endpoint returns this tariff instead of the billing docs'
    // numeric USD field. Fail closed if its formula or our fixed input changes.
    const description = typeof estimate.pricing_description === "string" ? estimate.pricing_description.trim().replace(/\s+/g, " ") : "";
    const tariff = /^For 16:9 video without video input, your request costs roughly \$\d+(?:\.\d+)? per second of generated video at 480p, \$(\d+(?:\.\d+)?) at 720p, and \$\d+(?:\.\d+)? at 1080p\. Each 1,000 video tokens costs \$(\d+(?:\.\d+)?) at 480p or 720p and \$\d+(?:\.\d+)? at 1080p\. Billable video tokens = ceil\(output height × output width × \(input video duration \+ generated video duration\) × 24 \/ 1024\)\. Image and audio references do not count as video input\. Actual pricing depends on output dimensions and billable duration\. Rates shown are before any applicable customer discount\.$/.exec(description);
    if (!tariff || INPUT.duration !== 5 || INPUT.resolution !== "720p" || INPUT.aspect_ratio !== "16:9" || Object.keys(INPUT).length !== 4) {
      throw new ExampleError("INVALID_ESTIMATE", "The live price formula is unrecognized. No generation was submitted.");
    }
    const tokens = Math.ceil(720 * 1280 * INPUT.duration * 24 / 1024);
    // Use the higher of the two quoted rates, before discounts, rounded UP to
    // a cent. This is a conservative estimate, not a claim of the final charge.
    usd = Math.ceil(Math.max(tokens / 1000 * Number(tariff[2]), INPUT.duration * Number(tariff[1])) * 100) / 100;
  }
  if (!(typeof usd === "number" || (typeof usd === "string" && /^\d+(\.\d+)?$/.test(usd)))) {
    throw new ExampleError("INVALID_ESTIMATE", "Higgsfield did not return a valid USD estimate.");
  }
  const amount = Number(usd);
  if (!Number.isFinite(amount) || amount < 0) throw new ExampleError("INVALID_ESTIMATE", "Higgsfield did not return a valid USD estimate.");
  return amount;
}
function providerErrorCode(error: unknown): string {
  if (error instanceof ExampleError) return error.code;
  const status = object(error).statusCode;
  return typeof status === "number" && Number.isInteger(status) && status >= 400 && status <= 599
    ? `PROVIDER_HTTP_${status}` : "PROVIDER_OR_NETWORK_ERROR";
}
export function publicVideoUrl(value: unknown): string {
  try {
    if (typeof value !== "string") throw new Error();
    const u = new URL(value);
    if (u.protocol !== "https:" || u.username || u.password || u.port || !u.hostname.includes(".") || isIP(u.hostname) || u.hostname.startsWith("[") || /(?:^|\.)(localhost|local|internal|test)$/.test(u.hostname)) throw new Error();
    return u.href;
  } catch { throw new ExampleError("INVALID_VIDEO_URL", "The provider did not return a public HTTPS video URL."); }
}
export function normalize(value: unknown): { status: State; requestId: string; videoUrl?: string } {
  const item = object(value);
  const status = item.status === "nsfw" ? "moderated" : item.status === "cancelled" ? "canceled" : item.status;
  if (!["queued", "in_progress", "completed", "failed", "canceled", "moderated"].includes(String(status)) || typeof item.request_id !== "string" || !ID.test(item.request_id)) {
    throw new ExampleError("INVALID_STATUS", "The provider returned an unrecognized status or request ID; do not resubmit.");
  }
  return { status: status as State, requestId: item.request_id,
    ...(status === "completed" ? { videoUrl: publicVideoUrl(object(item.video).url) } : {}) };
}
async function persist(directory: string, receipt: Receipt) {
  const temporary = path.join(directory, `.receipt-${randomUUID()}.tmp`);
  await writeFile(temporary, JSON.stringify({ ...receipt, updatedAt: new Date().toISOString() }, null, 2) + "\n", { mode: 0o600, flag: "wx" });
  await rename(temporary, path.join(directory, RECEIPT));
}
function terminalError(status: State): ExampleError {
  const messages = { failed: "Generation failed at Higgsfield.", canceled: "The request was canceled.", moderated: "The request was blocked by moderation." };
  return new ExampleError(status.toUpperCase(), messages[status as keyof typeof messages] ?? "The request did not complete.");
}
async function finish(api: Api, directory: string, receipt: Receipt, initial: unknown,
  options: { intervalMs?: number; maxWaitMs?: number; log?: (message: string) => void } = {}) {
  const deadline = Date.now() + (options.maxWaitMs ?? 15 * 60_000);
  let response = initial;
  let lastStatus = "";
  while (true) {
    const result = normalize(response);
    if (receipt.requestId && receipt.requestId !== result.requestId) throw new ExampleError("REQUEST_ID_CHANGED", "The provider returned a different request; do not resubmit.");
    // Persist identity/status before checking media, but never persist an unverified
    // URL: a malformed response could echo sensitive data in its query string.
    receipt.status = result.status;
    receipt.requestId = result.requestId;
    delete receipt.videoUrl;
    delete receipt.verified;
    await persist(directory, receipt);
    if (result.status !== lastStatus) options.log?.(`Request ${result.requestId}: ${result.status}`);
    lastStatus = result.status;
    if (result.status === "completed") {
      await api.verify(result.videoUrl!);
      receipt.videoUrl = result.videoUrl;
      receipt.verified = true;
      delete receipt.errorCode;
      await persist(directory, receipt);
      return result.videoUrl!;
    }
    if (["failed", "canceled", "moderated"].includes(result.status)) throw terminalError(result.status);
    if (Date.now() >= deadline) throw new ExampleError("WAIT_TIMEOUT", "Polling stopped after its time limit. The remote job may still be running; use --resume, never --generate.");
    await new Promise(resolve => setTimeout(resolve, Math.min(options.intervalMs ?? 5_000, Math.max(0, deadline - Date.now()))));
    if (Date.now() >= deadline) throw new ExampleError("WAIT_TIMEOUT", "Polling stopped after its time limit. Use --resume to check the same request.");
    response = await api.status(result.requestId);
  }
}
export async function generateOnce(api: Api, directory: string, maxUsd: number,
  options: { intervalMs?: number; maxWaitMs?: number; log?: (message: string) => void } = {}) {
  if (!Number.isFinite(maxUsd) || maxUsd <= 0) throw new ExampleError("BUDGET_REQUIRED", "Pass the user-approved spending ceiling as --max-usd=<amount>.");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  // A separate process/rerun must not submit a second billable job.
  try { await lstat(path.join(directory, RECEIPT)); throw new ExampleError("ATTEMPT_EXISTS", "A generation attempt already exists. Use --resume; do not delete the receipt to retry."); }
  catch (error) { if (object(error).code !== "ENOENT") throw error; }
  const estimatedUsd = await api.estimate();
  if (!Number.isFinite(estimatedUsd) || estimatedUsd < 0 || estimatedUsd > maxUsd) throw new ExampleError("PRICE_LIMIT", "The live estimate is invalid or exceeds the approved limit. No generation was submitted.");
  const receipt: Receipt = { model: MODEL, input: INPUT, startedAt: new Date().toISOString(), idempotencyKey: randomUUID(), approvedMaxUsd: maxUsd, estimatedUsd, status: "submission_attempted" };
  let lock;
  try { lock = await open(path.join(directory, RECEIPT), "wx", 0o600); }
  catch { throw new ExampleError("ATTEMPT_EXISTS", "Another attempt already exists. No additional job was submitted."); }
  try { await lock.writeFile(JSON.stringify(receipt, null, 2) + "\n"); await lock.sync(); } finally { await lock.close(); }
  try {
    options.log?.(`Submitting one request; live estimate USD ${estimatedUsd}, approved ceiling USD ${maxUsd}.`);
    // The official SDK's only billable call. maxRetries is zero in createApi().
    const response = await api.subscribe(receipt.idempotencyKey);
    return await finish(api, directory, receipt, response, options);
  } catch (error) {
    receipt.errorCode = providerErrorCode(error);
    await persist(directory, receipt);
    throw error;
  }
}
export async function resume(api: Api, directory: string,
  options: { intervalMs?: number; maxWaitMs?: number; log?: (message: string) => void } = {}) {
  let saved: Receipt;
  try { saved = JSON.parse(await readFile(path.join(directory, RECEIPT), "utf8")) as Receipt; }
  catch { throw new ExampleError("NO_RECEIPT", "No usable attempt receipt exists; no request was submitted by this command."); }
  if (saved.model !== MODEL || !saved.requestId || !ID.test(saved.requestId)) throw new ExampleError("UNKNOWN_SUBMISSION", "The earlier submission outcome is unknown. Reconcile it in Higgsfield Requests; do not submit again.");
  // Read-only recovery: no estimate or subscribe call, even after timeout/failure.
  return finish(api, directory, saved, await api.status(saved.requestId), options);
}
async function credentialsFromLocalFile(): Promise<string> {
  const file = path.join(EXAMPLE_DIR, ".env.local");
  try {
    const metadata = await lstat(file);
    if (!metadata.isFile() || metadata.isSymbolicLink() || (metadata.mode & 0o077) !== 0) throw new Error();
    // Ignore inherited/other-provider credentials. This example uses its local file only.
    for (const key of ["HF_CREDENTIALS", "HF_KEY", "HF_API_KEY", "HF_API_SECRET", "HF_SECRET"]) delete process.env[key];
    loadEnvFile(file);
    const credentials = process.env.HF_CREDENTIALS ?? "";
    if (!/^[^\s:]+:[^\s:]+$/.test(credentials) || /YOUR_|KEY_ID|KEY_SECRET/i.test(credentials)) throw new Error();
    return credentials;
  } catch { throw new ExampleError("LOCAL_CREDENTIAL_REQUIRED", "Enter your existing Higgsfield key-id:key-secret in examples/higgsfield/.env.local (HF_CREDENTIALS), with file permissions 600. Never put it in chat or use another provider's key."); }
}
export async function verifyVideo(url: string): Promise<void> {
  const response = await fetch(publicVideoUrl(url), { headers: { Range: "bytes=0-63" }, redirect: "error", signal: AbortSignal.timeout(30_000) });
  if (!response.ok || !response.body) { await response.body?.cancel(); throw new ExampleError("VIDEO_UNREACHABLE", "Generation completed, but the video URL could not be verified. Use --resume; do not regenerate."); }
  const reader = response.body.getReader();
  let prefix = Buffer.alloc(0);
  try {
    while (prefix.length < 12) { const part = await reader.read(); if (part.done) break; prefix = Buffer.concat([prefix, Buffer.from(part.value).subarray(0, 64)]); }
  } finally { await reader.cancel(); }
  const brand = prefix.toString("ascii", 8, 12);
  if (prefix.toString("ascii", 4, 8) !== "ftyp" || !/^(iso[2-9m]|mp4[12]|avc1|M4V |qt  |dash|cmf[cs])$/.test(brand)) throw new ExampleError("NOT_VIDEO", "The completed URL did not return an MP4/MOV file header. Do not regenerate.");
}
function createApi(credentials: string): Api {
  async function jsonRequest(endpoint: string, method: "GET" | "POST", body?: typeof INPUT) {
    const response = await fetch(API_ORIGIN + endpoint, { method, redirect: "error", signal: AbortSignal.timeout(30_000),
      headers: { Authorization: "Key " + credentials, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) { await response.body?.cancel(); throw new ExampleError(`HTTP_${response.status}`, `Higgsfield returned HTTP ${response.status}; no automatic retry was attempted.`); }
    return await response.json() as unknown;
  }
  return {
    async estimate() {
      return estimateUsd(await jsonRequest("/estimate/" + MODEL, "POST", INPUT));
    },
    async subscribe(idempotencyKey) {
      const higgsfield = createHiggsfieldClient({ credentials, baseURL: API_ORIGIN, maxRetries: 0, timeout: 30_000,
        headers: { "Idempotency-Key": idempotencyKey } });
      // SDK 0.2.6's automatic poller does not stop at canceled. Keep subscribe, but
      // persist its request ID first and poll the documented status API ourselves.
      return higgsfield.subscribe(MODEL, { input: INPUT, withPolling: false });
    },
    status(requestId) {
      if (!ID.test(requestId)) throw new ExampleError("INVALID_ID", "The saved request ID is invalid.");
      return jsonRequest(`/requests/${requestId}/status`, "GET");
    },
    async verify(url) {
      if ([credentials, ...credentials.split(":")].some(value => url.includes(value))) throw new ExampleError("INVALID_VIDEO_URL", "The provider returned an unsafe output URL.");
      await verifyVideo(url);
    },
  };
}
export function safeError(error: unknown): string {
  if (error instanceof ExampleError) return `${error.code}: ${error.message}`;
  // SDK/Axios errors may contain authorization headers. Never log the error/stack/body.
  const name = object(error).name;
  const known: Record<string, string> = { AuthenticationError: "Higgsfield rejected the credential.", NotEnoughCreditsError: "The account needs credits or model access. No top-up was attempted.", ValidationError: "Higgsfield rejected the input.", BadInputError: "Higgsfield rejected the input.", TimeoutError: "The request timed out; use --resume if a request ID was saved." };
  // SDK 0.2.6 names its NotEnoughCreditsError "AccountError". Preserve only
  // a validated HTTP status, never its raw message, response data, or headers.
  if (name === "AccountError" && object(error).statusCode === 403) return "HIGGSFIELD_ACCOUNT_REJECTED: Higgsfield rejected the account or available API balance (HTTP 403). No top-up was attempted.";
  const code = providerErrorCode(error);
  if (code.startsWith("PROVIDER_HTTP_")) return `${code}: Higgsfield returned an HTTP error. Check the existing attempt before any further submission.`;
  return typeof name === "string" && Object.hasOwn(known, name) ? known[name] : "PROVIDER_OR_NETWORK_ERROR: Outcome may be unknown. Use --resume or reconcile the saved attempt in Higgsfield Requests; never submit again automatically.";
}
async function main() {
  const args = process.argv.slice(2).filter(arg => arg !== "--");
  const mode = args.find(arg => ["--check", "--estimate", "--generate", "--resume"].includes(arg)) ?? "--check";
  if (args.filter(arg => ["--check", "--estimate", "--generate", "--resume"].includes(arg)).length > 1 || args.some(arg => !["--check", "--estimate", "--generate", "--resume"].includes(arg) && !/^--max-usd=\d+(\.\d+)?$/.test(arg))) throw new ExampleError("USAGE", "Use --check, --estimate, --generate --max-usd=<approved amount>, or --resume.");
  const credentials = await credentialsFromLocalFile();
  if (mode === "--check") { console.log("Local Higgsfield credential format is valid. No API call made; account access remains unverified."); return; }
  const api = createApi(credentials);
  if (mode === "--estimate") { console.log(JSON.stringify({ model: MODEL, input: INPUT, estimatedUsd: await api.estimate(), generationSubmitted: false }, null, 2)); return; }
  const options = { log: (message: string) => console.log(message) };
  const url = mode === "--resume" ? await resume(api, RUN_DIR, options) : await generateOnce(api, RUN_DIR, Number(args.find(arg => arg.startsWith("--max-usd="))?.split("=")[1]), options);
  console.log("Completed video URL (HTTP response and MP4/MOV header verified): " + url);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(safeError(error)); process.exitCode = 1; });
}
