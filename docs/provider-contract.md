# Higgsfield provider contract

Verified against public official documentation on 2026-10-15. The adapter is original code; no unlicensed app-template implementation was copied. No API credentials were read or created, and no paid generation was submitted during implementation.

## Modules and caller contract

- `lib/catalog/index.ts`: browser-safe `models`, `getModel`, `priceFor`, `creditsForUsd` and types. No SDK, schema compiler or raw documentation is imported.
- `lib/catalog/server.ts`: server-only `validateInput(modelId, prompt, settings, media)` and `mapToProvider(validated)`. The latter revalidates the input and obtains its path from the catalog.
- `lib/higgsfield/client.ts`: server-only `HiggsfieldClient({credentials, baseUrl?, fetch?})`.
- `lib/higgsfield/webhook.ts`: server-only `createWebhookToken`, `verifyWebhookToken` and `buildWebhookUrl`.

Settings remain `Record<string,string|number|boolean>`. Optional structured fields such as `multi_prompt`, `colors` and AI Influencer `selection` are JSON text controls with `valueKind: "json"`; the server parses them and validates the nested schema. Omitted optional settings stay omitted. Explicit empty arrays and omitted arrays are not blindly interchanged during retries.

Media roles map to model-specific parameter names. For example, Kling O3 uses `first_frame_url`/`last_frame_url`, while Kling 3 uses `image_url`/`last_image_url`. All media must first be resolved from ownership-checked server records. HTTPS URL validation is an additional defense, not an ownership check. Forward verified content type, bytes, dimensions and duration when available; source-duration limits cannot be proven when metadata is absent. The provider still validates and decodes actual media.

## Provider methods

| Method | Input | Result |
| --- | --- | --- |
| `submit` | Validated input; required persisted `idempotencyKey`; optional `webhookUrl` | `{requestId,status,outputs,error?,statusUrl?,cancelUrl?,correlationId?}` |
| `status` | Request ID; optional returned status URL | Same normalized result; rejects a mismatched request ID |
| `cancel` | Request ID; optional returned cancel URL | Empty HTTP 202 maps to canceled; HTTP 400 remains an error |
| `estimate` | Validated input | `{usd,providerCredits,correlationId?}` |
| `signedUpload` | Documented content type | `{uploadUrl,publicUrl,contentType,headers}` |

Output kinds are image, video, audio or artifact. Known additional artifacts are zip, mov, jsx, fbx and ply; mov is video. Audio/audios aliases are deduplicated. The storage caller must retain supported outputs before marking a generation available long term.

The only configured API origin allowed is `https://api.higgsfield.ai`. Credentials use `Authorization: Key key_id:key_secret`. Redirects are rejected; returned status/cancel URLs must match the official origin and requested operation. Credentials and signed URLs are never logged. [Authentication](https://docs.higgsfield.ai/docs/authentication.md)

## Idempotency and uncertain outcomes

The current API explicitly supports `Idempotency-Key` with 1–255 visible ASCII characters. Persist the key, endpoint, JSON body and webhook URL before submitting. Retry that exact intent with the same key. A replay receipt may say queued even when processing finished; fetch its status. Never generate a fresh key automatically after a mismatch or timeout. [Official idempotency contract](https://docs.higgsfield.ai/docs/concepts/idempotency.md)

The client uses bounded exponential backoff and jitter for network failures, 429 and 5xx. Defaults: three attempts, 12-second per-attempt timeout, 30-second total deadline. `HiggsfieldError.ambiguous` remains true after any possibly accepted submission, even if a later retry returns a 4xx. A validation/authentication rejection on the first attempt has `ambiguous: false`. An unreadable successful submission response is ambiguous. Preserve the local pending operation and reconcile instead of refunding or submitting a new intent prematurely. [Errors](https://docs.higgsfield.ai/docs/concepts/errors.md)

Account concurrency can return HTTP 400. Do not interpret every 400 as a retryable rate limit. The provider does not publish standard rate-limit or Retry-After headers at present. [Rate limits](https://docs.higgsfield.ai/docs/concepts/rate-limits.md)

## Pricing and webhooks

Public exact prices are stored only for Soul 2 text/image and AI Influencer. Other entries have `price: null`, `priceVerified: false`; `priceFor` throws instead of assigning a fictitious zero. For every live submit, call authenticated `POST /estimate/{verified-path}` with the exact validated body and apply the application markup and credit rounding to its USD amount. Public promotional ranges are not authoritative account quotes. [Billing and retention](https://docs.higgsfield.ai/docs/concepts/billing-and-retention.md)

Webhook URLs contain a generation-scoped HMAC token verified in constant time. This authenticates the callback URL, not the remote payload. Always load the owned generation and refetch its stored provider request ID using server credentials. No documented webhook signature scheme was found, so the code does not invent one. Record/deduplicate terminal events and reply within ten seconds. Deliveries can repeat and retry for up to two hours. [Webhooks](https://docs.higgsfield.ai/docs/how-to/webhooks.md)

## Upload contract

Supported types: JPEG/JPG, PNG, WebP, GIF, MP4 and WAV/x-WAV. An upload instruction expires after one hour. Use every returned upload header, send no Higgsfield credentials to storage, and use browser `credentials: "omit"` when uploading directly. File size, magic bytes, per-user limits and ownership belong in the app upload service. [Uploads](https://docs.higgsfield.ai/docs/concepts/file-uploads.md)

## Verification and remaining boundaries

`tests/catalog.test.ts` covers every documented example and rejection cases, price rounding, conditional fields, provider retry ambiguity, upload headers, status normalization, cancel and webhook tokens. All provider calls in tests are mocked.

Live per-account model access, actual API estimates, paid image/video completion, real webhook delivery, and retention in configured R2 remain unverified until the application has the required server credentials, storage and a bounded generation budget. No standalone audio-generation REST model was verified. This is a provider capability boundary; video with native audio and audio reference inputs are supported where documented.
