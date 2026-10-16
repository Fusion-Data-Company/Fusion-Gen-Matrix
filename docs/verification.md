# Release verification

Checkpoint: 2026-10-15, America/Los_Angeles (PDT).

This record describes the reviewed source before public deployment. The release is a read-only showcase. Interactive preview workflows use labeled sample media on a loopback-only local server.

## Completed checks

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

Public deployment verification must be recorded after the returned deployment becomes ready. A ready deployment alone does not certify the browser experience.

No real Higgsfield generation, MongoDB transaction, magic-link email, private R2 round trip, provider upload CORS, Stripe checkout or receipt delivery was verified. Live configuration and bounded acceptance remain required. No paid generation or payment was performed.

Standalone audio REST, non-media artifact retention, full source-site visual parity, Lighthouse scores and comprehensive assistive-technology acceptance remain gaps. See the [completion checklist](completion-checklist.md) and [source provenance](source-provenance.md).
