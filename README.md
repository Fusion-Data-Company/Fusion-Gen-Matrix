# Fusion Gen Matrix

Fusion Gen Matrix is an original Fusion-branded image and video studio with model-driven controls, owned media references, projects, an asset library, community publishing, a credit ledger, and server integrations for Higgsfield, Auth.js/Resend, Neon PostgreSQL, private Vercel Blob storage, and Stripe. GitHub and Vercel provide source publication and hosting.

[Public showcase](https://fusion-gen-matrix.vercel.app) · [Source repository](https://github.com/Fusion-Data-Company/Fusion-Gen-Matrix) · [Launch runbook](docs/launch-runbook.md) · [Model catalog](docs/model-catalog.md)

The published app is a **read-only public showcase**. Local demo workflows are interactive and use labeled sample media. Paid generation, real email sign-in, private cloud storage, and Stripe checkout require live configuration and their own acceptance checks.

## Choose the right mode

| `APP_MODE` | Intended use | Identity and data | Generation and billing |
| --- | --- | --- | --- |
| `demo` | Development on this computer | Loopback-only preview sessions; durable files under `DATA_DIR` | Labeled sample outputs and local credits; no paid provider call or payment |
| `showcase` | Public interface review | Signed out; no private database or storage access | Read-only. Sign-in, upload, generation, admin mutations and billing are unavailable |
| `live` | A configured operating studio | Auth.js database sessions, Neon PostgreSQL and private Vercel Blob objects | Authenticated provider estimates, credit-metered requests and explicitly configured billing |

Without an explicit setting, Vercel defaults to showcase and local development defaults to demo. Set the mode explicitly for deployments. A public deployment must never use demo mode.

## Run locally

Use **Node.js 22.x** and **pnpm 10.34.7**, matching `engines` and `packageManager` in [package.json](package.json). Keep [pnpm-lock.yaml](pnpm-lock.yaml).

```sh
node --version
pnpm --version
pnpm install --frozen-lockfile
APP_MODE=demo APP_URL=http://127.0.0.1:3210 pnpm dev
```

Open [http://127.0.0.1:3210](http://127.0.0.1:3210). If pnpm is managed through Corepack, the equivalent commands are `corepack pnpm ...`; the package-manager field selects version 10.34.7.

1. Use local preview sign-in. It sends no email. `operator@preview.local` is the local administrator; other valid addresses create ordinary preview accounts.
2. A new preview account receives 200 local credits once. Image samples cost 4 credits and video samples cost 60. The account page can add 100 local credits without payment.
3. Choose a model, enter a prompt and create a sample. The preview worker advances persisted jobs while the server runs. Results are visibly labeled fixtures, not AI-generated work.
4. Try project assignment, owned reference upload, asset actions, publishing, and the admin controls. Restart the server to check persistence.

The default data directory is `.data`; set `DATA_DIR` to another writable directory if desired. It contains private local records and media and is excluded from source publication.

To exercise the production build on loopback:

```sh
APP_MODE=demo ALLOW_LOCAL_PREVIEW=true pnpm build
APP_MODE=demo ALLOW_LOCAL_PREVIEW=true pnpm start
```

`ALLOW_LOCAL_PREVIEW=true` permits a local production-mode process; it does not remove loopback restrictions.

To review the same read-only behavior intended for a public deployment:

```sh
APP_MODE=showcase pnpm build
APP_MODE=showcase pnpm start
```

## What is included

- Explore, image/video generators, effects, community, asset detail, assets, projects, pricing, account/billing, login, admin, and explicit draft legal pages.
- Catalog-driven settings and media roles, server validation, owned-reference checks, visible quotes, and an idempotent submission intent.
- Separate subscription and top-up credit buckets, atomic debits, terminal failure refunds, subscription renewal handling, and signed Stripe event processing.
- Durable media retention before a provider result is marked complete, private media access, and a browser direct-upload protocol for live hosting.
- Responsive interface, accessible dialogs, keyboard focus states, and an aspect-ratio-aware justified gallery. Large feeds retain visited cards across scrolling and layout changes.
- The primary Generate control becomes Cancel queued generation while owned work is queued; credit return is shown only after confirmed cancellation.

The source snapshot verified on **2026-10-15 contains 85 generation endpoints: 18 image and 67 video**. This means their public request contracts were verified, not that all endpoints were successfully used with this account. No standalone audio-generation REST endpoint was verified. The audio page explains that limit; documented video audio settings and audio reference inputs remain available where a model supports them. See [coverage, exclusions and sources](docs/model-catalog.md).

ZIP, JSX, FBX and PLY results are retained as validated, opaque attachment downloads (50 MiB maximum). They are never executed, unpacked or presented as playable media. Uploaded media dimensions and duration are measured server-side before use. The catalog is not a promise that every possible output format has completed an end-to-end live test.

## Live configuration

Start with the variable names in [.env.example](.env.example), and use the [launch runbook](docs/launch-runbook.md) for the full sequence. Store populated values in the deployment environment or an ignored local configuration file.

Live startup requires:

- Neon PostgreSQL: `DATABASE_PROVIDER=postgres` and a production-only pooled `DATABASE_URL`. Apply the reviewed [PostgreSQL migration](docs/postgres.md) to the dedicated database before enabling live mode.
- Auth.js and Resend: `AUTH_SECRET`, `AUTH_RESEND_KEY`, `EMAIL_FROM`, and the correct public `APP_URL`/`AUTH_URL`.
- Higgsfield REST credentials: `HF_CREDENTIALS` in `key_id:key_secret` format, plus `HF_WEBHOOK_SECRET`. An authenticated connector does not provide these values to the standalone app.
- Private Vercel Blob: `MEDIA_STORAGE_PROVIDER=vercel-blob` and an app-scoped private store with Vercel OIDC access or a server-only `BLOB_READ_WRITE_TOKEN`. See the [storage contract](docs/storage.md).
- Reconciliation: `CRON_SECRET` and a scheduler that calls the protected route.
- Direct browser uploads: `HF_UPLOAD_ORIGINS` containing exact verified provider storage origins, plus working provider CORS.

`AUTH_SECRET`, `HF_WEBHOOK_SECRET`, and `CRON_SECRET` must each contain at least 32 characters. `APP_URL` must use HTTPS in live mode. Missing required live configuration causes an error rather than falling back to preview access.

Stripe is a separate activation step. Keep `BILLING_PRICES_CONFIRMED=false` and `ENABLE_LIVE_BILLING=false` until pricing and the intended Stripe account are configured. Commercial prices remain unset in the source; approved display amounts and plan configuration must be updated alongside Stripe price IDs. See [identity and billing details](docs/auth-billing.md).

## Cost controls

Live generation uses the authenticated Higgsfield estimate for the validated request. Defaults are `MAX_GENERATION_USD=5`, `CREDIT_MARKUP=2`, and `CREDIT_USD_VALUE=0.01`. The server enforces a per-request provider estimate ceiling and compares the new credit cost with the quote the user accepted. Credits are debited transactionally before submission, and retries reuse the persisted intent.

The USD limit is **per request**, not an account-wide or daily spending budget. Concurrent requests, provider funding, hosting, storage and transfer costs are separate. Start any live acceptance run with an agreed total budget and a small explicit set of requests. The default live signup bonus is zero.

## Verify changes

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm test:postgres
APP_MODE=showcase pnpm build
```

The build includes the generated-browser-bundle secret scan and fails if it detects a match. `pnpm security:scan` can also inspect an existing build separately. The 2026-10-18 PostgreSQL/Blob checkpoint passed **280 standard tests and 27 real PostgreSQL integration tests**, TypeScript, scoped ESLint, and a Node.js 22 production build. After making PostgreSQL and Blob the defaults, all **100 targeted tests** and TypeScript passed again. See [verification and limits](docs/verification.md).

The standard tests cover catalog mapping, generation accounting/lifecycle, authentication, billing and storage boundaries with local data and mocked provider calls. `test:postgres` creates and removes a disposable local PostgreSQL 18 cluster; it verifies concurrent credits, retries, authorization, sessions, retention and cleanup against the real database engine. Its binary-location override is documented in [PostgreSQL setup](docs/postgres.md).

Two standalone Playwright-based runners use an already running server and a locally installed Google Chrome browser:

```sh
BASE_URL=http://127.0.0.1:3210 pnpm test:e2e
BASE_URL=http://127.0.0.1:3210 pnpm test:smoke
```

`test:e2e` requires **local demo mode** and creates preview accounts, media, projects and ledger entries. Use a fresh writable `DATA_DIR` for its server. It exercises sign-in, image/video completion, private access, projects, publication, upload, refunds, cancellation, admin access and the mobile layout. It writes screenshots and `docs/evidence/browser-workflow.json`; a complete pass requires `status: "passed"`, not just some successful checks.

`test:smoke` is read-only and can target an actual public showcase by setting `BASE_URL` to its returned URL. It captures desktop/mobile views and prints page errors and overflow measurements. Review those diagnostics and screenshots; a zero exit code alone does not certify visual quality. The production-build local demo passed 14 workflow checks and four edge-case checks; local showcase passed six checks. See [verification and limits](docs/verification.md). Raw browser evidence is retained locally and excluded from the public repository.

A passing build or test suite does not establish live email delivery, funded generation, real upload CORS, private Blob retention, Stripe checkout, or a Lighthouse score.

## Architecture and maintenance

| Location | Purpose |
| --- | --- |
| `app/`, `components/`, `lib/client/` | Next.js routes, UI and client state |
| `lib/catalog/` | Source snapshot, metadata, schemas and media mappings |
| `lib/higgsfield/` | Server REST client, retry behavior and webhook token helpers |
| `lib/generations/` | Quote, debit, submit, reconcile, cancel and retention state |
| `lib/db/`, `lib/billing/` | Durable repositories, credit ledger and billing |
| `lib/auth/`, `auth.ts` | Identity, session and authorization boundaries |
| `lib/storage/`, `lib/upload-origins.ts` | Private retention, bounded transfers and direct-upload origin policy |

Run `pnpm models` to regenerate the typed catalog and `pnpm models:check` to verify it is current. When adding a model, review official documentation and update the metadata, schema, media mapping and documented examples together. Preserve the exact official source link, add meaningful validation/mapping tests, and verify live access separately. Never treat a connector job-set name or a promotional price as a verified REST contract.

Useful references: [provider contract](docs/provider-contract.md), [storage contract](docs/storage.md), [frontend API contract](docs/frontend-contract.md), [interface inventory](docs/ui-inventory.md), and [launch runbook](docs/launch-runbook.md).

## Provenance

This is original application code built from the requested workflow and [Albert Olgaard's linked creator specification](https://docs.google.com/document/d/1EHo5qNubl2eso078n1XwmvPHNETfsc84HMN9j9sw7Sg/edit?usp=sharing), referenced in [“Dear Higgsfield, I cloned you in 1 hour”](https://www.youtube.com/watch?v=hRr-yUSM0_A). No unlicensed Higgsfield app-template code, gated creator repository, proprietary branding or marketing assets were copied. Illustrations and preview fixtures are explicitly labeled. Third-party dependencies retain their own licenses.

## October 17 fidelity pass

The interface now includes a cinematic Explore rail, floating image composer, compact video panel, responsive navigation, searchable status-filtered history, grid/list views, draft recovery and cross-tab synchronization. See [design decisions](docs/decisions.md), [asset provenance](docs/asset-provenance.md) and [verification](docs/verification.md).
