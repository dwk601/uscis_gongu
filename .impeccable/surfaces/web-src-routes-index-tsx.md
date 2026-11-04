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

THESIS: An open canvas of cases. Every USCIS form is a colored card on a calm off-white canvas (pinned reference: grida.co); choosing a form tints the workspace in that form's color. Refuses the category default: government-blue form wizards, dense tables, walls of disclaimers.

OWN-WORLD: Ground #F7F7F4, ink #171717, hairline #E7E6E1; dark ground #111110, ink #EDEDE8. Form hues: tangerine #F2703D, lilac #C7B6EC, lime #D3E39A, forest #2E4B36, sky #9EC5F0, rose #F2A5B7, butter #F3D35B. Geist Variable, display 600 at -0.035em; black pill primary buttons; pill chips for choices; canvas panels 28px radius on a slightly darker tray; artifact cards 14px radius, soft offset shadow, slightly rotated on the landing only. Charts: 2px lines in the form hue, p10–p90 as a translucent band, tabular numerals.

STORY: Visitor reads one line, picks a form and filing date, sees "likely by <month>" and the trend; reads the community; signs in only to post, comment, or upvote.

FIRST VIEWPORT: Landing: slim nav (logo left; Trends, Bulletin, Community centered; theme toggle and Sign in right). Centered display headline, one short subline, then the working checker as a single pill row: form select, filed date, black "See my estimate" pill. Below, a rounded canvas tray holding three live data cards (official median wait, trend mini chart, bulletin cutoff), lightly rotated. Trends: form chip rail top, filed-date field beside it; a large hue-filled estimate card left, official wait-trend chart right; community percentiles and volume below.

FORM: brief-pinned grida.co canvas world, 1 of 1 (pinned, no roll). seed: none (unavailable)

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
