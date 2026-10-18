import "server-only";
import { BlobNotFoundError, del, get, head, put } from "@vercel/blob";
import { AppError } from "../errors";
import type { MediaResponse, MediaStore } from "./store";
import { assertMediaKey, contentTypeForKey, parseMediaRange } from "./validation";

type BlobClient = Pick<typeof import("@vercel/blob"), "put" | "get" | "head" | "del">;
const unavailable = (action: string) => new AppError("MEDIA_STORAGE_FAILED", `The private media store could not ${action} this file.`, 503);

/** Server-only private Blob adapter. The SDK resolves and refreshes its own auth. */
export class VercelBlobMediaStore implements MediaStore {
 constructor(private readonly client: BlobClient = { put, get, head, del }) {}

 async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
  assertMediaKey(key);
  if (contentTypeForKey(key) !== contentType) throw new AppError("MEDIA_TYPE_MISMATCH", "The media type does not match its stored path.", 415);
  try {
   await this.client.put(key, Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), {
    access: "private", contentType, addRandomSuffix: false, allowOverwrite: true,
    cacheControlMaxAge: 60, multipart: bytes.byteLength > 5 * 1024 * 1024,
    abortSignal: AbortSignal.timeout(120000)
   });
  } catch { throw unavailable("save"); }
 }

 async read(key: string, range?: string): Promise<MediaResponse> {
  assertMediaKey(key);
  if (range && !/^bytes=(?:\d+-\d*|-\d+)$/.test(range)) throw new AppError("INVALID_RANGE", "The requested byte range is unavailable.", 416);
  let response: Awaited<ReturnType<BlobClient["get"]>> = null;
  try {
   const abortSignal = AbortSignal.timeout(120000);
   let requested: ReturnType<typeof parseMediaRange>;
   let total: number | undefined;
   if (range) {
    // Normalize suffix/open ranges and reject out-of-bounds requests before GET.
    const metadata = await this.client.head(key, { abortSignal });
    if (!Number.isSafeInteger(metadata.size) || metadata.size < 0) throw unavailable("read");
    total = metadata.size;
    requested = parseMediaRange(range, total);
   }
   response = await this.client.get(key, {
    access: "private", useCache: false, abortSignal,
    ...(requested ? { headers: { Range: `bytes=${requested.start}-${requested.end}` } } : {})
   });
   if (!response) throw new AppError("MEDIA_NOT_FOUND", "Media not found.", 404);
   if (response.statusCode !== 200 || response.blob.pathname !== key) throw unavailable("read");
   const length = response.headers.get("content-length");
   const contentLength = length === null ? undefined : Number(length);
   if (contentLength !== undefined && (!Number.isSafeInteger(contentLength) || contentLength < 0)) throw unavailable("read");
   const contentRange = response.headers.get("content-range");
   if (contentRange) {
    // SDK 2.8.2 reports statusCode 200 even for upstream 206; validate raw headers.
    if (!requested || contentRange !== `bytes ${requested.start}-${requested.end}/${total}`) throw unavailable("read");
    const expectedLength = requested.end - requested.start + 1;
    if (contentLength !== undefined && contentLength !== expectedLength) throw unavailable("read");
    return { body: response.stream, contentType: contentTypeForKey(key), contentLength: expectedLength, contentRange, status: 206 };
   }
   // HTTP permits an origin to ignore Range and return the full representation.
   if (requested && contentLength !== undefined && contentLength !== total) throw unavailable("read");
   return { body: response.stream, contentType: contentTypeForKey(key), contentLength, status: 200 };
  } catch (error) {
   await response?.stream?.cancel().catch(() => {});
   if (error instanceof AppError) throw error;
   if (error instanceof BlobNotFoundError) throw new AppError("MEDIA_NOT_FOUND", "Media not found.", 404);
   throw unavailable("read");
  }
 }

 async remove(key: string): Promise<void> {
  assertMediaKey(key);
  try { await this.client.del(key, { abortSignal: AbortSignal.timeout(30000) }); }
  catch (error) {
   if (error instanceof BlobNotFoundError) return;
   throw unavailable("remove");
  }
 }
}
