# Fusion Gen Matrix launch runbook

Use this runbook to publish a read-only showcase, then configure and verify the live studio. The showcase and live acceptance are separate milestones. A repository URL, a successful build, or a Vercel READY status alone does not prove provider execution.

The authorized source destination is [Fusion-Data-Company/Fusion-Gen-Matrix](https://github.com/Fusion-Data-Company/Fusion-Gen-Matrix), with default branch `Fusion-Data-Co`. The repository is public. Publish only application source, approved assets and normal project documentation; exclude populated environment files, local data, caches and credentials. This document contains no claimed Vercel deployment URL. Record the returned URL and deployment ID after publication succeeds.

## 1. Establish the release checkpoint

Use Node.js 22.x and pnpm 10.34.7. Install from the lockfile and run:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
APP_MODE=showcase pnpm build
```

The build runs the client secret scan automatically. Use `pnpm security:scan` to recheck an existing build if needed. Record the source commit, runtime versions, command results and deployment environment. The 2026-10-15 (PDT) release checkpoint passed 185 tests, TypeScript, ESLint and the production build. Local checks used Node.js 25.8.2; deployment targets Node.js 22.x. See [verification and limits](verification.md).

Inspect the current UI in a browser at desktop and mobile widths. The standalone runners require an already running server plus Google Chrome:

```sh
BASE_URL=http://127.0.0.1:3210 pnpm test:e2e
BASE_URL=http://127.0.0.1:3210 pnpm test:smoke
# Against showcase mode only:
BASE_URL=http://127.0.0.1:3210 node scripts/browser-showcase.mjs
```

Run `test:e2e` only against a local demo server with fresh disposable `DATA_DIR`. It mutates local preview state and covers identity, retained image/video, projects, cross-user denial, publishing, upload, refunds, cancellation, admin and mobile rendering. For a production-build check, start the server with `APP_MODE=demo ALLOW_LOCAL_PREVIEW=true` and that fresh data directory. Inspect `docs/evidence/browser-workflow.json`; the complete runner must report `status: "passed"`. The production-build demo passed all 14 workflow checks plus four edge-case checks. A local showcase passed six checks.

The smoke runner is read-only and can target a public showcase. It captures screenshots and prints browser errors and overflow measurements; review them explicitly rather than treating its exit code as a visual assertion. Also exercise navigation, generator settings, responsive dialogs, error states and the read-only boundary. Preserve evidence for the actual deployment. Existing `docs/evidence/` screenshots do not prove that a new public URL has been inspected. No Lighthouse score or screenshot-perfect Higgsfield parity is asserted.

## 2. Publish the public showcase

Configure the dedicated Vercel project with:

| Setting | Value |
| --- | --- |
| Repository / branch | Fusion-Data-Company/Fusion-Gen-Matrix / Fusion-Data-Co |
| Framework | Next.js |
| Root directory | Repository root |
| Node runtime | 22.x |
| Install command | `pnpm install --frozen-lockfile` |
| Build command | `pnpm build` |
| Output directory | Framework default |
| `APP_MODE` | `showcase` |
| `BILLING_PRICES_CONFIRMED` | `false` |
| `ENABLE_LIVE_BILLING` | `false` |

No MongoDB, email, Higgsfield, R2 or Stripe secret is needed for showcase. Set `APP_URL` to the actual public origin once assigned and redeploy if necessary. Keep demo data and `ALLOW_LOCAL_PREVIEW` out of the public environment.

After Vercel reports READY:

1. Open the returned deployment URL and verify the visible Fusion Gen Matrix interface. Run `BASE_URL=<actual-showcase-url> pnpm test:smoke` against it and review the screenshots and diagnostics.
2. Read `/api/studio`: mode must be `showcase`, user must be null, and live capabilities must be false.
3. Verify account, upload, generation and billing actions explain their unavailable state. An API mutation must return the read-only error rather than create state.
4. Verify `/api/demo/login` cannot create the local operator identity remotely.
5. Save the exact deployment URL, deployment ID, source commit and browser evidence. Only then report the public preview as deployed and inspected.

Do not schedule the live reconciler for showcase; it returns `CRON_DISABLED`. Vercel cron jobs run on production deployments, not preview deployments. [Vercel cron deployment behavior](https://vercel.com/docs/cron-jobs/quickstart)

## 3. Configure the live environment

Use a separate environment for live acceptance before opening paid access. Populate the variables below using the intended accounts. The app validates the complete required live configuration together; switching `APP_MODE=live` with only one provider configured fails closed.

| Group | Variables and behavior |
| --- | --- |
| App | `APP_MODE=live`; `APP_URL` and `AUTH_URL` set to the exact HTTPS studio origin |
| Database | Default `DATABASE_PROVIDER=postgres`: dedicated Matrix Neon database, pooled `DATABASE_URL`, and the reviewed [Postgres migration](postgres.md). Explicit legacy MongoDB mode requires `MONGODB_URI` and a transaction-capable replica set |
| Auth | `AUTH_SECRET` with at least 32 characters; `ADMIN_EMAILS` is the comma-separated server admin allowlist |
| Resend | `AUTH_RESEND_KEY`; `EMAIL_FROM` on a verified sending domain |
| Higgsfield | `HF_CREDENTIALS=key_id:key_secret`; `HF_API_BASE_URL=https://api.higgsfield.ai`; `HF_WEBHOOK_SECRET` with at least 32 characters |
| Callback origin | `HF_WEBHOOK_BASE_URL` set to the reachable HTTPS studio origin to enable provider callbacks; an empty value omits the callback and relies on reconciliation |
| Private media | Default `MEDIA_STORAGE_PROVIDER=vercel-blob`: private Blob store with `BLOB_STORE_ID` and platform-managed OIDC, or an existing `BLOB_READ_WRITE_TOKEN`. Explicit legacy R2 mode requires `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`. See [storage](storage.md); store creation/connection and any data migration are separate reviewed steps |
| Direct upload origins | `HF_UPLOAD_ORIGINS`: comma-separated exact provider HTTPS origins verified from the actual signed upload contract |
| Optional transfer restriction | `HF_MEDIA_ALLOWED_HOSTS`: exact hostnames for server-side transfers; if used, include verified upload and output hosts |
| Scheduler | `CRON_SECRET` with at least 32 characters |
| Costs | `MAX_GENERATION_USD` defaults to 5; `CREDIT_MARKUP` to 2; `CREDIT_USD_VALUE` to 0.01; `SIGNUP_BONUS_CREDITS` to 0 |
| Proxy | `TRUST_PROXY=true` only for a known trusted reverse proxy outside Vercel; the app already recognizes Vercel |

Use independent high-entropy values for the three application secrets. Never place server credentials in `NEXT_PUBLIC_*` variables. A connected desktop Higgsfield tool is distinct from the standalone app's server REST credentials.

Next.js loads supported local environment files during application startup. The standalone database initialization command needs the variables in its process environment. Either export them through the operator's environment mechanism and run `pnpm db:init`, or explicitly load an ignored local file with Node 22:

```sh
node --env-file=.env.local --conditions=react-server --import tsx scripts/db-init.ts
```

In MongoDB mode this creates/verifies indexes; in Postgres mode it only verifies the schema marker. Apply the explicit [Postgres migration](postgres.md) separately before activation. Neither operation seeds paid balances. Use the designated application database. [Next.js environment loading](https://nextjs.org/docs/app/guides/environment-variables)

### Minimum for one monitored private-media workflow

The live implementation requires a configured Neon Postgres database (or explicitly selected legacy MongoDB), Auth.js with Resend magic-link delivery, and private Vercel Blob storage (or explicitly selected legacy R2). The database holds sessions, rate limits, jobs and the transactional credit ledger. Resend is the only configured live sign-in provider. A generation is marked completed only after its output is retained privately. The loopback demo login, local file store and temporary provider URLs are not substitutes for those live services.

The following can be deferred for a first **operator-monitored text-only request**, without removing capabilities:

- **Stripe subscriptions/top-ups and receipts:** keep both billing flags false and the signup bonus at zero. After authenticated operator access is verified, use the existing admin credit adjustment with an explicit note and bounded allowance for the authorized account. These application credits do not fund the separate Higgsfield account. `ADMIN_EMAILS` grants an admin role; it is not a sign-in allowlist.
- **Browser reference uploads/CORS:** start with a text-to-image or text-to-video model. Keep uploads unavailable until actual signed-upload origins and browser CORS are verified. Private output retention is still required.
- **Callbacks and an automatic schedule:** `HF_WEBHOOK_BASE_URL` may remain empty and the existing owned result's Refresh status action can perform authoritative polling and retention. This requires active operator monitoring; ordinary UI polling reads stored state only. Configure automatic reconciliation before unattended use. `HF_WEBHOOK_SECRET` and `CRON_SECRET` remain required live configuration even when callback delivery and the schedule are deferred.
- **Commercial offers and broader feature acceptance:** defer paid plans, public launch, every-model acceptance and standalone audio; do not label them complete. Approve the relevant legal text before live registration/payment rollout.

All required live values must be securely entered before switching `APP_MODE`. Initialize indexes, verify real sign-in and private retention, then obtain a fresh model quote and the explicit bounded generation authorization. This checklist does not authorize funding purchases, credential creation or a retry of an uncertain prior request.

The standalone `pnpm hf:seedance` example already runs without MongoDB, Resend or R2, but it is a local operator tool, not the authenticated web app. Preserve its existing receipt and reconcile an uncertain submission before any later execution.

## 4. Verify identity and private storage

Before paid requests:

1. Confirm connectivity and transaction support for the approved Matrix database, then verify MongoDB indexes or the reviewed Postgres migration.
2. Request one real magic link to the authorized test account. Verify delivery, the ten-minute expiry behavior, sign-in, sign-out, and session revocation. Check that a session response contains identity/role without a cached credit balance.
3. Confirm an ordinary user cannot access admin routes or another user's generation, project, upload or private media key. Cross-user resources must remain unavailable.
4. Perform an authorized private storage test put/read/delete through the application's selected R2 or Blob path. Confirm media is private and survives a new process/deployment.
5. Replace the explicit draft terms, privacy and acceptable-use pages with owner-approved text before live registration or payments.

Auth.js uses database sessions. Application profiles and balances are stored separately from adapter-owned users and sessions. See [auth and billing](auth-billing.md) and [private storage](storage.md).

## 5. Verify direct uploads and CORS

The live browser sends small metadata requests to `POST /api/uploads/direct`, uploads the bytes to a scoped Higgsfield storage URL, then asks the server to verify and retain them privately. This avoids sending the file body through Vercel's 4.5 MB function request limit. It does not eliminate memory, duration or transfer limits during completion. [Vercel function limits](https://vercel.com/docs/functions/limitations)

1. Using the intended Higgsfield account, obtain a real signed upload instruction through the server.
2. Inspect its upload origin privately. Configure `HF_UPLOAD_ORIGINS` with only the exact verified HTTPS origin(s), without paths, query strings, credentials, IP literals or wildcards. Do not copy illustrative `storage.example.com` or `cdn.example.com` values from documentation.
3. Redeploy after changing the allowlist. `next.config.ts` and the direct-upload handler use the same validated origin parser; the response CSP must include those origins in `connect-src`.
4. Confirm the provider's upload storage permits the studio's origin, PUT method and returned headers in browser CORS. This is the provider's upload target, not the private R2 bucket. Changing R2 CORS does not repair provider CORS.
5. From the deployed browser, complete one small supported upload. The PUT uses exactly the returned headers, `credentials: "omit"`, and rejected redirects. It must not contain studio cookies or Higgsfield API authorization.
6. Confirm completion verifies bytes and persists a ready private object. Test retrying “save” after a completion error and confirm it reuses the upload ID rather than blindly uploading again.
7. Test a representative larger MP4 within the agreed transfer budget and the actual hosting resource limits.

Direct uploads support JPEG/PNG/WebP/GIF up to 20 MiB, MP4 up to 200 MiB, and WAV up to 50 MiB. Pending instructions expire after an hour; the completion route has a five-minute lease and a 300-second execution budget. No real production origin or browser CORS round trip has been established merely by including the documentation example.

Owned IDs are the only accepted media references. New generations upload fresh provider inputs from the verified private copy. See the [full upload and retention contract](storage.md) and [official provider upload documentation](https://docs.higgsfield.ai/docs/concepts/file-uploads.md).

## 6. Run bounded provider acceptance

The catalog has 85 documented endpoints, comprising 18 image and 67 video endpoints. Documentation verification does not prove account access or paid success. Standalone audio REST generation is unavailable; do not invent an audio endpoint.

Agree on a small total USD budget and explicit requests before testing paid generation. The application's default `MAX_GENERATION_USD=5` checks the estimated provider cost of each individual request; it is not a daily or account-wide cap.

1. Obtain an authenticated estimate for one selected raster-image request. Check the shown credits, provider USD amount, markup and current `maxCredits` ceiling.
2. Give the test user only the intended test credits through a documented ledger adjustment.
3. Submit once. Verify that a repeated identical intent uses the same provider idempotency key and does not debit twice.
4. Verify queued/running state, authoritative provider status, private R2 retention, completed state, download and reuse.
5. Repeat for one explicitly budgeted video request and an owned image reference if needed.
6. Exercise failure/refund and cancellation paths with a controlled test strategy. A provider-finished result whose durable copy fails must remain pending retention; it must not be shown as safely stored.
7. Verify the callback URL's HMAC token and server-side status refetch. The app does not trust provider output URLs or status from the callback body itself.

Do not sweep all 85 endpoints as an unbounded paid test. ZIP, JSX, FBX and PLY are retained as validated opaque downloads; actual provider delivery remains unverified. Their local format tests do not establish live delivery. [Provider contract and retry boundaries](provider-contract.md)

## 7. Schedule reconciliation for live mode

The live endpoint is:

```text
GET /api/cron/reconcile
Authorization: Bearer <CRON_SECRET>
```

It checks pending generations, retries queued Stripe events, processes subscription allowance boundaries, and retries credit receipts. Current per-run limits include 8 generation records, 5 Stripe event retries and 5 receipt retries; billing term reconciliation inspects at most 5,000 records. Monitor backlog age as well as HTTP success.

No cron schedule is installed by the read-only showcase setup. For a live production deployment on a plan that supports the frequency, merge this schedule into `vercel.json` and deploy:

```json
{
  "crons": [
    {
      "path": "/api/cron/reconcile",
      "schedule": "* * * * *"
    }
  ]
}
```

Configure `CRON_SECRET` in the deployment environment. Vercel supplies it as the Bearer authorization header. Verify an unauthenticated request is rejected and one scheduled invocation completes with the expected batch result. Check the team's scheduling limits before enabling it; Vercel's Hobby tier does not support minute-level cron. Preview deployments need an explicitly configured external scheduler or an authorized manual call. [Cron authentication, limits and operations](https://vercel.com/docs/cron-jobs/manage-cron-jobs)

The route's execution budget is 60 seconds. Check actual completion latency and queued work; a successful response does not prove the whole backlog is empty. Add pagination or a worker design before account volume exceeds the current scan limits. Browser status polling reads stored state and does not replace reconciliation.

## 8. Configure and verify billing separately

Keep billing disabled until the commercial amounts, allowances and price IDs are approved. The initial plan allowances and top-up sizes in `lib/billing/plans.ts` are configuration defaults, not verified commercial offers; displayed prices remain unset until configured.

Apply the approved allowances and USD display amounts in `lib/billing/plans.ts` as well as the Stripe price IDs. `monthlyUsd` is the monthly charge; `annualUsd` is the full annual charge. Set a paid plan's `configured` flag only after those values match its Stripe prices. Environment price IDs alone do not enable the plan card.

Configure the intended Stripe test account first:

- `STRIPE_SECRET_KEY` and the endpoint-specific `STRIPE_WEBHOOK_SECRET`.
- Monthly/annual price IDs for Starter, Plus and Ultra: `STRIPE_PRICE_STARTER_MONTHLY`, `STRIPE_PRICE_STARTER_ANNUAL`, and corresponding `PLUS`/`ULTRA` names.
- `STRIPE_PRICE_TOPUP_SMALL`, `STRIPE_PRICE_TOPUP_MEDIUM`, `STRIPE_PRICE_TOPUP_LARGE`.
- Customer Portal settings for plan changes, invoices and cancellation.

Register `/api/webhooks/stripe` for checkout completion, asynchronous payment success, paid invoices, subscription update/deletion and charge refunds. A signed event is durably queued before acknowledgement; the handler and reconciler process it idempotently.

Set `BILLING_PRICES_CONFIRMED=true` only when those prices and amounts are configured. Verify a test-mode subscription, top-up, unpaid asynchronous checkout, repeated event, partial refund, and cancellation. Confirm credits and ledger entries against Stripe event/session/invoice IDs. Verify the receipt email separately.

Live-mode Stripe keys additionally require `ENABLE_LIVE_BILLING=true`. Leave it false until test evidence and the intended live pricing are reviewed. Neither this runbook nor a showcase deployment executes a live financial transaction. [Billing implementation details](auth-billing.md)

## 9. Acceptance record and rollback

Record each result for the deployed revision:

| Check | Evidence to retain |
| --- | --- |
| Source and build | Commit, lockfile, Node/pnpm versions, lint/typecheck/test/build/scan results |
| Public interface | READY deployment ID/URL; desktop/mobile browser evidence; accurate mode and unavailable states |
| Identity | Real magic-link delivery, session behavior, role/ownership checks |
| Uploads | Verified production origins, CSP header, browser CORS and ready private object |
| Generation | Approved budget, request IDs, quote/debit, successful retained image/video, retry and failure behavior |
| Storage | Private read/write/delete and restart/deployment persistence |
| Reconciliation | Authenticated scheduled invocation, batch result and oldest pending work |
| Billing | Test-mode events, exactly-once grants/refunds, portal and receipts |
| Legal and operations | Approved public text, support owner and provider account ownership |

At this documentation checkpoint, real standalone provider generation, signed-upload CORS, MongoDB transactions, R2 retention, real email delivery and Stripe checkout remain external acceptance items. The local mocked suite does not certify them.

If a release fails, restore the last inspected showcase deployment or redeploy `APP_MODE=showcase` with billing flags false. Disable the live schedule if its handler cannot operate safely. Preserve database records, private objects, ledger entries and pending request IDs; do not delete state or regenerate idempotency keys to clear an incident.

Existing provider jobs or payments may still need reconciliation after user-facing execution is disabled. Review them through the configured operator workflow before issuing any retry or financial action. Escalate account access, provider CORS, budget, pricing and legal decisions to the Fusion operator with the exact failing boundary and non-secret evidence.
