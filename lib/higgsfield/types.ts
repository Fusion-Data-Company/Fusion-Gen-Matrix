export type ProviderStatus = "queued" | "in_progress" | "completed" | "failed" | "nsfw" | "canceled";
export interface ProviderOutput {
  kind: "image" | "video" | "audio" | "artifact"; url: string;
  contentType?: string; width?: number; height?: number; durationSec?: number; name?: string;
}
export interface ProviderResult {
  requestId: string; status: ProviderStatus; outputs: ProviderOutput[]; error?: string;
  statusUrl?: string; cancelUrl?: string; correlationId?: string;
}
export interface SignedUpload { uploadUrl: string; publicUrl: string; contentType: string; headers: Record<string, string> }
export interface ProviderEstimate { usd: number; providerCredits?: string; correlationId?: string }
