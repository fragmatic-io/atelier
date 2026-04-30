---
name: product-grid-density
version: 0.1.0
description: Choose between Card, Tile, and List density for a product grid based on viewport, cardinality, and image aspect ratio, and stage skeleton loading until thumbnails resolve.
capabilities_used:
  - dummyjson.product.list
  - dummyjson.product.search
when_to_use: |
  Whenever a recipe is rendering more than one product at once — landing
  pages, category routes, search result lists, "you may also like"
  surfaces. Pair with `product-search` for the data layer; this skill
  governs the visual density only.
when_not_to_use: |
  Single-product detail views (use the detail layout instead). Editorial
  pages with curated typography (the density rules below assume an
  algorithmic grid, not a hand-laid spread). Cart line items — those
  use the cart UI conventions, not catalog density.
example_flow: |
  1. Resolve cardinality from the capability response (`total` from
     `dummyjson.product.list` or the result count from
     `dummyjson.product.search`).
  2. Pick density:
     - `n <= 12`: render `<Grid>` of `<Card>` (2 cols on viewport < 640px,
       3 on 640–1024px, 4 on >=1024px). Image aspect 1:1.
     - `13 <= n <= 60`: render `<Grid>` of `<Card>` with infinite scroll;
       same column rules. Aspect 1:1.
     - `n > 60`: force a `<FilterBar>` first (faceted search) and switch
       to `<List>` rows below it; aspect 4:3 thumbnails inline. Do not
       attempt to render >60 cards — the user is over-faceted.
  3. While the capability is in flight, render `<Skeleton>` placeholders
     matching the chosen density (same column count, same aspect).
  4. On viewport resize, recompute columns at the breakpoints above; do
     not animate the transition (jank) — just re-flow.
  5. If the data layer returns mixed aspect ratios, normalize via CSS
     object-fit `cover`, never letterbox.
known_failure_modes:
  - Picking density once and never re-evaluating after a filter shrinks
    the result set from 200 to 8 (should drop back to plain grid).
  - Rendering a `<Card>` grid for >60 products and burning the whole
    viewport on thumbnails the user cannot scan.
  - Forgetting to render `<Skeleton>` and showing a flash of empty grid
    while the catalog request is pending.
  - Letterboxing a 16:9 lifestyle thumbnail inside a 1:1 card slot.
---

# Product grid density

The data layer is the same for every product list — what changes is how
many items the user can usefully scan and on what device. This skill
encodes the density decision so the compiler does not waste tokens
re-deriving it from the recipe each render.

## Why this skill exists

A product grid is the cheapest decision in the catalog UX, and the most
commonly fumbled. The default heuristic — "cards everywhere" — burns
viewport on tail items and forces a faceted search the user did not
ask for. The cardinality rules above are calibrated against the
DummyJSON catalog (~200 products) and the `<Card>`, `<List>`,
`<FilterBar>`, and `<Skeleton>` components in the registry.

## Composition rules

- Density is a function of cardinality and viewport, never a fixed
  manifest field. Re-derive on every render.
- Pair with `product-search` for query-driven result sets. This skill
  does not own the search input; it owns the result surface.
- Use `<Skeleton>` only at the same density as the resolved grid. A
  `<Card>` skeleton followed by a `<List>` resolved view is layout
  thrash.
