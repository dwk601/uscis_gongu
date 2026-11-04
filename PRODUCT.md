# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People with a current, past, or future USCIS case (green card, citizenship, work permit, family petitions, visa bulletin waits). They arrive anxious and want one answer fast: "when will my case likely be decided, and is it getting faster or slower?" Past applicants come back to share their timeline and help others. (Inferred from the brief; no interview was possible.)

## Product Purpose

gongu turns USCIS data into a quick, friendly estimate and trend view for a case type, plus a Reddit-style community. Success: a visitor picks their form, optionally their filing date, and understands their likely wait in seconds without signing in.

## Positioning

Free, no-login case analytics that put official USCIS quarterly figures, visa bulletin history, and community-reported timelines side by side, with an easy, colorful interface instead of a government-style site.

## Operating Context

Used on phones and laptops, often repeatedly while waiting on a case. Browsing analytics never requires an account; signing in is only needed to post, comment, or upvote, and to manage settings.

## Capabilities and Constraints

- Analytics are read-only from the USCIS ETL PostgreSQL views (`uscis_form_quarter`, `visajourney_timeline_stats`, `immihelp_timeline_stats`, `visa_bulletin_series`).
- Estimates are descriptive, not USCIS commitments: official medians and self-reported percentiles stay labeled by source; self-reported data is not verified agency status. The estimate adds the latest positive reported median for the selected official series to the filing date, using 30.44 days per month in UTC.
- Immihelp is excluded from v1; community percentiles come from VisaJourney.
- Community: posts, comments, upvotes; email/password accounts in PocketBase. Moderation, chat, and notifications are out of scope until requested.
- Free to use; no pricing, ads, or paywalls.

## Brand Commitments

- Name: gongu, lowercase. Logo: `web/public/gongu.svg`.
- Binding reference for style and feel: https://grida.co (calm off-white canvas, huge tight sans headlines, black pill actions, colorful floating artifact cards).
- Fun, dynamic colors; not a government look. Light theme by default, dark theme available.
- Minimal text, minimal displays, few clicks.

## Evidence on Hand

Real data only from the ETL views above. No testimonials, user counts, accuracy claims, or partner logos exist; do not fabricate them.

## Product Principles

1. One question, one screen: the estimate and trend for a chosen form appear without extra steps.
2. Login is never a gate for reading.
3. Always say where a number comes from (official vs community-reported) in as few words as possible.
4. Fewer words, fewer controls, sensible defaults.
