---
name: dashboard-with-stats
version: 1.0.0
description: Compose a dashboard surface from a `KPIRow` of `StatCard`s, a single hero `StatCard`, or a sparkline strip — choosing the layout based on how many stats the underlying data exposes and how the user reads it.
capabilities_used:
  - github.repo.list
when_to_use: |
  When a route's primary job is to answer "how is X trending right now?"
  and the underlying capability returns at least one numeric metric
  (count, sum, average, ratio). Specifically:

  - **3–5 stats**, comfortable density: a single `KPIRow` of `StatCard`s
    with delta and label, no sparkline. This is the default dashboard
    shape — comfortably scannable, no scroll on a 1280px desktop.
  - **6+ stats**, compact density: same `KPIRow` but with the
    `density="compact"` token applied so labels truncate to one line
    and the row stays on a single horizontal track. If the row would
    wrap on a 1024px viewport, drop to two rows of `KPIRow` rather
    than letting `StatCard`s tile awkwardly.
  - **1–2 stats** or a single hero metric the rest of the page is
    framed around: a single `StatCard` rendered at large size with the
    delta + a sparkline if the capability exposes a time series.

  Information hierarchy: the **most-anomalous** stat (largest |delta|
  vs the prior period) goes leftmost on LTR; ties break on
  most-recently-changed. Never sort alphabetically — that hides the
  "what should I look at first" signal a dashboard exists to give.
when_not_to_use: |
  When the route's primary job is data exploration (use `Table` +
  `FilterBar` instead) or composition narrative (use `Chart` + prose).
  Don't bind this skill to a capability that returns a single boolean
  or a single string — `StatCard` is for numbers. Don't use it as a
  decoration on a route whose hero content is a list or detail view;
  the user already has their reading frame and a `KPIRow` above it
  becomes visual noise.

  Skip on mobile (`responsive_targets` excludes mobile for `KPIRow`
  in the baseline registry as of 1.0.0); use a vertical `Stack` of
  individual `StatCard`s instead.
example_flow: |
  1. The compiler resolves a "dashboard" or "overview" intent against
     a list-shaped capability (e.g. `github.repo.list`, or any
     `*.list` placeholder convention) and computes counts, sums, and
     deltas in a manifest-side projector.
  2. Bind a `Container` → `Stack` shell. Inside the stack, place the
     `KPIRow` first (above the fold) with N `StatCard` children.
  3. For each stat, pick density per the rules above. If the
     capability also exposes a recent time-series field
     (e.g. `updated_at` per-row), render a sparkline inside the
     `StatCard`; otherwise render delta-only.
  4. Below the `KPIRow`, place either a `Chart` (single trend) or a
     `Table` (drill-down list) — the dashboard's "what next" surface.
  5. Wire each `StatCard` to a click handler that navigates to a
     detail route filtered to that stat's slice (see the `drill-down`
     skill).
known_failure_modes:
  - Putting 8+ stats in a single `KPIRow` at comfortable density and
    letting them wrap into a ragged second row. Always switch to
    `density="compact"` at 6+, or split into two intentional rows.
  - Sorting stats alphabetically instead of by anomaly. The user
    came to a dashboard to find what changed; alphabetical hides it.
  - Computing deltas against an inconsistent baseline (e.g. "last 30d"
    vs "last 7d") in the same row. All `StatCard`s in a `KPIRow`
    must share the same time window — wire them through the
    `time-range-selector` skill, never independently.
  - Rendering a sparkline against a series with fewer than 5 points;
    the visual is meaningless and misleads the eye into seeing
    trends that aren't there. Fall back to a delta-only card.
---

# Dashboard with stats

A dashboard is the surface that answers "how is the system right
now, and what changed?" in five seconds or fewer. This skill
composes the `KPIRow` + `StatCard` primitives the way a designer
would: density chosen for the count, ordering chosen for the
attention budget, and a single time window applied to the entire
row.

## Why this skill exists

Without an explicit skill, the compiler tends to either (a) under-fit
the dashboard with a single big `StatCard` when there are five
metrics worth seeing, or (b) over-fit it with a sprawling 12-card
`KPIRow` that wraps onto three lines and loses the "above the fold"
property. This skill encodes the density and ordering rules a human
designer applies by reflex.

## Composition rules

- One `KPIRow` per dashboard route, above the fold. No exceptions —
  if the page wants two distinct stat groupings, make them two
  routes or use a `Tabs` container.
- The leftmost `StatCard` is the most-anomalous metric. The
  manifest-side projector is responsible for sorting; the skill
  does not synthesize its own ordering at render time.
- Time window is owned by the `time-range-selector` skill (see
  `time-range-selector.skill.md`). Stats never declare their own
  window; they read from the route-level filter.
- Color the delta direction by the user's intent.global_preferences.
  delta_color_semantics if set; otherwise default to green-positive
  / red-negative. Capacity-shaped metrics (queue depth, error
  count) flip the default — a positive delta is bad. Honor the
  intent override; never hard-code per-metric.
- Click target is the whole `StatCard`, not a button inside it.
  Drill-down navigation is wired by the `drill-down` skill.
