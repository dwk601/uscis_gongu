---
name: gongu
description: A calm, colorful canvas for case insights and community.
colors:
  ground: "#f7f7f4"
  ink: "#171717"
  hairline: "#e7e6e1"
  tray: "#ebebe7"
  panel: "#ffffff"
  muted: "#62625e"
  focus: "#7c55ca"
  dark-focus: "#c7b6ec"
  dark-ground: "#111110"
  dark-ink: "#edede8"
  dark-tray: "#20201e"
  dark-panel: "#272724"
  tangerine: "#f2703d"
  lilac: "#c7b6ec"
  lime: "#d3e39a"
  forest: "#2e4b36"
  sky: "#9ec5f0"
  rose: "#f2a5b7"
  butter: "#f3d35b"
typography:
  display:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "clamp(2.3rem, 4vw, 4rem)"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.035em"
  body:
    fontFamily: "Geist Variable, sans-serif"
    lineHeight: 1.5
rounded:
  choice: "14px"
  panel: "20px"
  case-panel: "28px"
  pill: "99px"
spacing:
  grid: "16px"
  panel: "28px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.panel}"
    rounded: "{rounded.pill}"
    padding: "14px 24px"
  chip:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "9px 15px"
---

# Design System: gongu

## Overview

**Creative North Star: "An open canvas of cases"**

A quiet, off-white canvas carries bright form colors and confident black actions. Data and community surfaces keep the same friendly world while giving reading and interaction room to breathe.

**Key Characteristics:**
- Color identifies a form rather than decorating every surface.
- Flat, color-filled choices and neutral panels separate actions from results.
- Pill controls and compact, balanced headlines keep the interface approachable.

## Colors

The light and dark neutral grounds support a seven-color form palette. Use the form hue for the estimate and related chart; forest uses white ink where required. Neutral panels and muted text create hierarchy without government-blue styling. Dark mode changes the ground, panels, hairlines and muted text together.

## Typography

Geist Variable is the shared display and body face. Workspace headings use the frontmatter's desktop scale and tight tracking; at 700px and below they use `clamp(2rem, 9vw, 3rem)`. Body paragraphs use a 1.5 line height, with 14px controls and metadata. At 700px and below or with a coarse pointer, inputs use 16px text and interactive targets have minimum 44px dimensions where specified. Tables use tabular figures.

## Layout

The header and workspace share a 1320px maximum and horizontal padding of `min(5vw, 66px)`; at 700px and below both use 20px side padding, and navigation wraps to a second header row. The landing's two choice cards sit side by side and stack at 700px. Trends result panels use 1fr and 1.4fr columns with a 16px gap, stacking at 700px; My case uses 1.2fr and 1fr before stacking. Bulletin results stack at 900px. Community content is capped at 850px, or 520px for focused forms.

In Trends, the journey rail remains horizontally scrollable; the case-category chip rail also scrolls horizontally. Journey-specific form chips wrap above 700px and use a horizontal rail at 700px and below. The All forms featured choices and expanded other-form choices wrap instead of forming a rail. The disclosure and Filed control align side by side above 560px and stack at or below it; revealed options occupy a full-width row.

## Elevation & Depth

Most surfaces are flat, using tonal separation or a hairline border. The account menu uses `0 8px 24px #0003`; selected form choices use a two-ring box shadow for state rather than elevation. The shell and estimate background transition over 0.45s; reduced-motion preferences suppress transitions.

## Shapes

Pills identify actions, chips and compact fields. Landing choices and workspace panels have 20px corners; My case answer and trend panels use 28px. Form choices and social cards use 14px corners; social cards have a fine hairline border.

## Components

- **Buttons:** dark pill primary with white text; hover lightens the background. Dark mode inverts the primary to ink on ground; hover uses #c6c6bd. Focus uses a 3px #7c55ca outline in light mode and #c7b6ec in dark mode.
- **Chips:** bordered panel-colored pills; the selected state inverts to ink and ground.
- **Fields:** rounded, bordered fields use the current panel or ground; social forms are full width.
- **Navigation:** the logo and My case, Visa bulletin, and Community links share the header with theme and account actions. Navigation moves to a second row on small screens. The active link uses ink and a 2px underline with a 6px offset. A committed screen change focuses the destination `h1` once, or `main` when no heading exists, without scrolling; initial loads and same-screen updates do not move focus. Focused headings retain the 3px focus-visible outline. Community detail pages use an underlined back link and show the post title once as the page heading.
- **Landing:** two colored choices lead to My case and Visa bulletin. Later in the same browser session, visitors can continue their saved case or choose a different form.
- **Form choices:** My case and Community use a shared summary and expandable grouped featured forms, with a searchable other-forms disclosure. Trends' All forms view displays featured choices inline under “Choose a form”; “Don't see yours? Browse all other forms (N)” opens the same searchable choices. A selected non-featured form is revealed on entry and history navigation without automatic focus. After a form is picked on Trends, the choices collapse to a selected summary with a Change form action. Selection uses a visible ring and pressed state.
- **Bulletin:** group and category buttons lead to a selected category summary with a Change action. Country chips and the segmented Approval cutoff / Filing cutoff chart control refine the result; the chart control appears once a category is selected.

## Do's and Don'ts

### Do:
- **Do** keep form colors associated with their data and use legible ink on each.
- **Do** preserve clear focus indicators and the intended wrapping and scrolling behavior of choice controls.

### Don't:
- **Don't** make analytical or community surfaces depend on a sign-in for reading.
- **Don't** substitute fabricated figures for missing data.
