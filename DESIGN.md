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
    fontSize: "clamp(3rem, 6vw, 6rem)"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.035em"
  body:
    fontFamily: "Geist Variable, sans-serif"
    lineHeight: 1.5
rounded:
  artifact: "14px"
  panel: "20px"
  tray: "28px"
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
- Soft trays and lightly lifted artifacts contrast with flat workspace panels.
- Pill controls and tight, balanced headlines keep the interface approachable.

## Colors

The light and dark neutral grounds support a seven-color form palette. Use the form hue for the estimate and related chart; forest uses white ink where required. Neutral panels and muted text create hierarchy without government-blue styling. Dark mode changes the ground, panels, hairlines and muted text together.

## Typography

Geist Variable is the shared display and body face. The landing display uses the frontmatter's responsive scale and tight tracking; workspace headings range from 2rem on mobile to 4rem on desktop. Body paragraphs use a 1.5 line height, with 14px controls and metadata. At 700px and below, inputs use 16px text and controls have at least 44px targets. Numeric data uses tabular figures where charts need alignment.

## Layout

The header and workspace are capped at 1320px. Workspace horizontal padding scales with the viewport up to 66px. The desktop analytics grid uses 1fr and 1.4fr columns with a 16px gap; it stacks on small screens. Form chips wrap on desktop and scroll horizontally on small screens without widening the page; long visa-route labels wrap. Bulletin categories use a grouped selector with the full selection shown outside it. Community content is narrower (850px, or 520px for focused forms).

## Elevation & Depth

Most panels rely on tonal separation. The landing checker uses `0 4px 20px #00000010`, and rotated artifacts use `0 12px 24px #0000001c`; account menus use `0 8px 24px #0003`.

## Shapes

Pills identify actions, chips and compact fields. Workspace panels have 20px corners; the landing tray has 28px corners and its smaller artifacts have 14px corners. Social cards use a fine hairline border and 14px corners.

## Components

- **Buttons:** dark pill primary with white text; hover lightens the background. Dark mode inverts the primary to ink on ground; hover uses #c6c6bd. Focus uses a 3px #7c55ca outline in light mode and #c7b6ec in dark mode.
- **Chips:** bordered panel-colored pills; the selected state inverts to ink and ground.
- **Fields:** rounded, bordered fields use the current panel or ground; social forms are full width.
- **Navigation:** slim centered desktop navigation becomes a second row on small screens. The theme toggle and account action stay at the end of the header. Community detail pages use an underlined back link and show the post title once as the page heading.
- **Artifacts:** form-colored cards rotate only on the landing and pair a key metric with a source. Hover and keyboard focus straighten and lift them over 250ms with an exponential ease-out; reduced motion suppresses the transition.

## Do's and Don'ts

### Do:
- **Do** keep form colors associated with their data and use legible ink on each.
- **Do** preserve clear focus indicators and responsive chip rails.

### Don't:
- **Don't** make analytical or community surfaces depend on a sign-in for reading.
- **Don't** substitute fabricated figures for missing data.
