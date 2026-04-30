---
name: chart-selection
version: 1.0.0
description: Pick the right `Chart` type for the data shape — line for single-metric over time, bar for category comparison, stacked bar for composition (not pie unless ≤4 slices), histogram for distribution. Bans 3D, donuts on >4 slices, and dual y-axes by default.
capabilities_used:
  - github.repo.list
  - dummyjson.product.list
when_to_use: |
  When the route needs a `Chart` and the compiler must choose a
  type. Apply these rules in order:

  - **Single metric over time** (one numeric series indexed by a
    datetime field): **line chart**. Always. Even when the series
    is short (5–10 points), a line communicates "over time" more
    honestly than a bar.
  - **Comparison across categories** (≤ ~12 categories, one or two
    measures per): **bar chart**, horizontal if any category label
    is over 12 characters or if there are more than 7 categories.
    Vertical bars are only readable for short labels.
  - **Composition / part-to-whole**: **stacked bar** (or stacked
    column) showing each part as a segment. Use a **pie chart**
    ONLY when there are ≤ 4 slices and the user genuinely needs
    proportion-at-a-glance. For 5+ slices, stacked bar — pies
    become unreadable past four.
  - **Distribution of a continuous variable**: **histogram** (bar
    chart with bucketed x-axis). Pick bucket width via Freedman-
    Diaconis or Scott's rule, not arbitrary round numbers, and
    expose the bucket size in the chart title.
  - **Two measures over time** that the user wants to compare:
    two **lines on a shared y-axis** if their units match;
    otherwise **two stacked sub-charts**, never a dual-y-axis
    chart (dual axes lie about correlation).

  Annotate every chart with the active time window from the
  `time-range-selector` skill in its title or subtitle.
when_not_to_use: |
  When the underlying capability returns a single number — use
  `StatCard`, not `Chart`. When the data is text-heavy, use
  `Table`. When the user needs to read individual rows, use
  `List` or `Table`; charts answer aggregate questions.

  Skip when there are fewer than 3 data points — a chart with
  2 points is just a slope, and a slope inferred from 2 points
  is misleading. Show the raw values in a `KPIRow` instead.

  Never use a chart to render a categorical sequence whose order
  doesn't matter (e.g. a list of departments by alphabetical
  order). Bars imply ranking; alphabetical order disguises noise
  as signal.
example_flow: |
  1. Inspect the bound capability's output shape. Identify whether
     the data is (a) time-indexed scalars, (b) keyed categorical
     measures, (c) a partition that sums to a known whole, or (d)
     a continuous distribution.
  2. Apply the rules above to pick a type.
  3. Constrain axes: y-axis starts at 0 unless the data is
     bounded (e.g. percentages 0–100 or scores) AND the variation
     is small. A 0-pinned y-axis prevents the "zoomed-in to fake
     a trend" failure.
  4. Limit color count: ≤ 6 distinct colors per chart. If the
     data has more series, group the long tail into "Other".
  5. Set the chart title to the metric name; set the subtitle to
     the active time window string. Include the bucket size for
     histograms.
known_failure_modes:
  - Defaulting to a pie chart for any "% breakdown" intent. Pies
    are fine for ≤ 4 slices; past that they're worse than a
    stacked bar at every job a chart does. Switch to stacked bar.
  - 3D charts. Never. Not for any data shape, not for any client.
    Z-axis depth distorts area perception.
  - Truncating the y-axis to make a small change look big. The
    chart literally lies about the magnitude. Always pin to 0
    unless the metric is bounded; if you must truncate, label
    the axis break explicitly.
  - Using a line chart for unordered categories. A line implies
    interpolation between adjacent x-values; categories don't
    interpolate. Use bars.
  - Dual-y-axis charts. They suggest a correlation between two
    metrics that the chart's geometry has manufactured. Use two
    side-by-side or stacked sub-charts instead.
  - Forgetting to annotate the active time window — the chart
    looks the same regardless of the picker, and a screenshot
    detached from the route is uninterpretable.
---

# Chart selection

The decision tree for "given this data shape, which chart type?"
This skill encodes Edward Tufte / Stephen Few rules: minimal ink
per data point, no chartjunk, no axis trickery, and a strong bias
toward bars for categorical data and lines for time series.

## Why this skill exists

The compiler, left to its own devices, will produce a pie chart
for a 9-segment composition and a 3D bar for a "make it pop"
intent. Both are wrong. This skill encodes the bright-line rules
the compiler should never violate, and the soft preferences a
designer would express in a review.

## Composition rules

- Type follows shape, not aesthetic. Bar for compare, line for
  trend, stacked bar for composition, histogram for distribution.
- Y-axis pins to 0 unless the metric is genuinely bounded.
- ≤ 6 colors per chart; long tail collapses to "Other".
- Title is the metric; subtitle is the time window. No chart
  ships without both.
- Bucket size is part of the title for histograms — never
  hidden in a tooltip.
- The chart never re-fetches on its own — it reads from the
  route filter (see `time-range-selector`).
