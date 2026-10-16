# Verified Higgsfield model catalog

Verification date: 2026-10-15. Status means documentation verified, not successful generation with this account.

The executable catalog contains **85 generation endpoints: 18 image and 67 video** across 36 model families. The public Mintlify index lists 84 entries: 83 generation endpoints plus Soul ID training. Two additional console-only generation models have complete public request documentation and were added: Soul 2 Image-to-Image and AI Influencer. No standalone audio-generation REST endpoint was verified.

Sources were retrieved from the [shared docs index](https://docs.higgsfield.ai/docs/llms.txt), both [image](https://docs.higgsfield.ai/docs/models/image-generation.md) and [video](https://docs.higgsfield.ai/docs/models/video-generation.md) category indexes, every linked family/workflow page, and the [public API console](https://open.higgsfield.ai/explore). The snapshot contains 133 official documentation pages, three additional console page snapshots, and the public AI Influencer options catalog. No app-template source code was copied.

## Contracts and coverage

- Each row maps to one exact REST path. Connector/CLI job-set names such as nano_banana_2 are never sent as REST endpoints.
- metadata.json holds original display copy, settings and roles; schemas.json holds server validation schemas; media-mapping.json records each role's exact parameter name. The 83 Mintlify schemas come from their complete published JSON schemas. Two console models use explicitly transcribed parameter tables and constraints.
- examples.json holds documented request fixtures. Tests validate every example and check mapped bodies. The optional empty Genjutsu reference array is omitted, as explicitly permitted by its docs.
- The server applies documented runtime constraints beyond JSON Schema, including Kling shot requirements, minimum reference sets, combined Wan limits, Grok mode/resolution exclusion and Qwen thinking dependency.
- Where the provider schema omits a finite media cap, a conservative studio limit is used. Source JSON preserves the actual provider contract. Soul 2's documented no-op style-strength control is omitted, and Soul 2 image-reference enhancement is always enabled rather than exposed as an ineffective switch.
- Optional structured inputs use validated JSON text controls. API field names are retained; unknown fields and client-supplied paths are rejected.
- A small number of optional provider fields are intentionally unavailable: raw Soul custom_reference_id and Kling elements IDs need an app-user ownership registry because all users share one provider key. Character training remains v2 scope. AI Influencer private trait/species overrides are not exposed because their valid ID catalogs are not public. Ordinary image/video/audio reference uploads remain supported.
- AI Influencer appearance choices use public options revision f6b86606fcfee66c5ac67930682b4ca98a28a739c2eb85ab597cebd54279d2d4; refresh the snapshot when upstream options change. Category limits, tier compatibility, exclusive choices and facial slots are enforced.
- Media duration/dimensions can only be checked locally when trusted metadata is supplied. The remote provider still decodes and checks media. Source bytes, account ownership and media copy safety are also enforced in the app's storage/upload layer.

## Price treatment

Public exact price rules are verified for Soul 2 text/image (USD 0.0032 at 720p, USD 0.0057 at 1080p, per image; batches 1 or 4) and AI Influencer (USD 0.05 per sheet before account discounts). Those values are dated reference estimates. [Soul 2 pricing](https://open.higgsfield.ai/models/higgsfield-ai/soul/v2/standard/playground), [AI Influencer reference](https://open.higgsfield.ai/models/higgsfield/ai-influencer/api-reference)

For the remaining entries, price is null. Call POST /estimate/{model-path} with the same body to obtain the authenticated account's USD quote before debiting credits. Do not convert the public site's promotional “from” ranges into exact prices. [Authoritative estimation contract](https://docs.higgsfield.ai/docs/concepts/billing-and-retention.md)

## Executable inventory

All rows below are **Documented; account access and paid generation not tested**. “Quote” means the authenticated estimate endpoint is required. Settings shown here are the available studio controls; the referenced source and local schema contain exact enum/range constraints.

| Model | Surface | REST path | Input modes | Available settings | Pricing |
| --- | --- | --- | --- | --- | --- |
| [Soul 2 — Text to image](https://docs.higgsfield.ai/docs/models/soul-2/generate.md) | image | higgsfield-ai/soul/v2/standard | text | aspect_ratio, resolution, enhance_prompt, style_id, seed, batch_size | Exact public rule + live quote |
| [Seedance 2.5 — Text to video](https://docs.higgsfield.ai/docs/models/seedance-2-5/text-to-video.md) | video | bytedance/seedance-2.5/text-to-video | text | duration, resolution, aspect_ratio, bitrate_mode, output_format, generate_audio | Quote |
| [Kling 3.0 — Standard · Text to video](https://docs.higgsfield.ai/docs/models/kling-3/standard-text-to-video.md) | video | kling-video/v3.0/std/text-to-video | text | sound, duration, cfg_scale, multi_shots, aspect_ratio, multi_prompt | Quote |
| [Qwen Image 3 — Edit images](https://docs.higgsfield.ai/docs/models/qwen-image-3/edit.md) | image | alibaba/qwen-image-3/edit | reference | seed, resolution, aspect_ratio, prompt_extend, enable_thinking, negative_prompt, prompt_extend_mode | Quote |
| [Qwen Image 3 — Text to image](https://docs.higgsfield.ai/docs/models/qwen-image-3/text-to-image.md) | image | alibaba/qwen-image-3/text-to-image | text | seed, resolution, aspect_ratio, prompt_extend, enable_thinking, negative_prompt, prompt_extend_mode | Quote |
| [Z-Image Turbo — Generate](https://docs.higgsfield.ai/docs/models/z-image-turbo/generate.md) | image | z-image/turbo | text | seed, resolution, aspect_ratio, prompt_extend | Quote |
| [Ads Studio — Generate ads](https://docs.higgsfield.ai/docs/models/ads-studio/generate.md) | image | higgsfield/ads-studio/v1.0 | text, reference | niche, language, batch_size, aspect_ratio, target_audience | Quote |
| [Marketing Studio Image — 2.0 Alpha](https://docs.higgsfield.ai/docs/models/marketing-studio-image/generate-and-edit.md) | image | marketing-studio/image | text, reference | quality, preset_id, moderation, resolution, aspect_ratio, enhance_prompt | Quote |
| [Marketing Studio Image — 2.5 Flare](https://docs.higgsfield.ai/docs/models/marketing-studio-image/flare.md) | image | marketing-studio/image/flare | text, reference | quality, preset_id, moderation, resolution, aspect_ratio, enhance_prompt | Quote |
| [Marketing Studio Image — 2.5 Sunburst](https://docs.higgsfield.ai/docs/models/marketing-studio-image/sunburst.md) | image | marketing-studio/image/sunburst | text, reference | quality, preset_id, moderation, resolution, aspect_ratio, enhance_prompt | Quote |
| [Soul Cinema — Text to image](https://docs.higgsfield.ai/docs/models/soul-cinema/generate.md) | image | higgsfield-ai/soul/cinema | text | aspect_ratio, enhance_prompt, resolution, seed, batch_size | Quote |
| [Soul — Text to image](https://docs.higgsfield.ai/docs/models/soul-standard/generate.md) | image | higgsfield-ai/soul/standard | text, reference | aspect_ratio, enhance_prompt, style_id, style_strength, resolution, seed, batch_size | Quote |
| [Ideogram 4.0 — Generate](https://docs.higgsfield.ai/docs/models/ideogram-4/generate.md) | image | ideogram/v4.0 | text, image | aspect_ratio, image_weight, rendering_speed | Quote |
| [Recraft V4.1 Pro — Text to image](https://docs.higgsfield.ai/docs/models/recraft-v4-1-pro/generate.md) | image | recraft/v4.1/pro/text-to-image | text | colors, resolution, aspect_ratio, output_format, background_color | Quote |
| [Recraft V4.1 Utility Pro — Text to image](https://docs.higgsfield.ai/docs/models/recraft-v4-1-utility-pro/text-to-image.md) | image | recraft/v4.1/utility/pro/text-to-image | text | colors, resolution, aspect_ratio, output_format, background_color | Quote |
| [Recraft V4.1 Utility — Text to image](https://docs.higgsfield.ai/docs/models/recraft-v4-1-utility/text-to-image.md) | image | recraft/v4.1/utility/text-to-image | text | colors, resolution, aspect_ratio, output_format, background_color | Quote |
| [Recraft V4.1 — Text to image](https://docs.higgsfield.ai/docs/models/recraft-v4-1/text-to-image.md) | image | recraft/v4.1/text-to-image | text | colors, resolution, aspect_ratio, output_format, background_color | Quote |
| [Grok Image 2.0 — Generate and edit](https://docs.higgsfield.ai/docs/models/grok-image-2/generate-and-edit.md) | image | xai/grok-imagine-image-2.0 | text, reference | quality, resolution, aspect_ratio | Quote |
| [Happy Horse 1.0 — Image to video](https://docs.higgsfield.ai/docs/models/happy-horse-1/image-to-video.md) | video | alibaba/happy-horse/image-to-video | image | seed, duration, resolution | Quote |
| [Happy Horse 1.0 — Reference to video](https://docs.higgsfield.ai/docs/models/happy-horse-1/reference-to-video.md) | video | alibaba/happy-horse/reference-to-video | reference | seed, duration, resolution | Quote |
| [Happy Horse 1.0 — Text to video](https://docs.higgsfield.ai/docs/models/happy-horse-1/text-to-video.md) | video | alibaba/happy-horse/text-to-video | text | seed, duration, resolution, aspect_ratio | Quote |
| [HappyHorse 1.1 — Image to video](https://docs.higgsfield.ai/docs/models/happy-horse-1-1/image-to-video.md) | video | alibaba/happy-horse/v1.1/image-to-video | image | seed, duration, resolution | Quote |
| [HappyHorse 1.1 — Reference to video](https://docs.higgsfield.ai/docs/models/happy-horse-1-1/reference-to-video.md) | video | alibaba/happy-horse/v1.1/reference-to-video | reference | seed, duration, resolution | Quote |
| [HappyHorse 1.1 — Text to video](https://docs.higgsfield.ai/docs/models/happy-horse-1-1/text-to-video.md) | video | alibaba/happy-horse/v1.1/text-to-video | text | seed, duration, resolution, aspect_ratio | Quote |
| [Wan 2.6 — Image to video](https://docs.higgsfield.ai/docs/models/wan-2-6/image-to-video.md) | video | wan/v2.6/image-to-video | image, audio | seed, duration, resolution, multi_shots, prompt_extend, negative_prompt | Quote |
| [Wan 2.6 — Reference to video](https://docs.higgsfield.ai/docs/models/wan-2-6/reference-to-video.md) | video | wan/v2.6/reference-to-video | video | duration, resolution, aspect_ratio | Quote |
| [Wan 2.6 — Text to video](https://docs.higgsfield.ai/docs/models/wan-2-6/text-to-video.md) | video | wan/v2.6/text-to-video | text, audio | seed, duration, resolution, multi_shots, prompt_extend | Quote |
| [Wan 2.7 — Image to video](https://docs.higgsfield.ai/docs/models/wan-2-7/image-to-video.md) | video | wan/v2.7/image-to-video | image, firstLast, audio | seed, duration, resolution, prompt_extend, negative_prompt | Quote |
| [Wan 2.7 — Reference to video](https://docs.higgsfield.ai/docs/models/wan-2-7/reference-to-video.md) | video | wan/v2.7/reference-to-video | reference, video | seed, duration, resolution, aspect_ratio, prompt_extend, negative_prompt | Quote |
| [Wan 2.7 — Text to video](https://docs.higgsfield.ai/docs/models/wan-2-7/text-to-video.md) | video | wan/v2.7/text-to-video | text, audio | seed, duration, resolution, aspect_ratio, prompt_extend, negative_prompt | Quote |
| [Wan 3.0 Prime — Image to video](https://docs.higgsfield.ai/docs/models/wan-3-prime/image-to-video.md) | video | alibaba/wan-3.0-prime/image-to-video | image, firstLast | seed, duration, resolution, aspect_ratio, generate_audio, enable_thinking | Quote |
| [Wan 3.0 Prime — Reference to video](https://docs.higgsfield.ai/docs/models/wan-3-prime/reference-to-video.md) | video | alibaba/wan-3.0-prime/reference-to-video | text, reference, video, audio | seed, duration, file_url, link_url, resolution, aspect_ratio, generate_audio, enable_thinking | Quote |
| [Wan 3.0 Prime — Text to video](https://docs.higgsfield.ai/docs/models/wan-3-prime/text-to-video.md) | video | alibaba/wan-3.0-prime/text-to-video | text | seed, duration, resolution, aspect_ratio, generate_audio, enable_thinking | Quote |
| [Wan 3.0 — Image to video](https://docs.higgsfield.ai/docs/models/wan-3/image-to-video.md) | video | alibaba/wan-3.0/image-to-video | image, firstLast | seed, duration, resolution, aspect_ratio, generate_audio, enable_thinking | Quote |
| [Wan 3.0 — Reference to video](https://docs.higgsfield.ai/docs/models/wan-3/reference-to-video.md) | video | alibaba/wan-3.0/reference-to-video | text, reference, video, audio | seed, duration, file_url, link_url, resolution, aspect_ratio, generate_audio, enable_thinking | Quote |
| [Wan 3.0 — Text to video](https://docs.higgsfield.ai/docs/models/wan-3/text-to-video.md) | video | alibaba/wan-3.0/text-to-video | text | seed, duration, resolution, aspect_ratio, generate_audio, enable_thinking | Quote |
| [Seedance 2.0 — Image to video](https://docs.higgsfield.ai/docs/models/seedance-2/image-to-video.md) | video | bytedance/seedance-2.0/image-to-video | image, firstLast | duration, resolution, generate_audio | Quote |
| [Seedance 2.0 — Reference to video](https://docs.higgsfield.ai/docs/models/seedance-2/reference-to-video.md) | video | bytedance/seedance-2.0/reference-to-video | reference, video, audio | duration, resolution, aspect_ratio, generate_audio | Quote |
| [Seedance 2.0 — Text to video](https://docs.higgsfield.ai/docs/models/seedance-2/text-to-video.md) | video | bytedance/seedance-2.0/text-to-video | text | duration, resolution, aspect_ratio, generate_audio | Quote |
| [Seedance 2.5 — Image to video](https://docs.higgsfield.ai/docs/models/seedance-2-5/image-to-video.md) | video | bytedance/seedance-2.5/image-to-video | image, firstLast | duration, resolution, bitrate_mode, generate_audio | Quote |
| [Seedance 2.5 — Reference to video](https://docs.higgsfield.ai/docs/models/seedance-2-5/reference-to-video.md) | video | bytedance/seedance-2.5/reference-to-video | reference, video, audio | duration, resolution, aspect_ratio, bitrate_mode, generate_audio | Quote |
| [Seedance 2.5 — Video edit](https://docs.higgsfield.ai/docs/models/seedance-2-5/video-edit.md) | video | bytedance/seedance-2.5/video-edit | reference, video, audio | resolution, bitrate_mode, generate_audio | Quote |
| [Seedance 2.5 — Video extend](https://docs.higgsfield.ai/docs/models/seedance-2-5/video-extend.md) | video | bytedance/seedance-2.5/video-extend | reference, video, audio | duration, resolution, bitrate_mode, generate_audio | Quote |
| [Cinema Studio 4.0 — Generate](https://docs.higgsfield.ai/docs/models/cinema-studio-4/generate.md) | video | higgsfield/cinema-studio/4.0 | text, reference, video, audio | era, genre, light, pacing, duration, resolution, camera_lens, aspect_ratio, camera_model, color_palette, generate_audio, camera_aperture, camera_movement | Quote |
| [Genjutsu — Motion transfer](https://docs.higgsfield.ai/docs/models/genjutsu/motion-transfer.md) | video | higgsfield/genjutsu/motion-transfer/v1.0 | reference, video | resolution | Quote |
| [Genjutsu — Object swap](https://docs.higgsfield.ai/docs/models/genjutsu/object-swap.md) | video | higgsfield/genjutsu/object-swap/v1.0 | reference, video | resolution | Quote |
| [Genjutsu — Restyle](https://docs.higgsfield.ai/docs/models/genjutsu/restyle.md) | video | higgsfield/genjutsu/restyle/v1.0 | reference, video | preset_id, resolution | Quote |
| [Kling 2.5 Turbo — Pro image to video](https://docs.higgsfield.ai/docs/models/kling-2-5-turbo/pro-image-to-video.md) | video | kling-video/v2.5-turbo/pro/image-to-video | image | duration, cfg_scale, negative_prompt | Quote |
| [Kling 2.5 Turbo — Pro text to video](https://docs.higgsfield.ai/docs/models/kling-2-5-turbo/pro-text-to-video.md) | video | kling-video/v2.5-turbo/pro/text-to-video | text | duration, cfg_scale, negative_prompt | Quote |
| [Kling 2.5 Turbo — Standard image to video](https://docs.higgsfield.ai/docs/models/kling-2-5-turbo/standard-image-to-video.md) | video | kling-video/v2.5-turbo/standard/image-to-video | image | duration, cfg_scale, negative_prompt | Quote |
| [Kling 2.6 Motion Control — Pro](https://docs.higgsfield.ai/docs/models/kling-2-6-motion-control/pro.md) | video | kling-video/motion-control/pro | image, video | keep_original_sound, character_orientation | Quote |
| [Kling 2.6 Motion Control — Standard](https://docs.higgsfield.ai/docs/models/kling-2-6-motion-control/std.md) | video | kling-video/motion-control/std | image, video | keep_original_sound, character_orientation | Quote |
| [Kling 2.6 — Pro image to video](https://docs.higgsfield.ai/docs/models/kling-2-6/pro-image-to-video.md) | video | kling-video/v2.6/pro/image-to-video | image | sound, duration, cfg_scale, aspect_ratio | Quote |
| [Kling 2.6 — Pro text to video](https://docs.higgsfield.ai/docs/models/kling-2-6/pro-text-to-video.md) | video | kling-video/v2.6/pro/text-to-video | text | sound, duration, cfg_scale, aspect_ratio | Quote |
| [Kling 3.0 Motion Control — Pro](https://docs.higgsfield.ai/docs/models/kling-3-motion-control/pro.md) | video | kling-video/v3/motion-control/pro | image, video | keep_original_sound, character_orientation | Quote |
| [Kling 3.0 Motion Control — Standard](https://docs.higgsfield.ai/docs/models/kling-3-motion-control/std.md) | video | kling-video/v3/motion-control/std | image, video | keep_original_sound, character_orientation | Quote |
| [Kling 3.0 — 4K · Image to video](https://docs.higgsfield.ai/docs/models/kling-3/4k-image-to-video.md) | video | kling-video/v3.0/4k/image-to-video | image, firstLast | sound, duration, cfg_scale, multi_shots, multi_prompt | Quote |
| [Kling 3.0 — 4K · Text to video](https://docs.higgsfield.ai/docs/models/kling-3/4k-text-to-video.md) | video | kling-video/v3.0/4k/text-to-video | text | sound, duration, cfg_scale, multi_shots, aspect_ratio, multi_prompt | Quote |
| [Kling 3.0 — Pro · Image to video](https://docs.higgsfield.ai/docs/models/kling-3/pro-image-to-video.md) | video | kling-video/v3.0/pro/image-to-video | image, firstLast | sound, duration, cfg_scale, multi_shots, multi_prompt | Quote |
| [Kling 3.0 — Pro · Text to video](https://docs.higgsfield.ai/docs/models/kling-3/pro-text-to-video.md) | video | kling-video/v3.0/pro/text-to-video | text | sound, duration, cfg_scale, multi_shots, aspect_ratio, multi_prompt | Quote |
| [Kling 3.0 — Standard · Image to video](https://docs.higgsfield.ai/docs/models/kling-3/standard-image-to-video.md) | video | kling-video/v3.0/std/image-to-video | image, firstLast | sound, duration, cfg_scale, multi_shots, multi_prompt | Quote |
| [Kling 3.0 — Turbo · Image to video](https://docs.higgsfield.ai/docs/models/kling-3/turbo-image-to-video.md) | video | kling-video/v3.0-turbo/image-to-video | image | duration, resolution | Quote |
| [Kling 3.0 — Turbo · Text to video](https://docs.higgsfield.ai/docs/models/kling-3/turbo-text-to-video.md) | video | kling-video/v3.0-turbo/text-to-video | text | duration, resolution, aspect_ratio | Quote |
| [Kling O3 — First last frame](https://docs.higgsfield.ai/docs/models/kling-o3/first-last-frame.md) | video | kling-video/o3/first-last-frame | text, image, firstLast | mode, sound, duration, multi_shots, aspect_ratio, multi_prompt | Quote |
| [Kling O3 — Image reference](https://docs.higgsfield.ai/docs/models/kling-o3/image-reference.md) | video | kling-video/o3/image-reference | text, image, firstLast, reference | mode, sound, duration, shot_type, multi_shots, aspect_ratio, multi_prompt | Quote |
| [Kling O3 — Video edit](https://docs.higgsfield.ai/docs/models/kling-o3/video-edit.md) | video | kling-video/o3/video-edit | reference, video | mode | Quote |
| [Kling O3 — Video reference](https://docs.higgsfield.ai/docs/models/kling-o3/video-reference.md) | video | kling-video/o3/video-reference | reference, video | mode, duration, aspect_ratio | Quote |
| [Kling Omni — First last frame](https://docs.higgsfield.ai/docs/models/kling-omni/first-last-frame.md) | video | kling-video/omni/first-last-frame | image, firstLast | mode, duration, aspect_ratio | Quote |
| [Kling Omni — Image reference](https://docs.higgsfield.ai/docs/models/kling-omni/image-reference.md) | video | kling-video/omni/image-reference | text, reference | mode, duration, aspect_ratio | Quote |
| [Kling Omni — Video edit](https://docs.higgsfield.ai/docs/models/kling-omni/video-edit.md) | video | kling-video/omni/video-edit | reference, video | mode | Quote |
| [Kling Omni — Video reference](https://docs.higgsfield.ai/docs/models/kling-omni/video-reference.md) | video | kling-video/omni/video-reference | reference, video | mode, duration, aspect_ratio | Quote |
| [LTX-2.5 — Image to video fast](https://docs.higgsfield.ai/docs/models/ltx-2-5/image-to-video-fast.md) | video | lightricks/ltx-2.5/image-to-video/fast | image, firstLast | fps, duration, resolution, aspect_ratio, generate_audio, camera_movement | Quote |
| [LTX-2.5 — Image to video pro](https://docs.higgsfield.ai/docs/models/ltx-2-5/image-to-video-pro.md) | video | lightricks/ltx-2.5/image-to-video/pro | image, firstLast | fps, duration, resolution, aspect_ratio, generate_audio, camera_movement | Quote |
| [LTX-2.5 — Text to video fast](https://docs.higgsfield.ai/docs/models/ltx-2-5/text-to-video-fast.md) | video | lightricks/ltx-2.5/text-to-video/fast | text | fps, duration, resolution, aspect_ratio, generate_audio, camera_movement | Quote |
| [LTX-2.5 — Text to video pro](https://docs.higgsfield.ai/docs/models/ltx-2-5/text-to-video-pro.md) | video | lightricks/ltx-2.5/text-to-video/pro | text | fps, duration, resolution, aspect_ratio, generate_audio, camera_movement | Quote |
| [Hailuo 2.3 — Standard image to video](https://docs.higgsfield.ai/docs/models/hailuo-2-3/standard-image-to-video.md) | video | minimax/hailuo-2.3/standard/image-to-video | image | duration, prompt_optimizer | Quote |
| [Hailuo 2.3 — Standard text to video](https://docs.higgsfield.ai/docs/models/hailuo-2-3/standard-text-to-video.md) | video | minimax/hailuo-2.3/standard/text-to-video | text | duration, prompt_optimizer | Quote |
| [MiniMax H3 — Image to video](https://docs.higgsfield.ai/docs/models/minimax-h3/image-to-video.md) | video | minimax/h3/image-to-video | image, firstLast | duration, resolution, aspect_ratio, aigc_watermark | Quote |
| [MiniMax H3 — Reference to video](https://docs.higgsfield.ai/docs/models/minimax-h3/reference-to-video.md) | video | minimax/h3/reference-to-video | reference, video, audio | duration, resolution, aspect_ratio, aigc_watermark | Quote |
| [MiniMax H3 — Text to video](https://docs.higgsfield.ai/docs/models/minimax-h3/text-to-video.md) | video | minimax/h3/text-to-video | text | duration, resolution, aspect_ratio, aigc_watermark | Quote |
| [PixVerse V6 — Image to video](https://docs.higgsfield.ai/docs/models/pixverse-v6/image-to-video.md) | video | pixverse/v6/image-to-video | image, firstLast | seed, duration, resolution, generate_audio, negative_prompt | Quote |
| [PixVerse V6 — Text to video](https://docs.higgsfield.ai/docs/models/pixverse-v6/text-to-video.md) | video | pixverse/v6/text-to-video | text | seed, duration, resolution, aspect_ratio, generate_audio, negative_prompt | Quote |
| [Grok Imagine Video 1.5 — Reference to video](https://docs.higgsfield.ai/docs/models/grok-video-1-5/reference-to-video.md) | video | xai/grok-imagine-video/v1.5/reference-to-video | text, image, reference, audio | duration, resolution, aspect_ratio | Quote |
| [Soul 2 — Image to image](https://open.higgsfield.ai/models/higgsfield-ai/soul/v2/image-to-image/api-reference) | image | higgsfield-ai/soul/v2/image-to-image | image | aspect_ratio, resolution, style_id, seed, batch_size | Exact public rule + live quote |
| [AI Influencer — Character sheet](https://open.higgsfield.ai/models/higgsfield/ai-influencer/api-reference) | image | higgsfield/ai-influencer | text, image, reference | tier, selection, seed, variation_index, body_color | Exact public rule + live quote |


## Unverified, excluded or intentionally separate

Absence from the current public documents is not proof that a model can never be accessed. These entries are omitted from the picker until an exact production REST path and complete schema can be independently verified.

| Candidate from the creator prompt / site | Status and reason |
| --- | --- |
| Nano Banana, 2, 2 Lite, Pro | Unverified REST contract; connector/CLI job-set names are not REST paths |
| GPT Image 2 / 2.5 standalone | Unverified standalone REST contract; Marketing Studio and Ads Studio are separately documented workflows |
| Seedream 4.5 / 5.0 Lite | Unverified public REST contract in this source set |
| Flux 2, Flux Kontext, Flux 3 video | Creator-prompt inventory not corroborated by the current public model schemas |
| Kling O1 Image | Unverified image endpoint; documented Kling Omni video endpoints are separate |
| Soul Cast / Soul Location | Unverified standalone REST contract |
| Veo 3 / 3.1 / 3.1 Lite, Gemini Omni Flash | Unverified public REST contracts in this source set |
| Seedance 1.5 Pro; 2.0 Fast/Mini | Unverified older/variant paths; only explicitly documented current paths are enabled |
| Higgsfield DoP | Unverified current REST model contract |
| Marketing Studio video | Unverified separate REST contract; image variants are included |
| Upscale, outpaint, image/video background removal | No exact production REST schema verified |
| Seed Audio, Inworld TTS, Mirelo audio, Sonilo music | No standalone audio-generation REST contract verified |
| 3D generation | Outside v1 scope, and no enabled 3D endpoint verified |
| Soul ID character training | Verified POST /v1/custom-references, but separate training lifecycle and explicitly v2 scope; never POST to /soul-id |
| AI Influencer private trait/species overrides | Public generation endpoint enabled, but non-public valid override catalogs prevent safe selection of those optional IDs |
| Raw account asset IDs | Soul character IDs and Kling elements blocked until app-user ownership can be resolved |

The source for Soul ID's distinct workflow is [Create character](https://docs.higgsfield.ai/docs/models/soul-id/create-character.md). The API supports audio artifacts and native video audio, but that does not establish a standalone audio generation endpoint.

## Documented differences from the creator prompt

1. Seedance uses explicit production workflow paths such as bytedance/seedance-2.5/text-to-video; the family prefix alone is not an enabled path.
2. The current API documents Idempotency-Key and authenticated estimates. Both are implemented.
3. The supplementary OpenAPI has older Soul Standard fields (num_images, 2K/4K) that conflict with the current model-specific schema (batch_size, 720p/1080p). The model-specific schema wins.
4. The Mintlify index does not contain Soul 2 editing or AI Influencer; the public console's model-specific reference adds them.
5. No official webhook signature format was verified. A generation-specific HMAC URL plus authenticated status refetch is used.
6. No API purchase, credential creation, paid sample generation, or account permission change was made.

## Refresh and validation

Review the official console and per-model docs before changing an endpoint, setting or price. Update the corresponding source snapshot, schema, public metadata, media mapping and documented request fixture together. Keep raw documentation and AJV server-only. Run:

    node node_modules/vitest/vitest.mjs run tests/catalog.test.ts
    node node_modules/eslint/bin/eslint.js lib/catalog/*.ts lib/higgsfield/*.ts tests/catalog.test.ts
    node node_modules/typescript/bin/tsc --noEmit --pretty false

The provider integration contract, response shapes, ambiguity handling and remaining live tests are in docs/provider-contract.md.
