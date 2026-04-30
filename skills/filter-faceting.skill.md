---
name: filter-faceting
version: 1.0.0
description: Choose between a `FilterBar` of facet chips, a `Search` input, or inline category chips for filtering a list/dashboard surface, based on the cardinality of each facet and whether the user is hunting (search) or narrowing (facet).
capabilities_used:
  - github.repo.list
  - dummyjson.product.list
  - dummyjson.product.search
when_to_use: |
  When a route renders a `List`, `Table`, `Grid`, or `Kanban` of
  rows backed by a list-shaped capability and the user needs to
  narrow the result set. Choose the surface by cardinality:

  - **≤ 7 distinct values** for a facet (e.g. status =
    `open|closed|merged`): render as a **chip group** inline
    above the list. Click toggles, multi-select allowed unless
    the facet is mutually exclusive.
  - **8–30 distinct values**: render as a **`Select` dropdown**
    inside a `FilterBar`. For multi-select use `MultiSelect`. The
    dropdown's options come from the data (don't hard-code).
  - **> 30 distinct values OR free-text fields**: render as a
    **`Search` input** with debounced query. Bind to the
    capability's search variant if one exists (e.g.
    `dummyjson.product.search`); otherwise filter client-side
    and document the row-count cap.

  Mix is allowed: a route can have a `Search` for the primary
  free-text field, a chip group for status, and a dropdown for
  category. Compose them inside one `FilterBar`. Never split
  filters across two visually disjoint regions of the page.

  Empty result handling: when filters yield zero rows, render an
  `EmptyState` whose copy *names the filters in scope* ("No
  products match 'tablet' in the Electronics category"). Always
  expose a one-click "Clear filters" affordance.
when_not_to_use: |
  When the route renders a single record (detail view) or a fixed
  set of < 5 rows that always fit on screen — filters add weight
  for no benefit.

  When the data has no faceting potential (every row is unique on
  every dimension). A search box is fine; a `FilterBar` is
  premature.

  When the underlying capability has no `search` parameter and
  the row count exceeds what client-side filtering can comfortably
  handle (>1000 rows for typical browsers). In that case, surface
  this as a constraint to the user and add server-side search to
  the capability before binding this skill.
example_flow: |
  1. Inspect the capability output's row shape. Pick up to ~5
     "facet candidate" fields — categorical fields with
     reasonable cardinality (count distinct).
  2. For each facet, pick the surface per the cardinality rules:
     ≤7 → chips, 8–30 → dropdown, >30 → search.
  3. Place the surfaces in a single `FilterBar` at the top of the
     list region. `Search` slot is leftmost (primary affordance);
     chips and dropdowns follow rightward.
  4. Wire each surface to the route filter state. Filters
     compose with AND across facets, OR within a multi-select.
  5. On change, update a "filters in scope" summary at the top of
     the result region ("3 filters: status=open, category=API,
     search='login'"). Provide a Clear all button.
  6. On zero results, render an `EmptyState` whose copy includes
     the filter summary verbatim. Provide a Clear filters CTA.
known_failure_modes:
  - Hard-coding facet values in the manifest. The list of
    statuses or categories must come from the data itself
    (distinct + sort by frequency, descending), so a new value
    appearing in production isn't invisible to the filter UI.
  - Treating "8 categories" as still chip-friendly. Past 7, the
    chip row wraps and the row's visual hierarchy collapses. Use
    a dropdown.
  - Letting Search be eager (fire on every keystroke). Always
    debounce ~250ms and surface a `Spinner` in the search box
    while the request is in flight. (See `product-search` for the
    canonical wiring.)
  - Forgetting to clear stale results when the user empties the
    search box. The list must reset to the unfiltered state, not
    show the last successful query's rows.
  - Empty state copy that says "No results" without naming the
    filters. The user cannot easily tell whether the filter is
    too narrow or whether the underlying data is empty.
  - Persisting filters across drill-down navigation in unexpected
    ways — see the `drill-down` skill for the deliberate rules
    on filter inheritance.
---

# Filter faceting

The decision rules for "what filter surface should I expose, and
where?" Built around cardinality (chips for few values, dropdowns
for medium, search for many) and the user's mode (hunting vs
narrowing).

## Why this skill exists

The compiler defaults to either too few filters (a single search
box for everything) or too many (a dropdown for every column,
including the boolean ones). This skill encodes the cardinality-
driven rules a designer would apply by reflex, plus the empty-
state copy contract that turns a dead-end into a clear next step.

## Composition rules

- One `FilterBar` per list/table region. Filters are not
  scattered across the page.
- Facet values come from the data, not from a hard-coded list.
- `Search` is debounced (~250ms) and bound to the capability's
  search variant when present.
- AND across facets, OR within a single multi-select facet.
- Empty state names the filters in scope and exposes a Clear
  affordance.
- The filter state is part of the route filter; downstream
  charts and KPIs read the same filter (so a category drill-down
  also reframes the dashboard's stats).
