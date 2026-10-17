---
name: Fusion Gen Matrix
status: implementation
product_mode: operational-tool
theme_support: [dark]
default_theme: dark
register: [professional, stylish, cinematic]
intensity: premium
surface: solid
density: balanced
brand_force: clear
evidence_refs:
  - https://higgsfield.ai/
  - https://higgsfield.ai/ai/video
  - https://higgsfield.ai/pricing
themes:
  dark:
    canvas: "#101112"
    surface: "#191B1D"
    surface-raised: "#252729"
    surface-recessed: "#151618"
    text-primary: "#F5F5F5"
    text-secondary: "#B3B5B7"
    text-tertiary: "#919597"
    border-subtle: "#2A2D2F"
    border-strong: "#414548"
    focus: "#D1FE17"
    shadow: "0 20px 70px rgba(0,0,0,.45)"
    glow-primary: "0 0 24px rgba(209,254,23,.12)"
---
# Fusion Gen Matrix design contract
Fusion operators create campaign images and motion, retain the source prompt, and organize work by client project. The UI is the working studio: a single navigation shell, a compact 320px video creation panel and floating image composer, and a media canvas. Explore introduces the working tools with original illustrations, rather than pretending to display paid generations.

## Sources and decisions
The creator brief provides dark surfaces, lime generation CTA, broad navigation, model picker, reference roles, settings and media states. Public Higgsfield Explore, image and video layouts were rendered and inspected October 17, 2026. No proprietary template, logo, media or copy was copied. Rob Design Director and Fusion OS DESIGN.md govern clarity, component state, compact controls and polish. Dark only is an explicit brief override of the root adaptive default.

## Typography and layout
Self-hosted DM Sans body and Barlow Condensed display, both SIL OFL 1.1. No negative letter spacing or viewport-scaled type. Metadata uses system monospace. Cards 10–18px; input/button 9px. Explore max-width 1800px, with a horizontal cinematic rail. Mobile at 760px stacks the creation panel above history and keeps its primary action reachable. Header menu becomes an accessible dialog.

## State and interaction
Server bootstrap is authoritative for mode, user, catalog, plans and capabilities. Preview has a persistent label, illustrative media badges, and explicit local sign-in/credit actions. Generate quote comes from the server. Empty, loading, error, queue, running, failed, moderation, canceled, completed, signed-out and unavailable states have specific recovery actions. No fake counters, discounts, live outputs or prices.

## Assets
Original cinematic concept artwork in public/art/fusion-concepts-v2.png is generated for this project, labeled and separate from app results. Original local SVG studies also remain: product still life, architectural study, and motion sculpture. They are labeled illustrations. API outputs belong in a separate generation gallery, never mixed into an unlabeled portfolio. Icons use lucide. The custom Fusion mark is an original geometric monogram.

## Accessibility and motion
Base UI dialog primitives provide focus trapping, escape dismissal and restoration. Every field has a label; icon-only buttons have a title and accessible name. Focus rings remain visible. All media has a stable aspect ratio. No autoplay audio. Reduced motion disables transitions and loader animation. Toast status uses polite live announcements.

## Acceptance
Root verifier owns 1440px/390px screenshots and end-to-end browser checks. Required journeys: preview login, prompt/model/settings, reference upload, generated status, library detail/download/reuse/publish/delete, projects, credit ledger, admin access, no horizontal scroll. Public pricing remains unavailable until configured. Legal copy is explicitly draft.

See docs/decisions.md and docs/asset-provenance.md for the second-pass reference and licensing record.
