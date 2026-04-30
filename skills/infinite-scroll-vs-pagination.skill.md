---
name: infinite-scroll-vs-pagination
version: 0.1.0
description: Infinite scroll for chronological feeds (inbox, activity); `<Pagination>` for catalogs where users want to revisit a specific position. Always anchor on back-nav.
capabilities_used:
  - github.repo.list
  - dummyjson.product.list
when_to_use: |
  Any list / grid / table backed by a paginated capability. The choice
  between infinite scroll and `<Pagination>` is the decision this skill
  encodes. Apply on first manifest compile; persist via the recipe.
when_not_to_use: |
  Lists with fewer than two pages — render all rows, no controls. Lists
  whose ordering changes on every fetch (server-side ranked search) —
  use a "Load more" button instead, neither infinite nor paginated.
example_flow: |
  1. Classify the list. Chronological feed (inbox, audit log, activity,
     timeline)? → infinite scroll. Catalog or directory where users want
     to bookmark / share / return-to a row? → `<Pagination>`.
  2. Page size: 20 for grids of cards, 50 for `<Table>` rows, 30 for
     plain `<List>`. Page-size rule of thumb: target one viewport's
     worth of content above-fold + one buffer below.
  3. Both modes anchor on back-nav. Store the last-seen item id (infinite)
     or page number (`<Pagination>`) in the URL or session. On return,
     restore the scroll position to that anchor.
  4. Infinite: render a sentinel `<Spinner>` 200px before the bottom; on
     intersection, fetch the next page and append. Stop when the API
     returns < page-size rows.
  5. `<Pagination>`: surface page numbers, prev/next, and total-count
     when known. Disable boundary buttons; never wrap.
known_failure_modes:
  - Infinite scroll on a catalog → users can't share a deep-link to row
    #500.
  - Using `<Pagination>` on an inbox → forces the user to manage page
    state just to read newer items.
  - Forgetting to anchor on back-nav → user clicks into a detail, hits
    back, and lands on page 1 / row 1.
  - Infinite scroll without a footer → footer content (legal, links)
    becomes unreachable.
---

# Infinite scroll vs pagination

A micro-skill: pick the right paging model for the list's purpose.

## The rule

Chronological → infinite. Catalog → `<Pagination>`. Both anchor on
back-nav. Page size depends on row density.
