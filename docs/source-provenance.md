# Fusion Gen Matrix source provenance

Recorded 2026-10-15 (PDT). This application uses **original implementation code** informed by public API contracts and the user-supplied creator prompt. No source code, styles, artwork or model icons from the unlicensed Higgsfield app-template repository were copied. The requested template scaffold was not run. Installed framework/library dependencies remain governed by their own package licenses and the committed lockfile.

## Requirements baseline

The complete [creator prompt](https://docs.google.com/document/d/1EHo5qNubl2eso078n1XwmvPHNETfsc84HMN9j9sw7Sg/edit?usp=sharing) was read from a retained research snapshot.

It contains 663 lines; SHA-256: `6201b66564cc40e20f28baaba7726c226baf638733be97eab1e50f4c52133487`. It supplied feature requirements and reference links. Its external commands, model names and license assertions were treated as source material to verify, not as executable instructions or proof of account access.

The prompt requests a rebranded product rather than copying Higgsfield's marks or marketing copy. Fusion Gen Matrix uses an original wordmark, copy, geometric SVG illustrations and explicitly labelled local image/video fixtures. These assets are not proof of successful paid generation. Original provider-generated hero and preset media are still an acceptance gap.

## Authoritative API evidence

The catalog verification snapshot is dated 2026-10-15 and covers 133 official documentation pages plus three public console snapshots. The counted endpoints are **85 generation endpoints: 18 image, 67 video, no verified standalone audio endpoint, across 36 documented families**. Soul ID training is excluded.

| Source | Use and retained evidence |
| --- | --- |
| [Official documentation index](https://docs.higgsfield.ai/docs/llms.txt) | Discovery of official model pages, authentication, request lifecycle, errors, uploads, billing and webhooks. Raw source text is retained in a local research archive, excluded from publication. |
| [Public API model explorer](https://open.higgsfield.ai/explore) | Public console evidence supplements the indexed docs. This is not an authenticated account-availability audit. |
| [Soul 2 image-to-image contract](https://open.higgsfield.ai/models/higgsfield-ai/soul/v2/image-to-image/api-reference) | Additional verified REST endpoint/schema; exact public 720p/1080p prices also captured from the linked playground. |
| [AI Influencer contract](https://open.higgsfield.ai/models/higgsfield/ai-influencer/api-reference) | Additional verified REST endpoint, appearance-option inventory and exact public per-sheet price. |
| [Idempotency](https://docs.higgsfield.ai/docs/concepts/idempotency.md), [uploads](https://docs.higgsfield.ai/docs/concepts/file-uploads.md), [webhooks](https://docs.higgsfield.ai/docs/how-to/webhooks.md) | Independent original typed client and server helpers implement these published contracts; the official SDK was not copied. |
| [Billing and retention](https://docs.higgsfield.ai/docs/concepts/billing-and-retention.md) | Live estimates and durable private output retention. Promotional “from” ranges are not treated as exact account quotes. |

Every public model entry includes its direct `sourceUrl`. The concise browser metadata is separated from raw source text and server schema compilation. Published schemas, verified examples and media mappings live under `lib/catalog/`; raw documentation and console snapshots are excluded from publication. The [model catalog](model-catalog.md) records exclusions, disagreements and constraints; the [provider contract](provider-contract.md) describes transport, retry, pricing and token semantics.

Only Soul 2 text/image and AI Influencer have exact public price rules in the snapshot. Other prices remain null until an authenticated estimate. CLI/connector job-set types are not REST paths. No connector account identity, provider credential, live model entitlement or output success was inferred from public docs.

## Repository references and license checks

These are pinned observations from the coordinated primary-source repository audit, not a declaration that an unpinned repository will retain the same license. **No application source was imported from any repository below.**

| Repository and pinned revision | Observed license evidence | Use |
| --- | --- | --- |
| [higgsfield-ai/app-templates](https://github.com/higgsfield-ai/app-templates/tree/2b6343a7f2cbe9f629aeb84e7fd98e7ad32a1af3) — `2b6343a7f2cbe9f629aeb84e7fd98e7ad32a1af3` | Root LICENSE fetch returned 404; no package license declaration was found in the recorded inspection. | Reference named by the creator; excluded as a code/style/asset source. Public visibility was not treated as permission to copy. |
| [higgsfield-ai/higgsfield-js](https://github.com/higgsfield-ai/higgsfield-js/tree/e3f274249962417e21f6566d4eecec6d8491d11c) — `e3f274249962417e21f6566d4eecec6d8491d11c` | Package declared MIT; root LICENSE was missing in the recorded inspection. Version 0.2.6 was observed. | Contract reference only. The studio uses an original server-only fetch adapter. |
| [TechBeme/open-higgsfield](https://github.com/TechBeme/open-higgsfield/tree/1df1148e46d1b47d29e117b7bb1971a65c4286ee) — `1df1148e46d1b47d29e117b7bb1971a65c4286ee` | [MIT LICENSE](https://github.com/TechBeme/open-higgsfield/blob/1df1148e46d1b47d29e117b7bb1971a65c4286ee/LICENSE), copyright 2026 TechBe. | Reviewed canonical inputs, provider registry and capability-module patterns. No source copied; no foreign model IDs added to the Higgsfield REST catalog. |
| [Anil-matcha/Open-Generative-AI](https://github.com/Anil-matcha/Open-Generative-AI/tree/0668c210ebfe893f16c5149405a08d00b9ae90df) — `0668c210ebfe893f16c5149405a08d00b9ae90df` | MIT in the coordinated repository audit. | Related-repository discovery only; no code imported. |
| [digitlimit/higgsfield](https://github.com/digitlimit/higgsfield/tree/4e44c2b70dd5da541450ee7902d4d39a9586cfe10) — `4e44c2b70dd5da541450ee7902d4d39a9586cfe10` | MIT beta in the coordinated repository audit. | Related-repository discovery only; no code imported. |
| [higgsfield-ai/higgsfield-client](https://github.com/higgsfield-ai/higgsfield-client), [cli](https://github.com/higgsfield-ai/cli), [skills](https://github.com/higgsfield-ai/skills) | Creator prompt describes Apache-2.0, MIT and MIT respectively. No independently verified pinned SHA/license record was supplied to this final audit. | Reference inventory only. Do not present those prompt assertions as a completed pinned license check. |

The useful community patterns were verified directly in [canonical inputs](https://github.com/TechBeme/open-higgsfield/blob/1df1148e46d1b47d29e117b7bb1971a65c4286ee/src/models/canonical.ts), [provider registry](https://github.com/TechBeme/open-higgsfield/blob/1df1148e46d1b47d29e117b7bb1971a65c4286ee/src/providers/registry.ts), [provider result types](https://github.com/TechBeme/open-higgsfield/blob/1df1148e46d1b47d29e117b7bb1971a65c4286ee/src/providers/types.ts) and [image capabilities](https://github.com/TechBeme/open-higgsfield/blob/1df1148e46d1b47d29e117b7bb1971a65c4286ee/src/models/capabilities/image.ts). They support future provider expansion; the current catalog already centralizes canonical inputs and capabilities. The community app's lack of authentication/spending controls and ephemeral output behavior were not adopted. If code is copied from a licensed reference later, preserve the applicable license and copyright notices with that change.

## Implementation decisions and verification limits

- Public REST documentation governs endpoints and request schemas; marketing names and connector identifiers do not override it.
- Original components and assets replace the template scaffold. No screenshot-perfect parity or Quanta component reuse is asserted.
- Private server-owned storage, ownership checks and an application credit ledger replace client BYOK/local-only assumptions.
- Unknown prices are explicit; quotes and debit decisions remain server-side. Ambiguous provider submissions retain their original idempotency key instead of being automatically refunded or resubmitted as new work.
- Notifications are durably recorded before acknowledgement. Background processing refetches authoritative provider state; callback output URLs and status are never trusted.
- Local fixture runs and mocked provider tests are labelled as such. They do not establish access to any paid provider, email, database, storage or payment account.
- The catalog snapshot is finite, not a perpetual claim of all future models. Refresh official sources, schemas, examples, prices and account acceptance when adding or changing a model.

See the [completion checklist](completion-checklist.md) for feature status and the [launch runbook](launch-runbook.md) for configured-service acceptance. The public source destination is [Fusion-Data-Company/Fusion-Gen-Matrix](https://github.com/Fusion-Data-Company/Fusion-Gen-Matrix), branch `Fusion-Data-Co`; record the actual release commit and Vercel URL only after confirmed publication.
