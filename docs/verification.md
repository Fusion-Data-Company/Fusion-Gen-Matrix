# Release verification

Latest checkpoint: 2026-10-17 (UTC). The original full-suite checkpoint below is from 2026-10-15, America/Los_Angeles (PDT).

The release is published as a [read-only showcase](https://fusion-gen-matrix.vercel.app). Interactive preview workflows use labeled sample media on a loopback-only local server.

## 2026-10-18 live quote compatibility

The earlier authenticated Seedance estimate returned a pricing description rather than numeric USD/provider credits. The standalone example accepted that verified tariff, but the web client's quote parser still rejected it. A mocked regression reproduced this failure before the fix. The app and example now share the strict parser for the verified Seedance 2.5 text-to-video request: five seconds, 720p, 16:9, high bitrate, MP4 and native audio (explicit defaults or provider defaults). Each quote computes the conservative amount from the newly returned full formula; rates are not hard-coded. Unsupported settings, different formulas, extra fees and contradictory numeric fields still fail closed. Provider credits are omitted when the response supplies none; no conversion is invented.

- 150 focused catalog/provider, generation-lifecycle and SDK tests passed. Coverage includes changed settings/formulas, increased rates, rejection above the operator's USD limit before debit/submission, and preservation of the SDK's one-attempt guard.
- Targeted ESLint, Node.js 22 production build/TypeScript and the generated-client secret scan (72 files) passed. No credential values were read or printed, and no provider estimate, generation or retry was requested during this fix.
- The existing SDK receipt remains `submission_attempted`, without an accepted request ID or video URL. The public app stays in showcase mode pending live service configuration; this change establishes quote-parser compatibility, not completed provider execution.

## 2026-10-17 creation and result-management batch

Four reproduced workflow defects are fixed together: reused optional references now remain visible in the composer; library search clears hidden selections and bulk actions target only visible selected records; reopening a canceled project move restores the saved destination; and every retained output can be previewed and selected for a subsequent generation. Animate uses the chosen image, and reference drafts retain an explicit output index across reload. The server resolves that index against the owner's completed result and rejects missing, incompatible or foreign outputs before quoting or debiting. Legacy references without an index remain compatible.

- Thirty-four focused tests passed across generation lifecycle, client state and draft persistence. Targeted ESLint, Node.js 22 production build/TypeScript and the generated-client secret scan (72 files) passed. The earlier comprehensive suite was not repeated for this batch.
- In an isolated loopback production-build preview, selecting an asset and then searching it out of view removed the selection toolbar and visible checked state. Moving an asset out of a project, renaming that project and moving the asset back with bulk controls all succeeded. Canceling a destination change and reopening showed the actual saved destination.
- A clearly labeled two-output fixture used original project artwork. Output 2 displayed the architectural study, and its downloaded SVG matched the original file byte for byte. At 390×844, the output detail had no internal horizontal overflow (356px client and scroll widths), and the library document width matched the 390px viewport.
- Selecting Output 2 in the reference library preserved its exact private media URL and index through reload. One local image sample completed from that reference. Animate handed the same Output 2 into a video start reference, and one local video sample completed. The stored records both retained output index 1 and the second SVG URL. The video player loaded the fixed four-second preview MP4; this is not evidence of a provider-rendered clip or requested-duration compliance.
- Reuse restored optional reference controls immediately. Local publication made the labeled fixture appear in Community; unpublishing removed it and returned 404 for both the anonymous record and media requests. The Product light effect expanded the entered subject into its recipe and selected Qwen Image 3. No browser errors or warnings were captured during these checks.
- The verification data and media stayed in a disposable local preview directory. No paid provider request, live email, storage provisioning or payment was performed. Public hosting remains a read-only showcase; the external-service acceptance stops below are unchanged.

## 2026-10-17 deleted-project recovery

A saved draft pointing at a deleted project could no longer generate: when the last project was deleted, the destination selector disappeared, but the stale project ID stayed in the request and produced “This item is unavailable.” The composer now removes that association only after a successful owned-project list confirms it is missing, then tells the user that the draft will save to the main library. Prompt, model, settings and references are not reset. Abandoned requests and responses for a different draft owner are ignored. No visual styles or provider/billing code changed.

- Reproduced the failure in a separate loopback production-build preview using a disposable project. The rejected attempt left the preview balance at 200 and created no result.
- After the fix, the same persisted draft showed the recovery notice and retained its prompt/model. One local sample queued, completed and appeared in the main library with no project association, one output and one four-credit preview debit (balance 196). No paid provider call was made.
- Creating and selecting a valid destination, then reloading, retained that project and the original prompt. The existing completed sample remained visible.
- Eight focused state/persistence tests, targeted generator ESLint, Node.js 22 production build/TypeScript and the generated-client secret scan (72 files) passed. The older comprehensive suite was not rerun for this scoped change.
- These checks establish local preview recovery, not real provider, database, email, storage or billing acceptance. The published app remains a read-only showcase.

## 2026-10-17 draft entry-link follow-up

A model-link entry left its model parameter in the URL. Changing from Soul 2 to Recraft V4.1, selecting 16:9/PNG, then reloading restored Soul 2 and its defaults. Model, preset and prompt parameters are now consumed after one valid prefill, so subsequent reload/sign-in/navigation restores the edited draft. Unrelated query parameters and the hash remain intact. Invalid model or wrong-surface effect links preserve the current valid draft. The interface styling is unchanged.

- Eight focused state/persistence tests passed across `tests/client-state.test.ts` and `tests/dock-persistence.test.ts`; targeted generator ESLint passed. The Node.js 22 production build, TypeScript and generated-client secret scan (72 files) passed. The older comprehensive suite was not rerun for this scoped change.
- An isolated production-build local preview confirmed the Recraft model, edited prompt, 16:9 aspect ratio and PNG format survived reload and local preview sign-in. Video-to-image return navigation retained the draft.
- An unavailable model plus a video preset on the image surface preserved the current draft and removed only the entry fields. The valid Product Light effect selected Qwen Image 3; editing its recipe and reloading preserved the edit. A separate campaign parameter and `#main` hash survived both entry flows.
- At 390×844, the document width remained 390px and the primary action's bottom edge remained inside the viewport. The rendered phone view retained the prompt/model controls and original styling. Browser error/warning capture was empty.
- No generation, provider submission, email delivery or payment was requested in this check. Local preview authentication does not establish real magic-link delivery. Deployment evidence for this follow-up is recorded separately after publication.

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
