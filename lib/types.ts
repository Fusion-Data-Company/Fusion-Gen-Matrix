export type Surface = "image" | "video" | "audio";
export type GenerationStatus = "pending_submit" | "queued" | "in_progress" | "completed" | "failed" | "nsfw" | "canceled";
export type Settings = Record<string,string|number|boolean>;
export type Role = "start"|"end"|"reference"|"video"|"audio"|"source";
export interface Media { id:string; url:string; kind:Surface; role:Role; contentType?:string; bytes?:number; width?:number; height?:number; durationSec?:number }
export interface Output { kind:Surface|"artifact";name?:string;url:string;r2Key:string;contentType:string;width?:number;height?:number;durationSec?:number }
export interface Profile {id:string;email:string;name:string;role:"user"|"admin";plan:"free"|"starter"|"plus"|"ultra";subscriptionCredits:number;topupCredits:number;stripeCustomerId?:string;subscriptionId?:string;planRenewsAt?:string;billingReview?:boolean;createdAt:string}
export interface Generation {id:string;userId:string;surface:Surface;modelId:string;prompt:string;settings:Settings;media:Media[];projectId?:string;status:GenerationStatus;requestId?:string;cost:number;debit:{subscription:number;topup:number};outputs:Output[];error?:string;isPublic:boolean;presetId?:string;publishedAt?:string;createdAt:string;updatedAt:string;finishedAt?:string;inputHash:string;demoOutcome?:"completed"|"failed"|"nsfw";finalizingUntil?:string;finalizingToken?:string;retentionError?:string;providerMedia?:Media[];webhookUrl?:string;providerStatusUrl?:string;providerCancelUrl?:string;quoteUsd?:number;deletedAt?:string}
export interface Project {id:string;userId:string;name:string;createdAt:string;updatedAt:string}
export interface Upload {id:string;userId:string;kind:Surface;name:string;url:string;contentType:string;bytes:number;width?:number;height?:number;durationSec?:number;createdAt:string;providerUrl?:string;r2Key?:string;status?:"pending"|"ready";expiresAt?:string}
export interface LedgerEntry {id:string;userId:string;delta:number;bucket:"subscription"|"topup";reason:string;refId:string;balanceAfter:number;createdAt:string;note?:string}
export interface EventRecord {id:string;type:string;createdAt:string;processedAt?:string;payload?:Record<string,unknown>}
export interface Preset {id:string;slug:string;title:string;description:string;surface:Surface;modelId:string;promptTemplate:string;settings:Settings;category:string;coverUrl:string;active:boolean}
export interface PricingOverride {id:string;modelId:string;enabled:boolean;usd?:number;note:string}
export interface Report {id:string;userId:string;generationId:string;reason:string;status:"open"|"resolved";createdAt:string}
export interface RateLimit {id:string;count:number;expiresAt:string;expiresAtDate?:Date}
export interface PreviewSession {id:string;userId:string;expiresAt:string}
export interface Plan {id:Profile["plan"];name:string;credits:number;monthlyUsd:number|null;annualUsd:number|null;concurrent:number;description:string;configured:boolean}

export type GenerationView=Omit<Generation,"debit"|"inputHash"|"quoteUsd"|"requestId"|"providerMedia"|"webhookUrl"|"providerStatusUrl"|"providerCancelUrl"|"finalizingUntil"|"finalizingToken"|"cost">&{cost?:number};
