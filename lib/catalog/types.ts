export type Surface = "image" | "video" | "audio";
export type MediaRole = "start" | "end" | "reference" | "video" | "audio" | "source";
export type Settings = Record<string, string | number | boolean>;
export interface MediaInput {
  role: MediaRole; kind: Surface; url: string;
  contentType?: string; bytes?: number; width?: number; height?: number; durationSec?: number;
}
interface SettingBase { key: string; label: string; optional?: boolean; required?: boolean; description?: string }
export type SettingDefinition =
  | (SettingBase & { kind: "enum"; options: readonly (string | number)[]; default: string | number })
  | (SettingBase & { kind: "range"; min: number; max: number; step: number; default: number })
  | (SettingBase & { kind: "boolean"; default: boolean })
  | (SettingBase & { kind: "text"; maxLength?: number; default: string; valueKind?: "json"; placeholder?: string });
export interface MediaRoleDefinition { role: MediaRole; kind: Surface; max: number; min?: number; required?: boolean }
export type InputMode = "text" | "image" | "firstLast" | "reference" | "video" | "audio";
export interface PriceRule {
  kind: "image" | "second" | "request";
  countKey?: string;
  usd?: number;
  bySetting?: { key: string; rates: Record<string, number> };
  sourceUrl: string;
  verifiedAt: string;
}
export interface ModelEntry {
  id: string; path: string; label: string; family: string; surface: Surface; provider: string;
  description: string; bestFor: string; badges: readonly string[]; modes: readonly InputMode[];
  settings: readonly SettingDefinition[]; roles: readonly MediaRoleDefinition[];
  defaultSettings: Settings; promptKey?: "prompt" | "brief"; requirePrompt: boolean; promptMaxLength: number;
  sourceUrl: string; price: PriceRule | null; priceVerified: boolean;
}
export interface ValidatedInput { model: ModelEntry; modelId: string; prompt: string; settings: Settings; media: MediaInput[] }
export interface ProviderMapping { path: string; body: Record<string, unknown> }
export interface PriceQuote { usd: number; credits: number; sourceUrl: string }
