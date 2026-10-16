import "server-only";
import Ajv, { type ErrorObject, type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import { z } from "zod";
import schemaData from "./schemas.json";
import mappingData from "./media-mapping.json";
import influencerOptions from "./influencer-options.json";
import { getModel } from "./index";
import type { MediaInput, MediaRole, ProviderMapping, Settings, Surface, ValidatedInput } from "./types";

const schemas: Record<string, Record<string, unknown>> = schemaData;
interface MediaMapping { key: string; role: MediaRole; kind: Surface; array: boolean }
const mappings = mappingData as Record<string, MediaMapping[]>;
const ajv = new Ajv({ allErrors: true, strict: false, coerceTypes: false, useDefaults: false, ownProperties: true, multipleOfPrecision: 8 });
addFormats(ajv);
const compiled = new Map<string, ValidateFunction>();
const settingsSchema = z.record(z.string(), z.union([z.string().max(30000), z.number().finite(), z.boolean()]));
const mediaSchema = z.array(z.object({
  role: z.enum(["start", "end", "reference", "video", "audio", "source"]),
  kind: z.enum(["image", "video", "audio"]), contentType: z.string().max(100).optional(), url: z.string().min(1).max(8000),
  bytes: z.number().int().nonnegative().optional(), width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(), durationSec: z.number().positive().optional(),
}).passthrough()).max(50);

export class CatalogValidationError extends Error {
  readonly code = "INVALID_INPUT";
  constructor(message: string) { super(message); this.name = "CatalogValidationError"; }
}
function fail(message: string): never { throw new CatalogValidationError(message); }
/** Additional defense; callers must resolve uploads from ownership-checked server records. */
export function assertPublicHttpsUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { return fail("Media must have a valid HTTPS URL."); }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (url.protocol !== "https:" || url.username || url.password || url.hash || (url.port && url.port !== "443") ||
    host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") ||
    !host.includes(".") || host.includes(":") || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    fail("Use a public HTTPS media URL without credentials, fragments, custom ports, or IP literals.");
  }
  return url.toString();
}
function cleanJson(value: unknown, depth = 0): unknown {
  if (depth > 10) return fail("Advanced JSON settings are too deeply nested.");
  if (Array.isArray(value)) {
    if (value.length > 100) return fail("Advanced JSON settings contain too many items.");
    return value.map((item) => cleanJson(item, depth + 1));
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (["__proto__", "prototype", "constructor"].includes(key)) fail("Unsupported settings property.");
      cleanJson(item, depth + 1);
    }
  }
  return value;
}
function rawMapping(input: ValidatedInput): ProviderMapping {
  const model = input.model;
  const body: Record<string, unknown> = {};
  for (const setting of model.settings) {
    const value = input.settings[setting.key];
    if (value === undefined || (setting.optional && value === "")) continue;
    if (setting.kind === "text" && setting.valueKind === "json") {
      if (typeof value !== "string") fail(setting.label + " must be entered as JSON text.");
      try { body[setting.key] = cleanJson(JSON.parse(value)); }
      catch (error) { if (error instanceof CatalogValidationError) throw error; fail(setting.label + " must contain valid JSON."); }
    } else {
      body[setting.key] = value;
    }
  }
  if (input.prompt || model.requirePrompt) body[model.promptKey ?? "prompt"] = input.prompt;
  if (model.id === "higgsfield-ai/soul/v2/image-to-image") body.enhance_prompt = true;
  for (const binding of mappings[model.id] ?? []) {
    const inputs = input.media.filter((item) => item.role === binding.role && item.kind === binding.kind);
    if (inputs.length) body[binding.key] = binding.array ? inputs.map((item) => item.url) : inputs[0].url;
  }
  return { path: model.path, body };
}
function formatSchemaError(errors: ErrorObject[] | null | undefined): string {
  const error = errors?.[0];
  if (!error) return "The model parameters are invalid.";
  const name = error.instancePath.replaceAll("/", " ").trim() || "Input";
  return name + " " + (error.message ?? "is invalid") + ".";
}
function runtimeConstraints(input: ValidatedInput, body: Record<string, unknown>): void {
  const id = input.modelId;
  if (id === "higgsfield/ai-influencer") {
    const tier = String(body.tier ?? "normal");
    const human = ["normal", "freak", "total"].includes(tier);
    if (human && (body.body_color !== undefined || Number(body.variation_index ?? 0) !== 0)) fail("Animal color and variation require an animal character type.");
    if (body.selection && typeof body.selection === "object" && !Array.isArray(body.selection)) {
      for (const [key, choices] of Object.entries(body.selection)) {
        const category = influencerOptions.categories.find((item) => item.key === key && item.tiers.includes(tier));
        if (!category || !Array.isArray(choices) || choices.length > category.max) fail("Appearance category or selection count is unavailable for this character type.");
        const slots = new Set<string>();
        for (const choice of choices) {
          const option = category.options.find((item) => item.key === choice && (!item.tiers || item.tiers.includes(tier)));
          if (!option) fail("An appearance choice is unavailable for this character type.");
          if (option.exclusive && choices.length > 1) fail("An exclusive appearance choice must be selected alone.");
          if (option.slot && slots.has(option.slot)) fail("Choose at most one appearance option per facial slot.");
          if (option.slot) slots.add(option.slot);
        }
      }
    }
    if (input.media.some((item) => item.contentType && !["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(item.contentType))) fail("AI Influencer requires JPEG, PNG, or WebP image references.");
    if (input.media.some((item) => item.bytes !== undefined && item.bytes > 64 * 1024 * 1024)) fail("AI Influencer reference images must be no larger than 64 MiB.");
  }

  const count = (key: string) => Array.isArray(body[key]) ? body[key].length : 0;
  for (const key of ["file_url", "link_url"]) {
    if (typeof body[key] === "string") assertPublicHttpsUrl(body[key]);
  }
  if (body.file_url && body.link_url) fail("Choose a document reference or a web reference, not both.");
  if (id.includes("qwen-image-3") && body.enable_thinking === true && body.prompt_extend !== true) fail("Thinking requires prompt enhancement.");
  if (id === "higgsfield-ai/soul/v2/standard" && body.custom_reference_id && Number(body.custom_reference_strength) <= 0) fail("Character reference strength must be greater than zero.");
  if (id.startsWith("kling-video/")) {
    if (Array.isArray(body.elements) && body.elements.some((value) => typeof value !== "string" || !/^\d+$/.test(value))) fail("Kling elements must be account-owned decimal IDs.");
    if (body.multi_prompt !== undefined) {
      if (body.multi_shots !== true) fail("Enable multiple shots before supplying shot prompts.");
      if (!Array.isArray(body.multi_prompt) || body.multi_prompt.length < 1 || body.multi_prompt.length > 6) fail("Provide one to six shots.");
      for (const shot of body.multi_prompt) {
        if (!shot || typeof shot !== "object" || !("prompt" in shot) || typeof shot.prompt !== "string" || !shot.prompt.trim() ||
          !("duration" in shot) || typeof shot.duration !== "number" || !Number.isInteger(shot.duration) || shot.duration < 1 || shot.duration > 15) fail("Each shot needs a prompt and an integer duration from 1 to 15 seconds.");
      }
    }
    if (id.includes("/o3/") && body.multi_shots === true && !body.multi_prompt) fail("Kling O3 multiple shots require shot prompts.");
  }
  if (id === "xai/grok-imagine-video/v1.5/reference-to-video") {
    const refs = count("image_urls") > 0 || Boolean(body.audio_url);
    if (body.image_url && refs) fail("Choose a first frame or reference media for Grok Video.");
    if (refs && body.resolution === "1080p") fail("Grok reference mode supports 480p or 720p.");
  }
  if (id.startsWith("bytedance/seedance-2.5/")) {
    if (id.endsWith("/reference-to-video") && count("image_urls") + count("video_urls") + count("audio_urls") === 0) fail("Attach at least one image, video, or audio reference.");
    if (body.video_url && count("video_urls") > 9) fail("A source video permits up to nine additional video references.");
  }
  if ((id === "bytedance/seedance-2.0/reference-to-video" || id === "minimax/h3/reference-to-video") && count("image_urls") + count("video_urls") === 0) fail("This model requires an image or video reference; audio alone is insufficient.");
  if (id === "wan/v2.7/reference-to-video") {
    const total = count("image_urls") + count("video_urls");
    if (total < 1 || total > 5) fail("Wan 2.7 requires one to five combined image and video references.");
  }
  if (id.startsWith("higgsfield/cinema-studio/")) {
    for (const match of input.prompt.matchAll(/<<<(image|video|audio)_(\d+)>>>/g)) {
      const key = match[1] + "_urls";
      if (Number(match[2]) < 1 || Number(match[2]) > count(key)) fail("A prompt reference points to media that is not attached.");
    }
  }
  for (const item of input.media) {
    if (id.includes("motion-control") && item.kind === "video" && item.durationSec !== undefined && (item.durationSec < 3 || item.durationSec > 30)) fail("Motion-reference video must last 3–30 seconds.");
    if (id.includes("genjutsu/") && item.kind === "video" && item.durationSec !== undefined && item.durationSec < 4) fail("Genjutsu source video must last at least four seconds.");
    if (id.includes("genjutsu/restyle") && item.kind === "video" && item.bytes !== undefined && item.bytes > 200 * 1024 * 1024) fail("Restyle source video must be no larger than 200 MiB.");
    if (id.includes("genjutsu/object-swap") && item.kind === "video" && item.width && item.height && item.width * item.height < 409600) fail("Object-swap source video must have at least 409,600 pixels per frame.");
    if ((id.includes("/o3/video-edit") || id.includes("/omni/video-edit")) && item.kind === "video" && item.durationSec !== undefined &&
      (item.durationSec < 3 || item.durationSec > (id.includes("/o3/") ? 15.5 : 10))) fail("The source video duration is outside this editing model's range.");
  }
}
export function validateInput(modelId: string, prompt: string, settings: Settings = {}, media: readonly MediaInput[] = []): ValidatedInput {
  const model = getModel(modelId);
  if (!model) fail("Choose a model from the verified catalog.");
  if (typeof prompt !== "string") fail("Prompt must be text.");
  const text = prompt.trim();
  if (model.requirePrompt && !text) fail("Enter a prompt for this model.");
  if (text.length > model.promptMaxLength) fail("Prompt exceeds this model's character limit.");
  const parsedSettings = settingsSchema.safeParse(settings);
  const parsedMedia = mediaSchema.safeParse(media);
  if (!parsedSettings.success || !parsedMedia.success) fail("Settings or media do not match the studio input format.");
  const allowed = new Set(model.settings.map((setting) => setting.key));
  for (const key of Object.keys(parsedSettings.data)) if (!allowed.has(key)) fail("Unsupported model setting: " + key + ".");
  const normalizedMedia: MediaInput[] = parsedMedia.data.map((item) => ({ role: item.role, kind: item.kind, contentType: item.contentType, url: assertPublicHttpsUrl(item.url), bytes: item.bytes, width: item.width, height: item.height, durationSec: item.durationSec }));
  for (const item of normalizedMedia) if (!model.roles.some((role) => role.role === item.role && role.kind === item.kind)) fail("This model does not accept that media role.");
  for (const role of model.roles) {
    const count = normalizedMedia.filter((item) => item.role === role.role && item.kind === role.kind).length;
    if (count > role.max || count < (role.min ?? (role.required ? 1 : 0))) fail("Check the number of " + role.role + " attachments for this model.");
  }
  const input: ValidatedInput = { model, modelId, prompt: text, settings: { ...model.defaultSettings, ...parsedSettings.data }, media: normalizedMedia };
  const mapped = rawMapping(input);
  let validator = compiled.get(modelId);
  if (!validator) { validator = ajv.compile({ ...schemas[modelId], additionalProperties: false }); compiled.set(modelId, validator); }
  if (!validator(mapped.body)) fail(formatSchemaError(validator.errors));
  runtimeConstraints(input, mapped.body);
  return input;
}
/** Revalidate even a forged object; paths always come from the verified catalog. */
export function mapToProvider(input: ValidatedInput): ProviderMapping {
  return rawMapping(validateInput(input.modelId, input.prompt, input.settings, input.media));
}
