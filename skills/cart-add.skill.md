---
name: cart-add
version: 0.1.0
description: Find a product by keyword and add a chosen quantity to the user's DummyJSON cart, with confirmation and a one-tap remove rollback.
capabilities_used:
  - dummyjson.product.search
  - dummyjson.cart.add
when_to_use: |
  When the user says "add X to cart" or interacts with an "Add" affordance
  on a product card. The skill resolves a keyword to a specific product,
  then issues the cart write with explicit confirmation.
when_not_to_use: |
  Bulk imports from a saved list (no batch endpoint exists in v0.1).
  Subscriptions or recurring orders — the cart is single-shot.
  Wishlist additions — those are not cart writes.
example_flow: |
  1. Call `dummyjson.product.search` with the user's phrase as `q`.
  2. If exactly one product matches with high confidence
     (`q` matches `title` substring case-insensitive, top result),
     present a confirm card with the matched product, requested quantity,
     and total price.
  3. If multiple products match, fall through to the product-search skill's
     result grid; do not auto-pick.
  4. On confirm, call `dummyjson.cart.add` (the capability declares
     `confirmation: inline` and `reversible: true` with rollback
     `dummyjson.cart.remove`).
  5. After success, show a Toast with an "Undo" affordance bound to the
     declared rollback for at least 5 seconds.
known_failure_modes:
  - Resolving an ambiguous phrase ("phone") to the top search hit and
    silently adding the wrong product. Always require disambiguation
    when the top two results are within 0.1 search-score of each other.
  - Adding zero or negative quantities (validate `quantity >= 1` before
    the capability call).
  - Forgetting to surface the rollback — every cart write must show Undo.
---

# Cart add

A two-step skill: resolve a keyword to a product, then add to cart with
confirmation. The mutation always goes through `dummyjson.cart.add`
which declares `confirmation: inline` — the runtime enforces it; the
skill must compose around it, not bypass it.

## Why this skill exists

The cart-add path is the canonical "user said something destructive,
prove you know what they meant before doing it" example in the demo.
The skill exists to keep the disambiguation step explicit instead of
hiding it inside the compiler prompt.

## Composition rules

- Always call `product.search` first; never call `cart.add` from a free
  text phrase without first resolving it to an `id`.
- Surface the `rollback` affordance every time. The capability is
  reversible only because the rollback is wired up — if the recipe
  drops the Undo button, the policy engine should reject the manifest.
