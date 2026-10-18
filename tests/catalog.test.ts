import { describe, expect, it, vi } from "vitest";
import { creditsForUsd, getModel, models, priceFor } from "../lib/catalog";
import { mapToProvider, validateInput } from "../lib/catalog/server";
import type { MediaInput, Settings } from "../lib/catalog";
import examplesData from "../lib/catalog/examples.json";
import mappingData from "../lib/catalog/media-mapping.json";
import { HiggsfieldClient, HiggsfieldError } from "../lib/higgsfield/client";
import { buildWebhookUrl, createWebhookToken, verifyWebhookToken } from "../lib/higgsfield/webhook";

const examples: Record<string, Record<string, unknown>> = examplesData;
const mapping = mappingData as Record<string, { key: string; role: MediaInput["role"]; kind: MediaInput["kind"]; array: boolean }[]>;
const pricingDescription = "For 16:9 video without video input, your request costs roughly $0.2056 per second of generated video at 480p, $0.4622 at 720p, and $1.1372 at 1080p. Each 1,000 video tokens costs $0.0214 at 480p or 720p and $0.0234 at 1080p. Billable video tokens = ceil(output height × output width × (input video duration + generated video duration) × 24 / 1024). Image and audio references do not count as video input. Actual pricing depends on output dimensions and billable duration. Rates shown are before any applicable customer discount.";
const soul = "higgsfield-ai/soul/v2/standard";
const kling = "kling-video/v3.0/std/text-to-video";
function fixture(id: string) {
  const example = examples[id]; const model = getModel(id)!; const settings: Settings = {}; const media: MediaInput[] = [];
  for (const field of model.settings) {
    const value = example[field.key];
    if (value === undefined || value === null) continue;
    settings[field.key] = field.kind === "text" && field.valueKind === "json" ? JSON.stringify(value) : value as string | number | boolean;
  }
  for (const binding of mapping[id]) {
    const value = example[binding.key];
    const urls = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
    for (const url of urls) if (typeof url === "string") media.push({ role: binding.role, kind: binding.kind, url });
  }
  return { prompt: typeof example[model.promptKey ?? "prompt"] === "string" ? String(example[model.promptKey ?? "prompt"]) : "", settings, media };
}
const img = (role: MediaInput["role"] = "reference"): MediaInput => ({ role, kind: "image", url: "https://media.example.com/owned.png" });
const video: MediaInput = { role: "source", kind: "video", url: "https://media.example.com/owned.mp4" };
const audio: MediaInput = { role: "audio", kind: "audio", url: "https://media.example.com/owned.wav" };
const json = (value: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json", ...headers } });
function client(fetcher: typeof fetch, overrides: { maxAttempts?: number } = {}) {
  return new HiggsfieldClient({ credentials: "unit-test-id:unit-test-secret", fetch: fetcher, retryBaseMs: 0, ...overrides });
}
describe("verified model catalog", () => {
  it("covers the full documented generation inventory, with unique official paths", () => {
    expect(models).toHaveLength(85); expect(models.filter((model) => model.surface === "image")).toHaveLength(18);
    expect(models.filter((model) => model.surface === "video")).toHaveLength(67);
    expect(new Set(models.map((model) => model.id)).size).toBe(models.length);
    expect(models.every((model) => model.sourceUrl.startsWith("https://docs.higgsfield.ai/docs/models/") || model.sourceUrl.startsWith("https://open.higgsfield.ai/models/"))).toBe(true);
    expect(models.some((model) => model.surface === "audio" || model.id === "soul-id" || model.id === "nano_banana_2")).toBe(false);
  });
  for (const model of models) {
    it("validates and maps the published example: " + model.id, () => {
      const input = fixture(model.id);
      const validated = validateInput(model.id, input.prompt, input.settings, input.media);
      const mapped = mapToProvider(validated);
      expect(mapped.path).toBe(model.id);
      const expected = { ...examples[model.id] };
      Object.keys(expected).forEach((key) => { if (expected[key] === null || (Array.isArray(expected[key]) && expected[key].length === 0 && !Object.hasOwn(mapped.body, key))) delete expected[key]; });
      expect(mapped.body).toMatchObject(expected);
    });
  }
  it("refuses forged paths, unknown settings, invalid enums, invalid image batches, empty required prompts", () => {
    expect(() => validateInput("https://evil.example/api", "test")).toThrow();
    expect(() => validateInput(soul, "test", { path: "arbitrary" })).toThrow();
    expect(() => validateInput(soul, "test", { resolution: "4K" })).toThrow();
    expect(() => validateInput(soul, "test", { batch_size: 2 })).toThrow();
    expect(() => validateInput(soul, " ")).toThrow();
    const input = validateInput(soul, "test"); input.model = { ...input.model, path: "malicious" };
    expect(mapToProvider(input).path).toBe(soul);
  });
  it("rejects untrusted media protocols, literals, roles, and counts", () => {
    for (const url of ["file:///etc/passwd", "http://media.example.com/a.png", "https://127.0.0.1/a.png", "https://[::1]/a.png", "https://user:pass@example.com/a.png", "https://localhost/a.png", "https://media.example.com:444/a.png"]) {
      expect(() => validateInput("ideogram/v4.0", "test", {}, [{ ...img("start"), url }])).toThrow();
    }
    expect(() => validateInput(soul, "test", {}, [img()])).toThrow();
    expect(() => validateInput("ideogram/v4.0", "test", {}, [img("start"), img("start")])).toThrow();
    expect(() => validateInput("bytedance/seedance-2.5/image-to-video", "")).toThrow();
  });
  it("enforces current runtime constraints omitted by provider JSON schema", () => {
    expect(() => validateInput("alibaba/qwen-image-3/text-to-image", "test", { prompt_extend: false, enable_thinking: true })).toThrow();
    expect(() => validateInput("alibaba/happy-horse/reference-to-video", "test", {}, Array.from({ length: 10 }, () => img()))).toThrow();
    expect(() => validateInput("wan/v2.7/reference-to-video", "test", {}, Array.from({ length: 6 }, () => img()))).toThrow();
    expect(() => validateInput("minimax/h3/reference-to-video", "test", {}, [audio])).toThrow();
    expect(() => validateInput("bytedance/seedance-2.0/reference-to-video", "", {}, [audio])).toThrow();
    expect(() => validateInput("bytedance/seedance-2.5/reference-to-video", "")).toThrow();
    expect(() => validateInput("bytedance/seedance-2.5/reference-to-video", "", {}, [audio])).not.toThrow();
    expect(() => validateInput("xai/grok-imagine-video/v1.5/reference-to-video", "test", { resolution: "1080p" }, [img()])).toThrow();
    expect(() => validateInput("xai/grok-imagine-video/v1.5/reference-to-video", "test", {}, [img("start"), img()])).toThrow();
    expect(() => validateInput("higgsfield/genjutsu/object-swap/v1.0", "", {}, [img(), { ...video, width: 100, height: 100 }])).toThrow();
    expect(() => validateInput("higgsfield/cinema-studio/4.0", "Animate <<<image_2>>>", {}, [img()])).toThrow();
  });
  it("validates advanced JSON and conditional requirements", () => {
    expect(() => validateInput(kling, "test", { multi_shots: true, multi_prompt: '[{"prompt":"a","duration":0}]' })).toThrow();
    expect(() => validateInput(kling, "test", { multi_shots: true, multi_prompt: '[{"prompt":"a","duration":5}]' })).not.toThrow();
    expect(() => validateInput(kling, "test", { multi_prompt: "not json" })).toThrow();
    expect(() => validateInput(kling, "test", { elements: '["not-account-id"]' })).toThrow();
    expect(() => validateInput("marketing-studio/image/flare", "test", { enhance_prompt: true })).toThrow();
    expect(() => validateInput("recraft/v4.1/text-to-image", "test", { colors: '[{"rgb":[255,0,300]}]' })).toThrow();
    expect(() => validateInput("recraft/v4.1/text-to-image", "test", { colors: '[{"rgb":[255,0,20]}]' })).not.toThrow();
  });
  it("supports the console-only character sheet and rejects stale or incompatible options", () => {
    const input = validateInput("higgsfield/ai-influencer", "Editorial styling", { tier: "normal", selection: '{"gender":["female"]}' }, [img("start")]);
    expect(mapToProvider(input).body).toMatchObject({ brief: "Editorial styling", tier: "normal", selection: { gender: ["female"] } });
    expect(priceFor("higgsfield/ai-influencer", {})).toMatchObject({ usd: 0.05, credits: 10 });
    expect(() => validateInput("higgsfield/ai-influencer", "", { tier: "normal", body_color: "#FFFFFF" })).toThrow();
    expect(() => validateInput("higgsfield/ai-influencer", "", { tier: "normal", variation_index: 1 })).toThrow();
    expect(() => validateInput("higgsfield/ai-influencer", "", { selection: '{"unknown":["a"]}' })).toThrow();
    expect(() => validateInput("higgsfield/ai-influencer", "", { selection: '{"gender":["female","male"]}' })).toThrow();
    expect(() => validateInput(soul, "test", { custom_reference_id: "other-tenant-reference" })).toThrow();
    expect(() => validateInput(kling, "test", { elements: '["12345"]' })).toThrow();
  });
  it("prices only verified exact configurations and applies integer credit rounding", () => {
    expect(priceFor(soul, { resolution: "720p", batch_size: 4 })).toMatchObject({ usd: 0.0128, credits: 3 });
    expect(priceFor(soul, { resolution: "1080p", batch_size: 1 })).toMatchObject({ usd: 0.0057, credits: 2 });
    expect(() => priceFor(kling, {})).toThrow();
    expect(() => priceFor(soul, { batch_size: -1 })).toThrow();
    expect(() => creditsForUsd(0.1, { creditUsd: 0 })).toThrow();
    expect(creditsForUsd(0.042, { markup: 2, creditUsd: 0.01 })).toBe(9);
  });
});
describe("server-only provider adapter, no live requests", () => {
  it("submits the exact mapped payload and same idempotency key through a bounded retry", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({}, 503)).mockResolvedValueOnce(json({ request_id: "req-1", status: "queued", status_url: "https://api.higgsfield.ai/requests/req-1/status" }));
    const result = await client(fetcher).submit(validateInput(soul, "test"), { idempotencyKey: "intent-1", webhookUrl: "https://studio.example.com/api/webhooks/higgsfield?gid=g-1&t=test" });
    expect(result.requestId).toBe("req-1"); expect(fetcher).toHaveBeenCalledTimes(2);
    const first = fetcher.mock.calls[0]; const second = fetcher.mock.calls[1];
    expect(first[0]).toEqual(second[0]); expect(first[1]?.body).toEqual(second[1]?.body);
    expect(new Headers(first[1]?.headers).get("Idempotency-Key")).toBe("intent-1");
    expect(new Headers(second[1]?.headers).get("Idempotency-Key")).toBe("intent-1");
    expect(new URL(String(first[0])).searchParams.get("hf_webhook")).toContain("gid=g-1");
  });
  it("distinguishes a definite rejection from an ambiguous network outcome", async () => {
    const reject = vi.fn<typeof fetch>().mockResolvedValue(json({ detail: "Never echo private submitted content" }, 422));
    await expect(client(reject).submit(validateInput(soul, "test"), { idempotencyKey: "intent-1" })).rejects.toMatchObject({ ambiguous: false, status: 422 });
    expect(reject).toHaveBeenCalledTimes(1);
    const network = vi.fn<typeof fetch>().mockRejectedValue(new Error("private connection details"));
    await expect(client(network).submit(validateInput(soul, "test"), { idempotencyKey: "intent-1" })).rejects.toMatchObject({ ambiguous: true, code: "PROVIDER_NETWORK_ERROR" });
    expect(network).toHaveBeenCalledTimes(3);
  });
  it("preserves ambiguity when an uncertain retry is followed by a definite HTTP rejection", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({}, 500)).mockResolvedValueOnce(json({}, 401));
    await expect(client(fetcher).submit(validateInput(soul, "test"), { idempotencyKey: "intent-1" })).rejects.toMatchObject({ ambiguous: true, status: 401 });
  });
  it("requires idempotency and refuses malformed acceptance or unsafe outputs", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ status: "queued" }));
    await expect(client(fetcher).submit(validateInput(soul, "test"), { idempotencyKey: "" })).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
    await expect(client(fetcher).submit(validateInput(soul, "test"), { idempotencyKey: "intent" })).rejects.toMatchObject({ ambiguous: true });
    const output = vi.fn<typeof fetch>().mockResolvedValue(json({ request_id: "req-1", status: "completed", images: [{ url: "http://127.0.0.1/secret" }] }));
    await expect(client(output).status("req-1")).rejects.toThrow();
    await expect(client(output).submit(validateInput(soul, "test"), { idempotencyKey: "intent" })).rejects.toMatchObject({ ambiguous: true });
    const mismatch = vi.fn<typeof fetch>().mockResolvedValue(json({ request_id: "different-request", status: "queued" }));
    await expect(client(mismatch).status("req-1")).rejects.toThrow();
  });
  it("normalizes nested output and deduplicates audio aliases", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ request_id: "req-1", status: "completed", payload: { audio: { url: "https://cdn.example.com/a.mp3" }, audios: [{ url: "https://cdn.example.com/a.mp3" }], video: { url: "https://cdn.example.com/v.mp4", content_type: "video/mp4" }, zip: { url: "https://cdn.example.com/a.zip" } } }));
    const result = await client(fetcher).status("req-1");
    expect(result.outputs.map((item) => item.kind).sort()).toEqual(["artifact", "audio", "video"]);
  });
  it("rejects provider URL substitution and validates account estimate shape", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ request_id: "req-1", status: "queued", status_url: "https://attacker.example/requests/req-1/status" }));
    await expect(client(fetcher).submit(validateInput(soul, "test"), { idempotencyKey: "intent" })).rejects.toMatchObject({ ambiguous: true });
    const quote = vi.fn<typeof fetch>().mockResolvedValue(json({ credits: "0.051", usd: "0.0032" }));
    expect(await client(quote).estimate(validateInput(soul, "test"))).toMatchObject({ usd: 0.0032 });
    expect(String(quote.mock.calls[0][0])).toBe("https://api.higgsfield.ai/estimate/" + soul);
    expect(() => new HiggsfieldClient({ credentials: "unit:test", baseUrl: "https://attacker.example" })).toThrow(HiggsfieldError);
  });
  it("accepts the observed Seedance tariff for the verified default request", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ type: "description", pricing_description: pricingDescription }));
    const quote = await client(fetcher).estimate(validateInput("bytedance/seedance-2.5/text-to-video", "A cinematic scene at sunset"));
    expect(quote.usd).toBe(2.32);
    expect(quote.providerCredits).toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0][0])).toBe("https://api.higgsfield.ai/estimate/bytedance/seedance-2.5/text-to-video");
  });
  it("propagates increased Seedance rates instead of using a cached price", async () => {
    for (const [description, expected] of [[pricingDescription.replace("$0.4622 at 720p", "$0.6000 at 720p"), 3], [pricingDescription.replace("$0.0214", "$0.0300"), 3.24]] as const) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ type: "description", pricing_description: description }));
      expect((await client(fetcher).estimate(validateInput("bytedance/seedance-2.5/text-to-video", "test"))).usd).toBe(expected);
    }
  });
  it("refuses to extrapolate Seedance tariffs to unverified inputs or formulas", async () => {
    const estimate = (response: unknown, id = "bytedance/seedance-2.5/text-to-video", settings: Settings = {}) => client(vi.fn<typeof fetch>().mockResolvedValue(json(response))).estimate(validateInput(id, "test", settings));
    const description = { type: "description", pricing_description: pricingDescription };
    for (const settings of [{ duration: 6 }, { resolution: "1080p" }, { aspect_ratio: "9:16" }, { bitrate_mode: "standard" }, { output_format: "mov" }, { generate_audio: false }] as Settings[]) {
      await expect(estimate(description, undefined, settings)).rejects.toMatchObject({ code: "INVALID_PROVIDER_RESPONSE" });
    }
    for (const response of [{ ...description, pricing_description: pricingDescription.replace("/ 1024", "/ 512") }, { ...description, pricing_description: pricingDescription + " Plus another fee." }, { ...description, usd: null }]) {
      await expect(estimate(response)).rejects.toMatchObject({ code: "INVALID_PROVIDER_RESPONSE" });
    }
    await expect(estimate(description, soul)).rejects.toMatchObject({ code: "INVALID_PROVIDER_RESPONSE" });
  });
  it("handles successful empty cancellation and refuses to fake an already-started cancel", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { status: 202 })).mockResolvedValueOnce(json({}, 400));
    expect(await client(fetcher).cancel("req-1")).toMatchObject({ status: "canceled" });
    await expect(client(fetcher).cancel("req-2")).rejects.toMatchObject({ status: 400 });
  });
  it("preserves exact signed-upload headers and refuses credential forwarding instructions", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ upload_url: "https://uploads.example.com/signed?token=temporary", public_url: "https://cdn.example.com/file.png", content_type: "image/png", upload_headers: { "Content-Type": "image/png", "x-amz-tagging": "retention=temporary" } })).mockResolvedValueOnce(json({ upload_url: "https://uploads.example.com/signed", public_url: "https://cdn.example.com/file.png", content_type: "image/png", upload_headers: { Authorization: "unexpected" } }));
    const upload = await client(fetcher).signedUpload("image/png");
    expect(upload.headers).toEqual({ "Content-Type": "image/png", "x-amz-tagging": "retention=temporary" });
    await expect(client(fetcher).signedUpload("image/png")).rejects.toThrow();
    await expect(client(fetcher).signedUpload("image/svg+xml")).rejects.toThrow();
  });
});
describe("webhook authentication", () => {
  const secret = "a-unique-unit-test-secret-at-least-32-characters";
  it("binds constant-time tokens to a single generation and rejects malformed input", () => {
    const token = createWebhookToken("gen-1", secret);
    expect(verifyWebhookToken("gen-1", token, secret)).toBe(true);
    expect(verifyWebhookToken("gen-2", token, secret)).toBe(false);
    expect(verifyWebhookToken("gen-1", "malformed", secret)).toBe(false);
    expect(verifyWebhookToken("gen-1", "0".repeat(64), secret)).toBe(false);
    expect(buildWebhookUrl(undefined, "gen-1", secret)).toBeUndefined();
    const url = new URL(buildWebhookUrl("https://studio.example.com", "gen-1", secret)!);
    expect(url.pathname).toBe("/api/webhooks/higgsfield"); expect(url.searchParams.get("t")).toBe(token);
  });
});
