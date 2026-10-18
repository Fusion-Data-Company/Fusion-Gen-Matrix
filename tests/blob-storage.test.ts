import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BlobNotFoundError, type GetBlobResult } from "@vercel/blob";
import { getEnv, capabilityStatus } from "../lib/env";
import { MediaService, consumeBounded } from "../lib/storage";
import { VercelBlobMediaStore } from "../lib/storage/blob";
import { createLiveMediaStore } from "../lib/storage/provider";
import { R2MediaStore } from "../lib/storage/store";
import { GET } from "../app/api/media/[...key]/route";

const sdk = vi.hoisted(() => ({ put: vi.fn(), get: vi.fn(), head: vi.fn(), del: vi.fn() }));
const gate = vi.hoisted(() => ({ user: null as { id: string } | null, get: vi.fn(), find: vi.fn() }));
vi.mock("@vercel/blob", async importOriginal => ({ ...await importOriginal<typeof import("@vercel/blob")>(), ...sdk }));
vi.mock("@/lib/auth/server", () => ({ currentUser: async () => gate.user }));
vi.mock("@/lib/db/repository", () => ({
 repository: () => ({ read: (run: (tx: typeof gate) => Promise<unknown>) => run(gate) })
}));

const key = "u/owner/uploads/upload1.png";
const outputKey = "u/owner/generations/job1/0.png";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
function liveFixture() {
 vi.stubEnv("APP_MODE", "live");
 vi.stubEnv("APP_URL", "https://matrix.example.test");
 vi.stubEnv("MEDIA_STORAGE_PROVIDER", "vercel-blob");
 vi.stubEnv("DATABASE_PROVIDER", "postgres");
 vi.stubEnv("DATABASE_URL", "postgresql://fixture:fixture@db.example.invalid/fusion_gen_matrix");
 for (const name of ["MONGODB_URI", "AUTH_SECRET", "AUTH_RESEND_KEY", "EMAIL_FROM", "HF_CREDENTIALS", "HF_WEBHOOK_SECRET", "CRON_SECRET"]) vi.stubEnv(name, "isolated-test-fixture-at-least-32-characters");
 vi.stubEnv("HF_CREDENTIALS", "fixture-id:fixture-secret");
 vi.stubEnv("BLOB_READ_WRITE_TOKEN", "isolated-blob-test-fixture");
}
function blobResult(pathname = key, bytes: Uint8Array = png, extra: Record<string, string> = {}): GetBlobResult {
 return {
  statusCode: 200, stream: new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } }),
  headers: new Headers({ "content-length": String(bytes.length), ...extra }),
  blob: { pathname, url: "https://fixture.private.blob.vercel-storage.com/" + pathname, downloadUrl: "",
   contentDisposition: "", cacheControl: "", uploadedAt: new Date(0), etag: "fixture", size: bytes.length, contentType: "image/png" }
 };
}
function download(pathname: string, range?: string) {
 return GET(new Request("https://matrix.example.test/api/media/" + pathname, { headers: range ? { Range: range } : {} }), { params: Promise.resolve({ key: pathname.split("/") }) });
}
beforeEach(() => {
 vi.unstubAllEnvs();
 for (const fn of Object.values(sdk)) fn.mockReset();
 gate.get.mockReset(); gate.find.mockReset(); gate.user = { id: "owner" };
 for (const name of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "BLOB_STORE_ID", "VERCEL_OIDC_TOKEN", "VERCEL_BLOB_API_URL", "NEXT_PUBLIC_VERCEL_BLOB_API_URL"]) vi.stubEnv(name, undefined);
 liveFixture();
 vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected network call in isolated storage tests"); }));
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("storage provider selection", () => {
 it("uses private Vercel Blob by default", () => {
  vi.stubEnv("MEDIA_STORAGE_PROVIDER", undefined);
  expect(getEnv().MEDIA_STORAGE_PROVIDER).toBe("vercel-blob");
  expect(createLiveMediaStore(getEnv().MEDIA_STORAGE_PROVIDER)).toBeInstanceOf(VercelBlobMediaStore);
 });
 it("allows an explicit legacy R2 selection only with its configuration", () => {
  vi.stubEnv("MEDIA_STORAGE_PROVIDER", "r2");
  expect(() => getEnv()).toThrow("R2_ACCOUNT_ID");
  for (const name of ["R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]) vi.stubEnv(name, "isolated-test-fixture");
  vi.stubEnv("R2_ACCOUNT_ID", "a".repeat(32)); vi.stubEnv("R2_BUCKET", "matrix-fixture");
  expect(getEnv().MEDIA_STORAGE_PROVIDER).toBe("r2");
  expect(createLiveMediaStore(getEnv().MEDIA_STORAGE_PROVIDER)).toBeInstanceOf(R2MediaStore);
 });
 it("accepts Blob without any R2 variables and reports storage capability", () => {
  expect(getEnv().MEDIA_STORAGE_PROVIDER).toBe("vercel-blob");
  expect(createLiveMediaStore(getEnv().MEDIA_STORAGE_PROVIDER)).toBeInstanceOf(VercelBlobMediaStore);
  expect(capabilityStatus().storage).toBe(true);
  expect(sdk.get).not.toHaveBeenCalled();
 });
 it("requires either existing token auth or the complete OIDC pair", () => {
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
  expect(() => getEnv()).toThrow("BLOB_READ_WRITE_TOKEN or BLOB_STORE_ID with VERCEL_OIDC_TOKEN");
  vi.stubEnv("BLOB_STORE_ID", "store_fixture");
  expect(() => getEnv()).toThrow("VERCEL_OIDC_TOKEN");
  vi.stubEnv("VERCEL_OIDC_TOKEN", "isolated-oidc-fixture");
  expect(capabilityStatus().storage).toBe(true);
 });
 it("rejects an unknown provider and custom live Blob API endpoints", () => {
  vi.stubEnv("MEDIA_STORAGE_PROVIDER", "public");
  expect(() => getEnv()).toThrow("MEDIA_STORAGE_PROVIDER");
  vi.stubEnv("VERCEL_BLOB_API_URL", "https://untrusted.example.test");
  expect(() => createLiveMediaStore("vercel-blob")).toThrow("Custom Blob API endpoints");
 });
 it("does not enable storage in showcase mode", () => {
  vi.stubEnv("APP_MODE", "showcase"); vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
  expect(capabilityStatus().storage).toBe(false);
 });
});

describe("private Blob adapter", () => {
 it("stores verified uploads under private deterministic keys and keeps app media URLs", async () => {
  const service = new MediaService({ mode: "live", store: new VercelBlobMediaStore(), newId: () => "upload1" });
  const upload = await service.saveUpload("owner", new File([png], "sample.png", { type: "image/png" }));
  expect(upload).toMatchObject({ r2Key: key, url: "/api/media/" + key, bytes: png.length });
  expect(sdk.put).toHaveBeenCalledWith(key, expect.any(Buffer), expect.objectContaining({
   access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "image/png", cacheControlMaxAge: 60, multipart: false
  }));
  expect(sdk.put.mock.calls[0][2]).not.toHaveProperty("token");
  expect(sdk.put.mock.calls[0][2]).not.toHaveProperty("oidcToken");
 });
 it("uses multipart for larger media while preserving the private key", async () => {
  await new VercelBlobMediaStore().put("u/owner/uploads/video.mp4", new Uint8Array(6 * 1024 * 1024), "video/mp4");
  expect(sdk.put.mock.calls[0][2]).toMatchObject({ access: "private", multipart: true, addRandomSuffix: false });
 });
 it("rejects invalid paths and content types before SDK calls", async () => {
  const store = new VercelBlobMediaStore();
  await expect(store.put("../private", png, "image/png")).rejects.toMatchObject({ status: 404 });
  await expect(store.put(key, png, "image/jpeg")).rejects.toMatchObject({ status: 415 });
  await expect(store.read(key, "bytes=0-1,4-5")).rejects.toMatchObject({ status: 416 });
  expect(sdk.put).not.toHaveBeenCalled(); expect(sdk.get).not.toHaveBeenCalled();
 });
 it("streams private reads through the SDK without caching or exposing its URL", async () => {
  sdk.get.mockResolvedValueOnce(blobResult());
  const result = await new VercelBlobMediaStore().read(key);
  expect(result).toMatchObject({ contentType: "image/png", status: 200, contentLength: png.length });
  expect(Buffer.from(await consumeBounded(result.body, 1000))).toEqual(png);
  expect(sdk.get).toHaveBeenCalledWith(key, expect.objectContaining({ access: "private", useCache: false }));
  expect(result).not.toHaveProperty("url"); expect(sdk.head).not.toHaveBeenCalled();
 });
 it.each(["bytes=2-5", "bytes=-4", "bytes=6-", "bytes=6-99"])("supports normalized byte ranges: %s", async range => {
  const bytes = Buffer.from("0123456789");
  const start = range === "bytes=2-5" ? 2 : 6, end = range === "bytes=2-5" ? 5 : 9;
  sdk.head.mockResolvedValueOnce({ size: bytes.length });
  sdk.get.mockResolvedValueOnce(blobResult(key, bytes.subarray(start, end + 1), { "content-range": `bytes ${start}-${end}/10` }));
  const result = await new VercelBlobMediaStore().read(key, range);
  expect(result).toMatchObject({ status: 206, contentRange: `bytes ${start}-${end}/10`, contentLength: 4 });
  expect(sdk.get.mock.calls[0][1].headers).toEqual({ Range: `bytes=${start}-${end}` });
  expect(Buffer.from(await consumeBounded(result.body, 20))).toEqual(bytes.subarray(start, end + 1));
 });
 it("rejects an out-of-bounds range without fetching a body", async () => {
  sdk.head.mockResolvedValueOnce({ size: 10 });
  await expect(new VercelBlobMediaStore().read(key, "bytes=10-")).rejects.toMatchObject({ status: 416 });
  expect(sdk.get).not.toHaveBeenCalled();
 });
 it("handles an origin ignoring Range as a full 200 response", async () => {
  sdk.head.mockResolvedValueOnce({ size: png.length }); sdk.get.mockResolvedValueOnce(blobResult());
  const result = await new VercelBlobMediaStore().read(key, "bytes=0-7");
  expect(result).toMatchObject({ status: 200, contentLength: png.length });
  expect(result.contentRange).toBeUndefined();
 });
 it("rejects inconsistent partial responses and cancels their stream", async () => {
  sdk.head.mockResolvedValueOnce({ size: 10 });
  const response = blobResult(key, png.subarray(0, 4), { "content-range": "bytes 4-7/10" });
  const cancel = vi.spyOn(response.stream!, "cancel");
  sdk.get.mockResolvedValueOnce(response);
  await expect(new VercelBlobMediaStore().read(key, "bytes=0-3")).rejects.toMatchObject({ status: 503 });
  expect(cancel).toHaveBeenCalled();
 });
 it("maps missing blobs and sanitizes SDK failures", async () => {
  const store = new VercelBlobMediaStore();
  sdk.get.mockResolvedValueOnce(null);
  await expect(store.read(key)).rejects.toMatchObject({ status: 404, message: "Media not found." });
  sdk.head.mockRejectedValueOnce(new BlobNotFoundError());
  await expect(store.read(key, "bytes=0-7")).rejects.toMatchObject({ status: 404 });
  sdk.put.mockRejectedValueOnce(new Error("private URL and credential"));
  await expect(store.put(key, png, "image/png")).rejects.toMatchObject({ status: 503, message: "The private media store could not save this file." });
  sdk.get.mockRejectedValueOnce(new Error("private URL and credential"));
  await expect(store.read(key)).rejects.toMatchObject({ status: 503, message: "The private media store could not read this file." });
 });
 it("deletes by validated object path and treats already missing as complete", async () => {
  const store = new VercelBlobMediaStore();
  await store.remove(key);
  expect(sdk.del).toHaveBeenCalledWith(key, expect.objectContaining({ abortSignal: expect.any(AbortSignal) }));
  sdk.del.mockRejectedValueOnce(new BlobNotFoundError()); await store.remove(key);
  sdk.del.mockRejectedValueOnce(new Error("credential"));
  await expect(store.remove(key)).rejects.toMatchObject({ status: 503, message: "The private media store could not remove this file." });
 });
});

describe("media route with optional Blob storage", () => {
 it("delivers an owner's ready upload with private headers", async () => {
  gate.find.mockResolvedValueOnce([{ userId: "owner", r2Key: key, status: "ready" }]);
  sdk.get.mockResolvedValueOnce(blobResult());
  const response = await download(key);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(Buffer.from(await response.arrayBuffer())).toEqual(png);
  expect(gate.find).toHaveBeenCalledWith("uploads", { userId: "owner", r2Key: key }, 1);
 });
 it.each([null, { id: "other" }])("blocks another user or an anonymous upload download before Blob access: %j", async user => {
  gate.user = user;
  expect((await download(key)).status).toBe(404);
  expect(sdk.get).not.toHaveBeenCalled(); expect(gate.find).not.toHaveBeenCalled();
 });
 it("blocks pending uploads before Blob access", async () => {
  gate.find.mockResolvedValueOnce([{ status: "pending" }]);
  expect((await download(key)).status).toBe(404); expect(sdk.get).not.toHaveBeenCalled();
 });
 it("streams the owner's completed generation with byte-range headers", async () => {
  gate.get.mockResolvedValueOnce({ userId: "owner", status: "completed", isPublic: false, outputs: [{ r2Key: outputKey }] });
  sdk.head.mockResolvedValueOnce({ size: png.length });
  sdk.get.mockResolvedValueOnce(blobResult(outputKey, png.subarray(0, 8), { "content-range": `bytes 0-7/${png.length}` }));
  const response = await download(outputKey, "bytes=0-7");
  expect(response.status).toBe(206); expect(response.headers.get("content-range")).toBe(`bytes 0-7/${png.length}`);
  expect(Buffer.from(await response.arrayBuffer())).toEqual(png.subarray(0, 8));
 });
 it.each([
  { viewer: "other", userId: "owner", status: "completed" },
  { viewer: "owner", userId: "owner", status: "in_progress" },
  { viewer: "owner", userId: "other", status: "completed" },
  { viewer: "owner", userId: "owner", status: "completed", deletedAt: "2026-10-18T00:00:00Z" }
 ])("preserves generation ownership and completion checks: %j", async fixture => {
  gate.user = { id: fixture.viewer };
  gate.get.mockResolvedValueOnce({ ...fixture, isPublic: false, outputs: [{ r2Key: outputKey }] });
  expect((await download(outputKey)).status).toBe(404); expect(sdk.get).not.toHaveBeenCalled();
 });
 it("does not expose an unlisted generation output", async () => {
  gate.get.mockResolvedValueOnce({ userId: "owner", status: "completed", isPublic: false, outputs: [{ r2Key: outputKey.replace("0.png", "1.png") }] });
  expect((await download(outputKey)).status).toBe(404); expect(sdk.get).not.toHaveBeenCalled();
 });
});

