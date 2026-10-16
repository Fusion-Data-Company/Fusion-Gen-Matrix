import metadata from "./metadata.json";
import type { MediaInput, ModelEntry, PriceQuote, Settings } from "./types";

export * from "./types";

// Generated from official per-model JSON schemas. Source URL is stored on every entry.
// This module contains no credentials, provider code, AJV, or raw documentation.
export const models: readonly ModelEntry[] = metadata as unknown as readonly ModelEntry[];
const byId = new Map(models.map((model) => [model.id, model]));
export function getModel(id: string): ModelEntry | undefined { return byId.get(id); }

export class PricingUnavailableError extends Error {
  readonly code = "PRICE_UNAVAILABLE";
  constructor() { super("An authenticated provider quote is required for this model configuration."); this.name = "PricingUnavailableError"; }
}
export function creditsForUsd(usd: number, options: { markup?: number; creditUsd?: number } = {}): number {
  const markup = options.markup ?? 2;
  const creditUsd = options.creditUsd ?? 0.01;
  if (![usd, markup, creditUsd].every(Number.isFinite) || usd < 0 || markup <= 0 || creditUsd <= 0) {
    throw new Error("Invalid credit pricing configuration.");
  }
  const credits = Math.ceil((usd * markup) / creditUsd);
  if (!Number.isSafeInteger(credits)) throw new Error("Credit price exceeds the supported range.");
  return credits;
}
/** Public documented estimate only. Live submission should use client.estimate for its account. */
export function priceFor(
  modelId: string, settings: Settings = {}, media: readonly MediaInput[] = [],
  options: { markup?: number; creditUsd?: number } = {},
): PriceQuote {
  void media;
  const model = getModel(modelId);
  if (!model?.price || !model.priceVerified) throw new PricingUnavailableError();
  const values = { ...model.defaultSettings, ...settings };
  const rule = model.price;
  const rate = rule.bySetting ? rule.bySetting.rates[String(values[rule.bySetting.key])] : rule.usd;
  if (rate === undefined || !Number.isFinite(rate) || rate < 0) throw new PricingUnavailableError();
  const count = rule.kind === "request" ? 1 : Number(values[rule.countKey ?? (rule.kind === "second" ? "duration" : "batch_size")] ?? 1);
  const field = model.settings.find((setting) => setting.key === rule.countKey);
  if (!Number.isFinite(count) || count <= 0 || (field?.kind === "enum" && !field.options.includes(count))) throw new PricingUnavailableError();
  const usd = Math.round(rate * count * 1e8) / 1e8;
  return { usd, credits: creditsForUsd(usd, options), sourceUrl: rule.sourceUrl };
}
