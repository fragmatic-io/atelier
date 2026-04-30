---
name: time-range-selector
version: 1.0.0
description: Add a route-level time-range picker (Today / 7d / 30d / Custom) and wire its selected range to a filter string against the data's `received_at` / `created_at` field, so every chart, KPI, and table on the page reads the same window.
capabilities_used:
  - github.repo.list
when_to_use: |
  When the dashboard or analytics route is fed by a capability whose
  output rows expose at least one of: `received_at`, `created_at`,
  `updated_at`, `occurred_at`, `timestamp` (or any equivalent
  ISO-datetime field — use the `*.list` placeholder convention for
  capabilities the registry has not pinned yet). The picker is the
  user's primary control for reframing the entire surface.

  Default presets: **Today** (now-1d), **7d** (now-7d), **30d**
  (now-30d), **Custom** (open `Calendar` for a start/end pair).
  Default selection is **7d** — the densest preset that still shows
  weekly seasonality. Persist the user's last choice on the
  intent (so a reload restores it).

  Render the picker as a `ButtonGroup` of preset buttons inside a
  `FilterBar` slot — flush right on desktop, stacked above the
  `KPIRow` on mobile. The Custom preset opens a `Calendar`-based
  popover; commit fires only on Apply, never on intermediate dates.
when_not_to_use: |
  When the underlying data has no time field. A picker that does
  not change anything is worse than no picker at all — it implies
  the user can affect the view, then betrays them silently.

  When the route is showing a single point-in-time snapshot
  (e.g. a profile page, a single record's detail view). Time
  ranges are for aggregates over rows, not for one row.

  When the data window is governed by an upstream filter the user
  cannot override (e.g. an account that retains 30 days only).
  Surface that as a label, not a picker.
example_flow: |
  1. The compiler detects a dashboard intent and inspects the bound
     capability's `output` schema for an ISO-datetime field. If
     present, it allocates a `time_range` slot in the route filter.
  2. Render a `FilterBar` containing a `ButtonGroup` with the four
     presets above. Default-select **7d**.
  3. On preset click, write a filter string of shape
     `<time_field> >= now-<n>d` (e.g. `received_at >= now-7d`)
     into the route's filter state. Every downstream `Chart`,
     `KPIRow`, `Table`, and `List` on the route reads that filter
     before issuing its capability call.
  4. **Custom**: open a `Calendar` popover (start + end). On Apply,
     write `<time_field> >= <start> AND <time_field> < <end>`.
     Disable Apply when start > end.
  5. Persist the chosen range to `intent.global_preferences.
     last_time_range` (or equivalent) so the next visit restores it.
known_failure_modes:
  - Wiring the picker to only one widget on the route (e.g. just
    the `Chart`) and leaving the `KPIRow` on a different window.
    The user reads the page as a single coherent view; mismatched
    windows produce silently wrong conclusions. Always route every
    time-bound widget through the same filter slot.
  - Letting **Today** mean "calendar day in the user's tz" without
    declaring the timezone. If the intent.global_preferences.tz is
    set, use it; otherwise use the browser's locale tz and surface
    it in the picker label ("Today (UTC-7)").
  - Allowing **Custom** with a start strictly after the end — the
    Apply button must stay disabled, not produce an empty result.
  - Off-by-one on **30d**. `now-30d` includes today; document this
    in the route's filter spec so a downstream eval can pin it.
  - Forgetting to debounce the **Custom** Apply on slow capabilities
    — a user dragging across months should see one fetch, not 12.
---

# Time-range selector

The single source of truth for "what window am I looking at?" on
any dashboard or analytics route. The picker owns the route-level
filter; every time-bound widget reads from it.

## Why this skill exists

Dashboards without a unified time picker accumulate per-widget
controls — a 7d toggle on the chart, a 30d toggle in the KPI, a
date range buried in the table header. Each looks reasonable on
its own and produces a route the user reads as if it were
coherent, but it isn't. This skill keeps the window in one place.

## Composition rules

- One picker per route, top-of-page. The picker writes the route
  filter; widgets read it. Widgets never declare their own window.
- Default preset is **7d** unless the intent overrides via
  `intent.global_preferences.default_time_range`. Honor the override.
- **Custom** opens a `Calendar` popover, not a separate route. The
  picker stays in scroll context so the user can compare presets
  back-to-back without navigating away.
- The picker label always shows the active range — "Last 7 days",
  not "7d". The button label is the abbreviation; the active state
  expands.
- When the active range yields zero rows, the route's `EmptyState`
  must reference the range in its copy ("No issues in the last 7
  days") so the user knows the picker is the lever to adjust.
