---
name: kpi-row-density
version: 1.0.0
description: Pick the density and content shape for each `StatCard` in a `KPIRow` — stat-only, stat + delta, or stat + sparkline — and apply truncation and color rules so the row stays scannable across long labels and mixed-direction deltas.
capabilities_used:
  - github.repo.list
when_to_use: |
  When the `dashboard-with-stats` skill has decided to render a
  `KPIRow` and the compiler now needs to fill each `StatCard`. Use
  this skill for the per-card shape decisions:

  - **stat-only**: the metric is a status indicator (e.g. "On" /
    "12 open") with no meaningful prior period. No delta, no
    sparkline.
  - **stat + delta**: the canonical shape. A primary number, a
    secondary delta vs the active time window's prior period
    (computed by the manifest projector, not the card). Use this
    by default for any metric tied to the time-range selector.
  - **stat + sparkline**: when the capability exposes a usable
    time series (≥ 5 ordered points within the active window)
    AND the row's density is `comfortable` (≤ 5 stats). Sparkline
    is the most expensive shape — never use it on `compact` density
    or the row line-height blows up.

  Truncation: labels >18 characters truncate with an ellipsis and
  expose the full label on hover (`title` attribute via the
  registered binding). Numbers never truncate — if the number
  would overflow the card's width at the chosen density, drop one
  shape level (sparkline → delta → stat-only).
when_not_to_use: |
  When there is no `KPIRow` on the route — this skill only governs
  the per-card decisions inside one. For deciding *whether* to use
  a `KPIRow` at all, see `dashboard-with-stats`.

  Don't use this skill to dictate copy, formatting of currency, or
  i18n of numbers — those belong in the manifest's projector and
  the brand-kit's locale settings, not in the layout skill.
example_flow: |
  1. Receive the list of stats from the projector (each entry has
     `label`, `value`, optional `delta`, optional `series`).
  2. For each stat, choose shape: if `series.length >= 5` and the
     row density is `comfortable`, use stat + sparkline; else if
     `delta` is present, use stat + delta; else stat-only.
  3. For each card, choose delta color: read
     `intent.global_preferences.delta_color_semantics` if present
     (a record from `metric_id` → `"positive_is_good" |
     "negative_is_good" | "neutral"`). Default for unmapped metrics
     is `positive_is_good` (green up, red down). Capacity-shaped
     metrics (queue length, error count, latency, p95) usually
     override to `negative_is_good`.
  4. Apply truncation: if `label.length > 18`, render the truncated
     label and bind the full label to a tooltip (`title`).
  5. If the chosen shape would visually overflow at the active
     density (compute label-px + value-px + delta-px against the
     card's flex-basis), drop one shape level. Do this *before*
     render, not after — a half-rendered card is worse than a
     simpler one.
known_failure_modes:
  - Painting a negative delta red on a metric where down is good
    (e.g. error rate, queue depth). Always check the
    `delta_color_semantics` override before applying the default.
    A green-down KPI is the single most common dashboard
    correctness bug.
  - Mid-truncating values like "$1.2…M" because the card was sized
    for a 4-digit count. Numbers never truncate — drop the
    sparkline or the delta first, then the label, then the
    horizontal padding, before you let a number lose digits.
  - Rendering a sparkline against 2–3 points and showing a
    misleading slope. Enforce `series.length >= 5`; below that,
    fall back to delta-only.
  - Letting the row mix shapes inconsistently — three cards with
    sparklines and three with delta-only on the same row reads as
    visual chaos. If any card cannot afford a sparkline, demote
    every card on the row to stat + delta.
  - Showing a delta with no time-window label nearby. The user
    needs to know "delta vs what?" — the picker label above the
    row supplies this. If the row is on a route without the
    time-range picker, omit deltas entirely.
---

# KPI row density

The per-card shape rules for a `KPIRow`. Sister skill to
`dashboard-with-stats` (which decides the row exists and how many
cards) and `time-range-selector` (which supplies the comparison
window every delta is computed against).

## Why this skill exists

`StatCard` is a small primitive with three viable shapes. Without
this skill, the compiler picks the most-elaborate shape every time
because more pixels feels like more value. The result is a row of
sparklines that fight for attention and don't fit at compact
density. This skill encodes the demote-when-tight discipline a
designer applies before any pixels render.

## Composition rules

- Pick shape per card, but keep the row consistent: if any card on
  the row demotes (overflow, missing series), demote every card.
- The projector owns the data; the skill only owns shape. Never
  do client-side aggregation in the card.
- Color follows intent override first, default semantics second.
  Per-metric hard-codes are a smell — they don't survive
  re-skinning.
- Tooltips are the escape hatch for any data that didn't fit. Every
  truncated label and every demoted shape exposes the missing
  detail on hover; nothing is hidden silently.
