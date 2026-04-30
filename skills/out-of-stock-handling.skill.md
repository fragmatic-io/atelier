---
name: out-of-stock-handling
version: 0.1.0
description: Render out-of-stock items as dim-but-visible by default, switch to filter-out only when the user's intent is purchase-now, surface a notify-me affordance and substitution suggestions, and never silently disable add-to-cart.
capabilities_used:
  - dummyjson.product.list
  - dummyjson.product.search
when_to_use: |
  Whenever a product list or detail view may include items where
  `stock <= 0` or where a SKU is otherwise unavailable. The skill
  applies to catalog browsing, search results, and recommendation
  tiles. Pair with `product-search` and `product-grid-density`.
when_not_to_use: |
  Wishlist views, where "saved for later" semantics already imply the
  item may be unavailable — those have their own affordance set.
  Backorder-allowed catalogs (out of scope for v0.1; the rules below
  assume hard-out-of-stock means cannot purchase now).
example_flow: |
  1. For each product, classify as `in_stock` (`stock > 0`) or
     `out_of_stock` (`stock <= 0`). Treat `null`/`undefined` as
     `unknown` and render in_stock optimistically.
  2. Default presentation is dim-but-show: render the card at 60%
     opacity, retain the image and price, replace the Add-to-Cart
     button with a "Notify me when back" affordance + an explicit
     `<EmptyState>`-style label "Out of stock". The button must be
     visibly disabled with the reason — never a silent dead button.
  3. If the recipe's user intent is `purchase_now` (e.g. the user
     just searched for a specific keyword and tapped a buy CTA),
     filter out_of_stock items from the result set entirely and show
     a small footer: "3 out-of-stock results hidden — show all".
  4. On the detail view of an out-of-stock item, show up to 3
     substitution suggestions ranked by category match + rating.
     Disclose the basis: "Similar in-stock items in {category}".
  5. The Notify-me affordance writes to a notification queue (capability
     deferred to v0.2). For now, render the affordance and emit
     `audit.notify_requested` so the eval harness can verify the
     intent flowed through.
known_failure_modes:
  - Disabling the Add-to-Cart button without a reason — user clicks,
    nothing happens, frustration. Always show "Out of stock" + the
    Notify-me alternative.
  - Filtering out_of_stock items by default in browse mode — hides
    inventory the user wanted to see and may be acceptable for them
    to wait on. Filter only when intent is purchase-now.
  - Substituting cross-category (a phone substituted with a charger)
    because the recommender ran on price alone. Always require
    category match for substitutes.
  - Showing the Notify-me affordance for items that have been out of
    stock for >90 days (catalog churn — likely discontinued). Skip the
    affordance for those; show only substitutes.
---

# Out of stock handling

Out-of-stock UX is intent-dependent: the same item should be visible
to a browsing user and hidden from a purchase-now user. This skill
encodes that fork, plus the two affordances (notify-me, substitute)
that turn a dead end into an option.

## Why this skill exists

The default agent move on out-of-stock is to either hide the item or
disable the button silently. Both are wrong. Hiding loses signal for
browsers; silent disabling kills trust for buyers. The intent fork
above costs one bit of state and resolves both failures.

## Composition rules

- Never silently disable Add-to-Cart. Always pair the disabled state
  with an explicit `<EmptyState>`-style label and a Notify-me CTA.
- Filter-out is a purchase-intent affordance only. Browse mode keeps
  out-of-stock items dim-but-visible.
- Substitution suggestions require category match. Cross-category
  substitutes are spam.
