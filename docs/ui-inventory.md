# Fusion Gen Matrix interface inventory

## Scope and evidence
Implemented from the complete creator specification, shared API contracts, the Fusion OS design contract, and Rob Design Director. The project uses original interface code and three original SVG studies. No proprietary Higgsfield UI source, branding, marketing assets or gated creator repository was copied.

Public source inspection on 2026-10-15:
- https://higgsfield.ai/ — visible navigation, Explore, model features, effects and community sections.
- https://higgsfield.ai/ai/video — public navigation was returned; generator internals are client-rendered.
- https://higgsfield.ai/pricing — public navigation was returned; interactive pricing contents were not available through the public text fetch.

A fresh October 17 rendered inspection obtained public Explore, image and video layouts. The second pass adopts their media-led hierarchy, floating image composer and compact video panel in an original Fusion implementation. Before/after evidence is retained with the task. See decisions.md for exact references and intentional differences. No pixel-perfect parity or Lighthouse score is asserted.

## Shared interface
- One shell: Fusion Gen Matrix monogram/wordmark, seven navigation destinations, balance, account menu, mobile navigation dialog, footer.
- Three modes: local preview (labeled fixture outputs/test credits), live (capability-gated), public showcase (read-only, no account or generation execution).
- Cookie choice records essential/all preference locally; optional analytics and advertising scripts are not installed.
- Base UI dialogs: focus trapping, Escape, accessible title and close control. Mobile sheet uses the same primitive.
- Consistent loading, error/retry, empty, access-denied and unavailable states. Notifications use a polite live region.
- Dark-only project contract, lime primary generation action, neutral secondary actions, visible focus rings and reduced-motion handling.

## Route and interaction coverage
| Route | Implemented behavior |
| --- | --- |
| / | Explore hero and verified-model cards; original illustrative covers; effect links; actual published-community teaser |
| /image, /video | Model search and family ordering; create/edit/motion filters; catalog-driven input modes/roles; owned reference selection; upload; prompt and character cap; settings; project destination; server quote; idempotent submit; history; how-it-works view; density toggle |
| /audio | Truthful unavailable state because no standalone audio REST model was verified; shared player supports audio artifacts |
| /effects | Category and text filters; original prompt recipes |
| /effects/[slug] | Brief input substitutes the recipe subject; preloads the matching model, prompt and settings |
| /community | Published-only feed, media filters, prompt search and public detail |
| /g/[id] | Public/owned detail; minimal public record; public prompt/settings; recreate and report |
| /assets | Generation/media tabs, text search, uploads, selection, download/publish/delete/move actions, project sidebar |
| /projects/[id] | Filtered project view, rename and delete with confirmation; project deletion preserves generations |
| /pricing | Monthly/annual selection, real plan configuration, explicit unconfigured prices, comparison, top-up entry points and FAQs; no made-up discounts |
| /account, /account/billing | Profile, plan, subscription/top-up buckets, ledger, configured portal link; local-only test credit grant |
| /login, /login/check-email, /login/error | Local preview sign-in explicitly sends no email; live Auth.js magic link; unavailable showcase sign-in; error recovery |
| /admin | Server-authorized users/credit adjustment, generation status/model filters, model toggles/prices, effects CRUD, moderation reports |
| /legal/terms, /legal/privacy, /legal/acceptable-use | Explicit draft placeholders requiring owner/legal review before live registration/payments |

## Generator and media states
- Input controls are derived from verified model definitions; client submits model ID, scalar settings and owned media IDs only.
- Optional advanced structured settings accept JSON text and are validated on the server.
- Quotes run only for signed-in interactive sessions. A new input payload invalidates the old displayed quote. Live submits include maxCredits from the displayed quote.
- Generate creates a UUID per submission intent, retaining the key and exact request across ambiguous network/5xx retries. A confirmed response or changed request ends that intent. Inputs persist on the same device for 24 hours across navigation, reload and sign-in; sign-out/account changes clear private drafts. Cross-tab updates synchronize.
- Queued/running, completed, failed, content-filtered and canceled records stay visible.
- Status polling uses the database-only status endpoint every 3.5 seconds while visible, batches 50 active IDs, avoids overlapping calls and ignores stale/regressive updates. Refresh is an explicit action.
- Complete detail provides download(s), prompt copy, reuse, image-to-video reference, publish/unpublish, move and delete where permitted.
- Content-filter and failure messages come from the server; the UI does not invent refund success.
- Public records omit costs and private reference inputs. Cost is shown only when the server provides it.
- Admin views of other users’ unpublished media show an explicit private-output tile without bypassing ownership.

## Uploads
- Demo uses the local multipart route.
- Live uses prepare → direct PUT to returned signed URL → complete. PUT sends exactly returned headers with credentials omitted and redirects rejected.
- No signed URLs are logged or rendered.
- Completion failure retains the upload ID in component memory and exposes Retry saving, without uploading bytes again.
- Client mirrors file-type/size limits for early feedback; server validation remains authoritative.
- Upload/CORS failures are shown plainly. Real provider CORS and credentials remain a live verification dependency.

## Gallery and responsive behavior
- Responsive media grid uses fixed aspect ratios and lazy image loading.
- More than 60 items use TanStack Virtual, retaining visited rows so loaded media is not torn down during fast scrolling. This component opts out of React Compiler memoization because the library uses imperative measurement.
- Desktop: approximately 355–380px creation panel and wide media canvas.
- Mobile <=760px: controls stack above history, navigation becomes a dialog, generation action remains fixed to the viewport bottom, and the page reserves footer space.
- Inputs, long settings, account identities and table overflow have explicit responsive handling.

## Asset provenance
- public/art/still-life.svg — original geometric product study.
- public/art/motion-study.svg — original intersecting-ring motion study.
- public/art/architecture.svg — original architectural arch study.
- All are labeled illustrations, not provider-generated results.
- Provider-rendered preview fixtures are separately labeled PREVIEW FIXTURE.
- Icons: lucide-react. No third-party brand icons or proprietary imagery were copied.

## Verification completed by UI implementation
- Full TypeScript check passed after integration.
- UI/page/client ESLint completed with zero errors and zero warnings.
- API contract review covered project name max80, adjustment bounds/note length, constrained preset covers, quote ceilings, public generation views and direct-upload stages.
- Live browser verification and final production build are performed by the root verifier. The implementation agent does not self-certify visual parity or live provider success.

## Remaining live dependencies
Authentication email delivery, funded provider output, Mongo/R2 retention, signed upload CORS, finalized prices, Stripe checkout/portal/receipts, and approved legal text require configured services and action-time live verification. The public showcase and local preview make those limits explicit.

## October 17 delivered controls

History has prompt/model search, status filtering, list/grid/density views and previous/next details. Failed bulk operations remain selected for retry. Image prompt starters and video help cards act on the real composer. Original concept artwork and self-hosted OFL fonts are documented in asset-provenance.md.
