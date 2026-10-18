/** Pure tariff validation shared by the server client and the standalone Node example. */
const seedancePath = "bytedance/seedance-2.5/text-to-video";
const inputKeys = new Set(["prompt", "duration", "resolution", "aspect_ratio", "bitrate_mode", "output_format", "generate_audio"]);
const optionalDefaults: Record<string, unknown> = { bitrate_mode: "high", output_format: "mp4", generate_audio: true };
const tariffPattern = /^For 16:9 video without video input, your request costs roughly \$\d+(?:\.\d+)? per second of generated video at 480p, \$(\d+(?:\.\d+)?) at 720p, and \$\d+(?:\.\d+)? at 1080p\. Each 1,000 video tokens costs \$(\d+(?:\.\d+)?) at 480p or 720p and \$\d+(?:\.\d+)? at 1080p\. Billable video tokens = ceil\(output height × output width × \(input video duration \+ generated video duration\) × 24 \/ 1024\)\. Image and audio references do not count as video input\. Actual pricing depends on output dimensions and billable duration\. Rates shown are before any applicable customer discount\.$/;

/** Only the observed five-second 720p/16:9 request is verified for descriptive pricing. */
export function seedance720pTariffUsd(estimate: Record<string, unknown>, modelPath: string, input: Record<string, unknown>): number | undefined {
  if (modelPath !== seedancePath || Object.hasOwn(estimate, "usd") || estimate.type !== "description") return;
  if (typeof input.prompt !== "string" || !input.prompt.trim() || input.duration !== 5 || input.resolution !== "720p" || input.aspect_ratio !== "16:9") return;
  if (Object.keys(input).some(key => !inputKeys.has(key)) || Object.entries(optionalDefaults).some(([key, value]) => input[key] !== undefined && input[key] !== value)) return;
  const description = typeof estimate.pricing_description === "string" ? estimate.pricing_description.trim().replace(/\s+/g, " ") : "";
  const tariff = tariffPattern.exec(description);
  if (!tariff) return;
  const tokens = Math.ceil(720 * 1280 * input.duration * 24 / 1024);
  // Use the higher authenticated rate, before discounts, rounded UP to a cent.
  const usd = Math.ceil(Math.max(tokens / 1000 * Number(tariff[2]), input.duration * Number(tariff[1])) * 100) / 100;
  return Number.isFinite(usd) && usd >= 0 ? usd : undefined;
}
