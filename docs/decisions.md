# Fusion studio fidelity decisions — 2026-10-17

This pass compares the creator's retained tutorial transcript and exact public prompt with fresh public Higgsfield screens. It implements the v1 image/video studio in Fusion branding. It does not claim an identical product or authenticated access to every Higgsfield workflow.

## References inspected

- [Creator tutorial](https://www.youtube.com/watch?v=hRr-yUSM0_A): retained transcript covers the video composer, motion/edit modes, model/settings selection, paid generation, history, community, pricing, account and admin views. The tutorial itself requires service credentials and account funding for its real renders.
- [Exact creator prompt](https://docs.google.com/document/d/1EHo5qNubl2eso078n1XwmvPHNETfsc84HMN9j9sw7Sg/edit): local source snapshot reviewed in full. Generation, ownership, retention, billing and failure states remain functional requirements.
- [Public Explore](https://higgsfield.ai/), [image studio](https://higgsfield.ai/ai/image?model=gpt_image_2), and [video studio](https://higgsfield.ai/ai/video): captured October 17, 2026. Unlike the earlier text-only inspection, this pass obtained the rendered public composer layouts.
- [Higgsfield app templates](https://github.com/higgsfield-ai/app-templates): repository metadata did not establish a reusable license. No template code or media was copied. API documentation informs the independent provider adapter.

## Implemented visual structure

Explore now opens on a horizontal cinematic card rail, followed by a featured workspace and six real navigation destinations, effects and the actual published community feed. The compact header uses lime accents and neutral dark surfaces. Image creation uses a floating composer with prompt, model, settings, references and its primary action. Video uses a compact side panel with input roles and a separate history/help canvas. Mobile has a collapsible navigation dialog, accessible shortcuts, stacked video controls and a reachable composer.

The empty image canvas uses original concept artwork and prompt starters. The video help cards focus the prompt or open the actual model/settings controls. All artwork is labeled as concept material, separately from local preview fixtures and real generation history.

History includes search, status filters, grid/list/density controls, elapsed active states, previous/next detail navigation, download and reuse. Drafts survive navigation, reload and sign-in for 24 hours on the same device; ownership changes and sign-out clear private drafts. Cross-tab changes synchronize. No automatic paid request is created by restoring a draft.

## Provider and storage behavior

The catalog contains 85 reviewed endpoints: 18 image and 67 video. `pnpm models` produces a typed module from the reviewed metadata snapshot; `pnpm models:check` rejects drift. This command does not invent models or claim account-specific availability.

Uploaded and retained media now get dimensions/duration from their actual bytes. Sharp reads image geometry; Mediabunny reads video/audio containers without browser codecs. Provider-supplied dimensions do not override measured values. Source metadata reaches the existing model-specific duration and geometry checks. Existing legacy records without metadata need re-upload before relying on those constraints.

Documented ZIP, JSX, FBX and PLY results are retained as opaque files, limited to 50 MiB, checked for expected format and delivered as attachments with sandbox/nosniff headers. They are never executed, unpacked, or presented as playable media. This supports returned files without adding a 3D editor or script runner.

Status polling is scoped to the active account/query, aborts on changes, avoids overlapping requests, batches active IDs, and preserves terminal/newer results against stale responses. Partial bulk failures remain selected for retry. Existing server debit/refund, idempotency, ownership, private storage, webhook and same-origin controls remain authoritative.

## Original and licensed assets

`public/art/fusion-concepts-v2.png` is original generated concept artwork made for Fusion using the built-in image-generation tool, not a paid result from any app model. The contact sheet contains a warm portrait, a traveler in a volcanic valley, a lime product bottle and a rain-lit silver coupe. No Higgsfield photographs, trademarks or logos were used.

DM Sans and Barlow Condensed are self-hosted under the SIL Open Font License; the license texts ship beside the fonts. Lucide remains the icon source. Sharp is Apache-2.0; Mediabunny is MPL-2.0 and is used unmodified. See [asset provenance](asset-provenance.md).

## Live acceptance boundary

The published app remains a read-only showcase until MongoDB, Auth.js/Resend, Higgsfield, private R2 and reconciliation configuration are authorized. Direct-upload origins/CORS and representative live image/video generation must then be verified. Billing requires approved Stripe products/prices and webhook/portal checks. Legal copy and support ownership require operator approval. No standalone audio REST generation endpoint was verified; audio inputs, returned audio and native video audio remain distinct supported capabilities.

Supercomputer agents, Canvas, multi-shot editing timelines, training, teams, Academy, contests and customer APIs are outside the creator prompt's v1 scope. Original typography, icons and a limited original effects library remain intentional differences. Before/after screenshots show the delivered change; no pixel-perfect or Lighthouse-score claim is made.
