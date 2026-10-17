# Release verification

Latest checkpoint: 2026-10-17 (UTC). The original full-suite checkpoint below is from 2026-10-15, America/Los_Angeles (PDT).

The release is published as a [read-only showcase](https://fusion-gen-matrix.vercel.app). Interactive preview workflows use labeled sample media on a loopback-only local server.

## 2026-10-17 studio fidelity pass

The cinematic Explore rail, floating image composer, video side panel, mobile shortcuts and original concept artwork were compared against fresh public reference captures. Reference images were not bundled in the application. Before/after captures and deployment details are retained locally in the release evidence.

- Node.js 22: 206 tests passed across nine files; full ESLint, typed catalog drift check, TypeScript/production build and generated-client secret scan passed. The 85-model catalog is generated from the reviewed metadata snapshot.
- Browser preview: a draft survived sign-in and reload; a sample generation completed; a second queued generation was canceled and refunded exactly once. Search, status filtering, list mode, model families, motion-control required references, detail navigation, account links and mobile navigation were exercised. The isolated history contained 504 local fixtures/results, not paid generations.
- Responsive inspection: desktop at 1440px and phone at 390px. The phone page had no horizontal overflow and the primary action stayed visible. Original images loaded. Settings wrap instead of overlapping. A fresh-visitor screenshot exposed a cookie notice overlap; its offset now follows the measured composer height, including reference controls. The gallery preserves the previous focus/geometry behavior.
- Upload API: the original 1536×1024 PNG was accepted with dimensions measured from its bytes; retained bytes matched; anonymous access returned 404; a corrupt PNG returned 415. The Chrome upload automation helper could not select files without an extension permission change, so this upload check used the local HTTP API. No browser permissions were changed.
- Storage regressions cover actual PNG/MP4 metadata, corrupt tracks, measured metadata propagation, supported opaque artifact headers and attachment delivery. Provider requests remain mocked.
- Review fixes prevent a stale tab from overwriting a newer saved draft and reset generation-detail project state when navigating. A focused rereview found no remaining concrete issue in those changes.

These checks do not establish paid provider, production database/storage/email/billing acceptance, Lighthouse scores, complete screen-reader acceptance or pixel-identical source-site parity.

## 2026-10-17 follow-up

- Public baseline `a65d233cae8be632712f3a992346067b8369932f` matched GitHub and Vercel production. Fifteen public routes returned 200; private APIs returned 401; four attempted mutations returned 503 / `SHOWCASE_READ_ONLY`. The catalog exposed 85 models with generation, authentication, uploads and billing disabled. Desktop/mobile navigation, model search and settings were checked with no browser errors or horizontal overflow.
- Added justified row packing and direct queued cancellation. Six geometry regressions passed over 500 mixed-ratio inputs at seven widths in both density modes. Targeted ESLint, the Node.js 22 production build (including TypeScript), and the 72-file client secret scan passed. The older full suite was not rerun for this UI-only follow-up.
- A separate production-build loopback preview used 500 labeled original SVG fixtures and isolated file storage. Portrait, square and landscape ratios were preserved at 1440px and 390px. Keyboard End reached fixture 500; earlier images remained mounted; no image failures were observed. Filtering down to one asset and selecting it worked without overflow.
- Keyboard focus survived viewport regrouping and a queued-to-completed update that changed the output dimensions. Enter opened details and Escape returned focus. Density toggling also passed. A review found and fixed row-level remounting and cancel/Generate button reuse during polling; the focused rereview found no remaining actionable issue.
- Submitting and immediately canceling a local preview showed CANCELED, restored the balance from a 4-credit debit to 200, and restored the Generate control. A separate completed preview left 196 credits. These are local ledger checks, not paid provider or payment acceptance.
- Browser warning/error capture was empty. These checks do not establish Lighthouse scores, a timed load benchmark, full screen-reader acceptance, or every provider's live behavior.

## Original full-suite checks

| Check | Result and environment |
| --- | --- |
| Automated suite | 185 tests passed across five test files, including seven provider callback regressions. External services were mocked. |
| Static checks | TypeScript and full ESLint passed. |
| Production build | Next.js production build passed after the final callback change; generated client secret scan passed across 72 files. |
| Local runtime | Node.js 25.8.2. Package and deployment target specify Node.js 22.x; pnpm 10.34.7 is pinned with its lockfile. |
| Demo browser workflow | 14 checks passed against the production build: local sign-in, persisted image/video fixtures, retained media, projects, ownership denial, same-origin enforcement, publication/revocation, uploads, refund/cancel idempotency, admin access, mobile layout and no JavaScript exceptions. |
| Demo edge cases | Four checks passed: response loss retries the same intent with one debit; normal UI polling shows completion; a 500-item fixture gallery reaches the final row and returns; no JavaScript exceptions. The large gallery is a browser fixture, not 500 paid generations or a database load test. |
| Local showcase | Six checks passed: signed-out API with 85 catalog contracts and no live capabilities; 15 routes; model/settings dialogs; mutation rejection; 390px mobile layout/navigation; no JavaScript exceptions. |
| Visual inspection | Desktop/mobile showcase and fixture-generation views inspected. Raw screenshots and reports are retained locally, outside the public repository. |

## Reproduce

Run the commands in the [launch runbook](launch-runbook.md). Browser runners require Google Chrome and an already running server. Use a fresh disposable data directory for local demo checks.

- Demo only: `pnpm test:e2e` and `node scripts/browser-edge-cases.mjs`.
- Showcase only: `BASE_URL=<showcase URL> node scripts/browser-showcase.mjs`.
- The showcase runner verifies rejected mutation attempts; it never requests a paid generation or payment.
- Browser reports and screenshots are written to ignored `docs/evidence/`.

## Remaining acceptance

The public showcase has been verified. Release-specific deployment IDs, commit SHAs and inspection details are retained in ignored `docs/evidence/`; a READY deployment alone does not certify live services.

No real Higgsfield generation, MongoDB transaction, magic-link email, private R2 round trip, provider upload CORS, Stripe checkout or receipt delivery was verified. Live configuration and bounded acceptance remain required. No paid generation or payment was performed.

Standalone audio REST, full source-site visual parity, Lighthouse scores and comprehensive assistive-technology acceptance remain gaps. Supported non-media artifacts are now retained as bounded opaque downloads; actual provider delivery still requires live acceptance. See the [completion checklist](completion-checklist.md) and [source provenance](source-provenance.md).
