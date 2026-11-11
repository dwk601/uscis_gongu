---
version: 1
slug: "web-src-routes-index-tsx"
primary_target: "web/src/routes/index.tsx"
related_targets: ["web/src/routes/trends.tsx","web/src/routes/bulletin.tsx"]
---

# gongu web surfaces

Scope: landing `/` (Persuade), analytics `/trends` and `/bulletin` (Operate), community `/community`, `/login`, `/settings` (Operate). One shared world.
Audience/job: people waiting on a USCIS case want their likely decision date and whether waits are trending up or down, in seconds, without an account.
Build path: code-led (no image generation available).

## Direction contract

THESIS: An open canvas of cases. Form-colored choices and results sit on a calm off-white canvas (pinned reference: grida.co), with a subtle form tint on Trends. Refuses government-blue form wizards and dense walls of copy.

OWN-WORLD: Ground #F7F7F4, ink #171717, hairline #E7E6E1, tray #EBEBE7; dark ground #111110, ink #EDEDE8, tray #20201E. Form hues: tangerine #F2703D, lilac #C7B6EC, lime #D3E39A, forest #2E4B36, sky #9EC5F0, rose #F2A5B7, butter #F3D35B. Geist Variable; black pill primary buttons; colored 14px-radius form choices; flat 20px workspace panels and 28px My case panels. The tray color remains in theme controls, errors and skeletons. Charts use form-related strokes and a translucent range band; data tables use tabular numerals.

STORY: A visitor chooses My case or Visa bulletin, then selects a form or category. Later in the same browser session, a visitor can continue the saved case or choose a different form. Results lead to Trends and Community; reading is open, and signing in is needed for participation.

FIRST VIEWPORT: Landing: logo, My case, Visa bulletin and Community navigation, theme and account actions; a headline and two colored choice cards, side by side on desktop and stacked on mobile. My case starts with grouped featured forms; selection collapses to a Change form summary beside an optional filed date, with an answer and trend below. Trends has a horizontal journey rail, then All forms featured choices visible inline, a searchable other-forms disclosure and Filed control; journey-specific forms and case categories retain their respective chip rails. Bulletin offers group and category choices, a Change summary, country chips and Approval cutoff / Filing cutoff segments once a category is selected. Community presents a feed, sort choices and the shared form filter. Screen changes focus the destination heading or main without scrolling; initial load and in-screen changes do not move route focus.

FORM: brief-pinned grida.co canvas world, 1 of 1 (pinned, no roll). seed: none (brief-pinned, no roll)

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Finish verdict

Not independently re-reviewed since 4ef683e. At ae39353, landing, expanded and selected My case, Trends, bulletin and Community were viewed at 390px and 1280px in light and dark themes against the read-only service.
