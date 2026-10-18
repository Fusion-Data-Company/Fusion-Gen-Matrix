import "server-only";
import { VercelBlobMediaStore } from "./blob";
import { createR2Store, type MediaStore } from "./store";

export type MediaStorageProvider = "r2" | "vercel-blob";

/** Called only after live configuration validation. Private Vercel Blob is the default. */
export function createLiveMediaStore(provider: MediaStorageProvider): MediaStore {
 if (provider === "r2") return createR2Store();
 if (provider === "vercel-blob") {
  if (process.env.VERCEL_BLOB_API_URL || process.env.NEXT_PUBLIC_VERCEL_BLOB_API_URL) {
   throw new Error("Custom Blob API endpoints are disabled for live media storage.");
  }
  return new VercelBlobMediaStore();
 }
 throw new Error("Unknown media storage provider.");
}
