---
name: recommendation-tile
version: 0.1.0
description: Render product recommendation surfaces with at most 4 items per row and 2 rows per page, never repeat the same algorithm twice on a page, disclose the basis ("Because you viewed X"), and gate display on a confidence threshold.
capabilities_used:
  - dummyjson.product.list
  - dummyjson.product.search
when_to_use: |
  Detail-page "you may also like" surfaces, cart "frequently bought
  together" rails, post-add suggestion strips, and category-page
  curation rails. Pair with `product-grid-density` for the visual
  density; this skill governs the recommendation-specific rules.
when_not_to_use: |
  Search result pages — those are query-driven, not recommendation-
  driven, and follow `product-search` rules. Editorial curated
  collections — those are hand-picked and do not need disclosure of
  algorithm. The skill assumes an algorithmic recommender output.
example_flow: |
  1. For each recommendation surface on the page, name the algorithm
     that produced it (e.g. `also_viewed`, `also_bought`,
     `category_top_rated`, `personalized_for_user`). The compiler
     binds at most one surface per algorithm per page — never two
     "Because you viewed X" rails stacked on top of each other.
  2. Cap the visible items at 4 per row and 2 rows = 8 items max per
     surface. If the recommender returns more, clip and hide the
     overflow behind a "See all" link.
  3. Apply a confidence threshold of `score >= 0.4` (recommender-
     normalized 0..1). Items below threshold are dropped silently. If
     fewer than 3 items remain after thresholding, do not render the
     surface at all — no skeleton, no empty state. An empty rec rail
     is worse than no rail.
  4. Disclose the basis above the rail in a muted text token:
     "Because you viewed {anchor.title}" for `also_viewed`,
     "Customers also bought" for `also_bought`,
     "Top in {category}" for `category_top_rated`. Never display
     "Recommended for you" without a more specific basis — too vague
     to be trusted.
  5. Each tile uses the same `<Card>` component as the product grid;
     do not invent a recommendation-specific card variant. Consistency
     across surfaces beats novelty.
known_failure_modes:
  - Rendering two algorithms with the same output — typically `also_viewed`
    and `also_bought` overlap heavily. Pick one per page; never both
    visible simultaneously.
  - Rendering 12-item rec rails that scroll horizontally forever. Cap
    at 8.
  - Showing rec rails with one or two items because the threshold
    filtered out the rest. Hide the surface entirely; do not pad with
    low-confidence items.
  - Generic phrasing like Recommended-for-you without disclosure of
    the basis — users distrust opaque recommenders. Always cite the
    anchor.
---

# Recommendation tile

A page can carry many recommendation surfaces, but each one costs
attention and trust. This skill encodes the four constraints —
cardinality, algorithm uniqueness, disclosure, and confidence — that
keep recommendation rails an asset instead of a noise floor.

## Why this skill exists

The default agent move on "render recommendations" is to stack every
algorithm the recommender exposes. That floods the page and trains
users to scroll past the rails entirely. The four rules above keep
each surface load-bearing.

## Composition rules

- One algorithm per surface, one surface per algorithm per page.
- Confidence threshold is non-negotiable. Drop the surface before
  showing low-confidence padding.
- Disclosure ("Because you viewed X") is mandatory. Generic
  "Recommended for you" is rejected by the policy engine.
- Visual density follows `product-grid-density`. This skill does not
  re-derive grid columns.
