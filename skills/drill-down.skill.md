---
name: drill-down
version: 1.0.0
description: Wire a click on a dashboard tile (`StatCard`, `Chart` segment, list row) to either a `DetailView` route or an in-place `Drawer`, with breadcrumb wiring back, and persist the active filter state across drill levels so the user never loses context.
capabilities_used:
  - github.repo.list
when_to_use: |
  When a dashboard or list surface exposes rows or aggregates the
  user can interrogate further. Pick the destination by depth and
  context:

  - **Drawer (in-place reveal)**: when the detail content fits in
    a side panel (≤ ~12 fields, no nested lists), and the user is
    likely to inspect several siblings without leaving the
    dashboard. The `Drawer` keeps the parent route visible
    (filter state, KPI, chart) so the user can compare row-by-row.
  - **DetailView route (full navigation)**: when the detail has
    its own sub-structure (nested list, comments, history, edit
    form), or when the detail is a destination the user might
    bookmark/share. A route gives the URL its own filter state
    and breadcrumbs.
  - **Filtered list route**: when the click is on an aggregate
    (a `StatCard` for "Open issues" or a chart segment for
    "Electronics"), navigate to the parent list route with the
    filter pre-applied. Do NOT open a `Drawer` for an aggregate —
    drawers are for individual records.

  Breadcrumb wiring (always, for both routes and drawers): the
  destination's `Breadcrumb` carries Dashboard > [drill source]
  > [current]. The drill source segment is clickable and returns
  to the parent with its filter state intact.

  Filter inheritance: the drill destination inherits the parent
  route's filter (time range, faceting, search) by default. A
  toggle on the destination ("Show all", explicit) lets the user
  shed the inherited filter — but inheritance is the default,
  not the override. The user dragged a context with them.
when_not_to_use: |
  When the click target performs an action (Add to cart, Mark
  complete, Archive). Actions are not navigations — see the
  capability's `confirmation` policy and the `cart-add` skill
  for the action pattern.

  When the row has no further detail to show — a stat that
  represents a closed-form number with no underlying records.
  Don't make tiles falsely interactive; cursor:default beats a
  click that opens an empty drawer.

  Skip drawer-style drill on mobile (`Drawer` is web-only in the
  baseline registry as of 1.0.0); always navigate to a route on
  small viewports.
example_flow: |
  1. The dashboard route's `KPIRow` is bound to a list capability
     (e.g. `github.repo.list`). Each `StatCard` represents a
     filtered slice (e.g. "Repos with > 10 open issues").
  2. The user clicks a `StatCard` — a single click on the card
     itself, not a button inside it.
  3. The skill resolves the slice's filter expression and pushes
     a navigation to the list route with the filter pre-applied
     (`?status=open&open_issues_min=10`). The active time-range
     filter is carried along.
  4. The list route renders with a `Breadcrumb` of Dashboard >
     Repos with > 10 open issues, a `FilterBar` showing the
     pre-applied filter as a removable chip, and the rows.
  5. On a row click: render a `Drawer` if the detail fits, or
     navigate to a `DetailView` route if the detail is rich. The
     drawer/route inherits the list's filter so a "next/prev"
     affordance walks within the filtered set, not the unfiltered
     universe.
  6. The breadcrumb at every level is clickable. Clicking
     Dashboard returns the user to the original dashboard with
     the time range and any other route-level filter intact.
known_failure_modes:
  - Dropping the filter on drill-down. The user clicked a stat
    representing a slice; the destination must respect that
    slice or the click is a lie. Always carry the filter; let
    the user explicitly drop it.
  - Opening a `Drawer` for a click on an aggregate (stat card,
    chart segment). Drawers are for records, not for slices —
    a slice is a list, and a list deserves a route.
  - Forgetting to make the breadcrumb segments clickable. A
    breadcrumb that's text-only is a label, not a navigation —
    the user can't get back without the browser back button,
    which loses the filter state on some browsers.
  - Pushing a deep drill (3+ levels) into the URL as anonymous
    query parameters. Long filter chains belong in named
    saved-views, not in URLs the user has to read. Past depth 2,
    save the filter to the user's intent and use a short token
    in the URL.
  - Re-fetching the parent on every drawer open/close. The
    drawer is a peer view of the same data; the parent's data
    should not refresh until the user explicitly reloads the
    route.
  - Trapping the user inside a `Drawer` with no Escape /
    backdrop-click affordance. The runtime renders both by
    default; if the manifest overrides them, that's a bug.
---

# Drill-down

The wiring rules for "the user clicked a tile or row — what
opens, where, and what comes with them?" Sister to
`dashboard-with-stats` (which puts the tiles on the page),
`filter-faceting` (which seeds the filter state the drill
inherits), and the `Drawer` / `DetailView` / `Breadcrumb`
primitives.

## Why this skill exists

Drill-down is where most dashboard flows leak context. The user
clicks "Open issues = 47" expecting to land on those 47 issues;
they get the unfiltered list with the filter quietly dropped
because the navigation didn't carry it. Or they open a drawer,
inspect five rows, and lose their place because the parent's
scroll position reset on close. This skill encodes the
inheritance and breadcrumb rules a designer applies by reflex.

## Composition rules

- Aggregate clicks (stat, chart segment) open a _list route_ with
  filter pre-applied. Never a drawer.
- Record clicks (list row, table row) open a _drawer_ for shallow
  records or a _DetailView_ route for rich ones. Pick by content
  depth, not by aesthetic.
- The destination always inherits the parent's filter
  (time range + facets + search) by default. The user has to
  explicitly drop it.
- Breadcrumbs are clickable at every segment. The runtime's
  Breadcrumb component honors `href` per segment; the manifest
  must wire all of them, not just the current.
- Drawers are peer views of the parent's data — never re-fetch
  the parent when a drawer opens or closes. Cache invalidation
  follows the underlying capability, not the drawer's lifecycle.
- Past two drill levels, switch from URL-query state to
  saved-view tokens. Long filter chains in the URL are a bug.
