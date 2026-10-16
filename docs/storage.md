# Media storage and retention

Implementation: `lib/storage/index.ts`, `store.ts`, `network.ts`, `validation.ts`, `direct-contract.ts`, `direct.ts`, and `app/api/uploads/direct/route.ts`.

Fusion Gen Matrix uses this module to save user uploads and generated outputs privately. It never decides who may access a file: the API route must first authorize an owned upload/generation or an explicitly published generation. An object key is not an access credential.

## Server API

| Export | Result |
| --- | --- |
| `saveUpload(userId, file)` | Validates declared type, size and file signature; saves the bytes; returns `StoredUpload` with `r2Key`. Does not call Higgsfield or submit a generation. |
| `getProviderMediaUrl({r2Key, contentType, providerUrl?})` | Reads the previously authorized object and uploads it using Higgsfield's signed instructions. Returns the provider input URL. Call before credit debit. |
| `retainOutputs(generation, providerOutputs)` | Copies every supported provider result into durable private storage before returning the complete `Output[]`. A failed copy rejects the whole operation; the caller must leave retention pending. |
| `createDemoOutput(generation)` | Saves an original, visibly labeled sample. Image samples are fixed trusted SVGs. Video samples require `public/fixtures/demo-motion.mp4`. Audio preview generation is unavailable because no standalone provider model has been verified. |
| `readMedia(key, range?)` | Returns a bounded-syntax single byte range or full stream, content type, length, range and status. Authorization belongs in the calling route. |
| `removeMedia(keys)` | Removes at most 100 explicitly supplied, validated studio keys. The caller must authorize every key. |

`Upload.providerUrl` and generation provider input URLs are server-only data. Strip them from public JSON. Do not accept `r2Key`, `providerUrl` or an arbitrary URL directly from a client as authorization. Resolve a client-supplied upload/generation ID to its owned database record first.

The optional `providerUrl` argument is for a trusted, already persisted provider input when an exact request must be retried with the same idempotency key. Provider uploads are temporary. For a new generation, prepare a fresh input from the durable object instead of treating an old provider input URL as permanent.

Paths are `u/<userId>/uploads/<uploadId>.<extension>` and `u/<userId>/generations/<generationId>/<index>.<extension>`. Browser URLs are `/api/media/<key>`; no R2 public bucket or public object URL is required. Each output index has a deterministic path so a retention retry overwrites the same private object rather than accumulating duplicate files. A retry must use the same provider result ordering.


## Direct uploads on Vercel

