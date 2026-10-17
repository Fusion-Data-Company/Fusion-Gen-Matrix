# One Seedance 2.5 generation with the official SDK

This standalone Node 22 / TypeScript example uses `@higgsfield/client@0.2.6` and the existing pnpm setup. It does not enable live generation in the deployed web app. Its only generation request is the official SDK's `subscribe` call for `bytedance/seedance-2.5/text-to-video`, using exactly:

```json
{"prompt":"A cinematic scene at sunset","duration":5,"resolution":"720p","aspect_ratio":"16:9"}
```

## Local credential entry (Robert only)

Open `examples/higgsfield/.env.local` in a local text editor. It is already ignored by Git and created with owner-only permissions. Enter the existing **Higgsfield** credential directly there:

```dotenv
HF_CREDENTIALS="YOUR_KEY_ID:YOUR_KEY_SECRET"
```

Do not paste a real credential into chat, a command argument, screenshots, or source code. Do not use a Hostinger key or another service's key. Agents must not read, print, log, or commit this file. The example loads it internally with Node's built-in environment loader; no extra dotenv dependency is needed. Inherited credential variables are ignored. Account login alone does not configure this file.

## Check, quote, then authorize one request

From the project root, with Node 22 on PATH:

```sh
pnpm hf:seedance --check
pnpm hf:seedance --estimate
```

The first command checks only local format and file permissions. The second calls the non-generating estimate endpoint with the exact input. Neither generates a video. Account access is verified only by a successful authenticated response.

On October 17, 2026, the official model page lists roughly **$0.4622/second at 720p and 16:9**, approximately **$2.311 for five seconds before customer discounts**. Actual price depends on output dimensions and billable duration. The authenticated estimate is authoritative; the public starting price for 480p is not this job's price. Obtain a spending ceiling for this one job (suggested $2.50 if its fresh estimate fits). No credit purchase or top-up is authorized by this example.

Only after local entry and approval of that ceiling:

```sh
pnpm hf:seedance --generate --max-usd=2.50
```

The example obtains a fresh estimate and refuses an over-budget request. `maxRetries: 0` disables SDK submission retries. A private receipt is created exclusively **before** submission at `.data/higgsfield-sdk/seedance-attempt.json`, with one idempotency key. Every later `--generate` refuses to submit again, including after network uncertainty or terminal failure. Do not delete that receipt to force another job.

```sh
pnpm hf:seedance --resume
```

Resume polls the same saved request and cannot submit another generation. If the response was lost before the request ID was saved, reconcile the existing attempt in Higgsfield Requests rather than resubmitting. Failed, canceled and moderated states are failures, not completed videos. Polling stops after 15 minutes; a remote job may continue after the local wait ends. No cancellation or credit top-up is automatic.

The installed SDK's automatic poller omits `canceled`, so this example calls official `subscribe` with `withPolling: false`, persists the ID immediately and performs bounded reads of the documented status endpoint, handling cancellation correctly. Only `completed` plus a public HTTPS output passing HTTP and MP4/MOV header checks prints a video URL. This verifies reachability/container identity, not full playback or visual quality. Save outputs separately if needed long term; the provider guarantees at least seven days' retention.

Provider errors, response bodies and headers are never printed. Error reports are curated; receipt data contains only fixed input, quote/ceiling, request identifiers, status and output URL, never credentials. Keep this file server-side; never import the example into client components or application routes.

## Official references read before implementation

- [SDK guide](https://docs.higgsfield.ai/docs/how-to/sdk)
- [Seedance 2.5 API reference](https://console.higgsfield.ai/models/bytedance/seedance-2.5/text-to-video/api-reference)
- [Model pricing](https://open.higgsfield.ai/models/bytedance/seedance-2.5/text-to-video/playground)
- [Billing, estimates and retention](https://docs.higgsfield.ai/docs/concepts/billing-and-retention)
- [Official SDK source](https://github.com/higgsfield-ai/higgsfield-js)
