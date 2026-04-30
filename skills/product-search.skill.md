---
name: product-search
version: 0.1.0
description: Browse the DummyJSON catalog and run keyword searches over it, surfacing the best matches with price, rating, and stock at a glance.
capabilities_used:
  - dummyjson.product.list
  - dummyjson.product.search
when_to_use: |
  When the user is in a discovery mode — they are not yet looking at a
  specific product, but want to scan a category or hunt for a keyword.
  Pair with a search input and a result list; never with a single-row
  detail view.
when_not_to_use: |
  Order history, wishlists, or any flow that requires a logged-in cart.
  Price tracking over time (catalog is read-only and unversioned).
  Comparison against a competitor catalog — out of scope.
example_flow: |
  1. On first render, call `dummyjson.product.list` with `limit=20, skip=0`
     so the user sees a populated grid before typing anything.
  2. When the user types in the search box (debounced ~250ms), call
     `dummyjson.product.search` with `q=<query>` and replace the grid.
  3. If `q` is empty, fall back to the paginated list (do not call
     `product.search` with an empty string).
  4. For each result, render `title`, `price`, `rating`, `stock`. Mark
     `stock < 5` with a low-stock badge and `rating >= 4.5` with a
     highlight badge.
  5. Tapping a result opens the detail route (out of scope for this
     skill; the recipe handles routing).
known_failure_modes:
  - Calling `product.search` with `q=""` instead of falling back to list.
  - Showing stale results when the user clears the query — always reset.
  - Over-fetching during typeahead; debounce the input on the runtime side.
---

# Product search

Browse and search the DummyJSON product catalog. Pure read-only; no
mutation, no confirmation. The compiler should bind this skill whenever
the user is in a "browse" or "find" mood — typically the entry route
of a shopper recipe.

## Why this skill exists

Catalog browsing is the cheapest, most cacheable surface in any
shopping-shaped app. The skill exists to ensure the compiler always
binds the right pair of capabilities (list for empty state,
search for active query) instead of routing every page through the
heavier search endpoint.

## Composition rules

- Initial render uses `product.list` (server can cache aggressively).
- Active query uses `product.search`; never both in the same render.
- The runtime is responsible for debouncing — do not synthesize
  intermediate states inside the manifest.