Live clients use `POST /api/uploads/direct` with small JSON metadata requests. File bytes travel directly from the browser to the provider's scoped upload URL, then the server verifies and retains a private copy. This avoids sending the file through Vercel's [4.5 MB function payload limit](https://vercel.com/docs/functions/limitations).

1. Prepare: send `{stage:"prepare",name,contentType,bytes}`. The authenticated, same-origin endpoint returns `{uploadId,uploadUrl,headers,expiresAt}` and persists an owned pending record. Browser upload supports JPEG/PNG/WebP/GIF up to 20 MiB, MP4 up to 200 MiB, and WAV up to 50 MiB.
2. PUT the file to `uploadUrl` with exactly the returned headers, `credentials:"omit"`, and `redirect:"error"`. Never attach the studio session or Higgsfield API authorization.
3. Complete: send `{stage:"complete",uploadId}`. The server reads the provider URL from the owned pending record, verifies exact byte length, signature and content type, and saves the private R2 object. Only then does it persist and return `{upload}` with `status:"ready"` and a private studio media URL.

Request schemas reject extra URL/key fields. Metadata is limited to 4 KiB while streaming, including requests without Content-Length. Pending uploads expire after one hour and cannot be used as generation inputs. Completion claims a five-minute database lease; concurrent completion returns `409 UPLOAD_FINALIZING`. A failure releases the lease for retry, and repeated completion of an already ready upload returns the same record without another download. Expired pending uploads return `410 UPLOAD_EXPIRED`; begin a new upload.

Ready records omit `providerUrl`. The browser's signed PUT may remain usable until its expiry, so the temporary provider object is not trusted as immutable after verification. A new generation uploads the verified private bytes to a fresh server-controlled provider upload. Exact generation retries continue using their already persisted `generation.providerMedia`.

`HF_UPLOAD_ORIGINS` must contain the exact verified HTTPS upload origins, separated by commas. Empty configuration or a returned origin outside this list blocks preparation with HTTP 503. Wildcards, IP literals, local hosts, credentials, paths, queries and non-default ports are rejected. The app's `connect-src` CSP must permit those same origins. This setting is separate from the optional server download-host restriction `HF_MEDIA_ALLOWED_HOSTS`.

The official [Higgsfield upload instructions](https://docs.higgsfield.ai/docs/concepts/file-uploads.md) specify the signed PUT, returned headers and one-hour expiry, but use illustrative `storage.example.com` and `cdn.example.com` URLs. They do not verify production origins or browser CORS for this deployment. Do not configure the example domains as if they were real provider storage. Actual origin discovery and a browser CORS round trip remain live acceptance checks. The browser upload has not been verified against a live provider account.

The completion route declares a 300-second execution budget. Bounded download and private retention still consume server memory, execution time and transfer capacity; configure the deployment for the supported file sizes and verify a representative large video. The metadata protocol avoids the incoming file-body limit without claiming unlimited upload size or capacity.

## Formats and bounds

Images: JPEG, PNG, WebP, GIF, at most 20 MiB each. Video: MP4, WebM, MOV, at most 200 MiB each. Audio: MP3, WAV, OGG with Vorbis/Opus identification, M4A, at most 50 MiB each. Empty files, unsupported types, type/signature mismatches, SVG and HTML uploads are rejected. Signatures identify a container; this is not a complete codec-decoding or malware-scanning guarantee.

Current Higgsfield signed-upload documentation supports JPEG/PNG/WebP/GIF/MP4/WAV. Other validated formats can be stored but cannot be prepared as provider inputs by this adapter. This is an explicit pre-generation error, not a paid attempt. Model-specific input constraints remain the catalog/service's responsibility.

Retention allows at most 32 outputs and downloads them sequentially. Each transfer is bounded by the relevant byte limit, a 120-second maximum request timeout and a 5-second DNS resolution timeout. Content-Length is checked when present; received bytes are counted independently. Bytes are buffered within that per-file limit before writing. A deployment must have enough memory and request-body capacity for its selected upload limit and generation concurrency; the app's 200 MiB file cap does not override a hosting platform's smaller upload cap.

Non-media artifacts such as ZIP, JSX, FBX and PLY currently block successful retention. They are not silently discarded. Models requiring such artifacts need a separate artifact retention design before claiming those outputs are supported.

## Network boundary

Only direct HTTPS URLs with ordinary DNS hostnames are accepted. Userinfo, fragments, non-default ports, IP literals, local/special suffixes, redirects and any private/reserved DNS answer are rejected. All resolved addresses are checked, then the actual HTTPS connection is pinned to one validated address. TLS SNI and normal certificate verification retain the original hostname. This prevents DNS rebinding between validation and connection.

No universal production output-CDN allowlist is claimed from the provider's example URLs. The optional server setting `HF_MEDIA_ALLOWED_HOSTS` is a comma-separated exact-hostname allowlist that can be populated from verified production provider output and upload origins. It applies to both output downloads and signed uploads. With no allowlist configured, public DNS plus address pinning remains enforced, and callers must supply only URLs returned by the authenticated provider.

The signed PUT sends the provider's documented headers and an accurate Content-Length. Higgsfield authorization, cookies, proxy authorization, Host, Transfer-Encoding, Connection and Upgrade cannot be forwarded. Provider error bodies, signed URLs and credentials are not logged or included in error messages.

Serve every media response with `X-Content-Type-Options: nosniff` and `Cache-Control: private, no-store`. Serve sample SVGs with `Content-Security-Policy: sandbox; default-src 'none'`. The fixed sample contains no user prompt, script, external resources, links, animation or foreignObject. Never extend that exemption to uploaded SVG.

## Local and live stores

Public showcase mode rejects private storage operations with HTTP 503 before constructing a provider or R2 client.

Preview files live under `<DATA_DIR>/media`. Writes use a private temporary file, fsync and atomic rename. A new store instance can read earlier files, including after application restart.

Live storage uses the official S3-compatible R2 endpoint, region `auto`, private objects, and the configured bucket. Required configuration is `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`; provider input preparation additionally requires `HF_CREDENTIALS`. The wider app validates its own required live configuration. Account IDs and bucket names are constrained; endpoints cannot be redirected via an arbitrary environment URL.

## Verification and remaining live checks

Focused tests: `node node_modules/vitest/vitest.mjs run tests/storage.test.ts`. Tests cover signature/type/size validation, path traversal, range behavior, private/reserved DNS including alternate IPv6 spellings, actual pinned HTTPS lookup, signed-header forwarding, redirect/oversize rejection, durable local reads and deletion, fresh provider input preparation, deterministic output retention, a later-copy failure, explicit sample behavior, bounded streams, mocked R2 operations, direct-upload metadata limits, exact origin restrictions, ownership, expiry, concurrent completion, retry leases, and regeneration from verified private bytes.

The local and mocked tests make no paid generation calls and create no credentials or provider resources. R2 credentials and the standalone Higgsfield REST credentials were not available for this task, so a real bucket put/get/delete, a real signed upload, and a generated provider-output retention round trip have NOT been verified. Those are the finite live acceptance checks remaining; mocked SDK results do not establish live access.

Sources verified 2026-10-15:
- [Higgsfield file uploads](https://docs.higgsfield.ai/docs/concepts/file-uploads.md), also retained in the local research archive.
- [Cloudflare R2 S3 API compatibility](https://developers.cloudflare.com/r2/api/s3/api/).
