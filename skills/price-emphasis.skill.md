---
name: price-emphasis
version: 0.1.0
description: Display product prices with strikethrough-original-then-current for sales, locale-aware currency formatting, decimal alignment in lists, and StatCard treatment only for headline totals — never hide shipping cost until late.
capabilities_used:
  - dummyjson.product.list
  - dummyjson.product.search
when_to_use: |
  Every surface that renders a price: product cards, detail views,
  cart line items, order summary, recommendation tiles. The skill is
  cheap to bind and prevents the locale and sales-pricing footguns
  from leaking into recipes.
when_not_to_use: |
  Non-monetary numeric values (ratings, stock counts, review counts —
  those use plain numeric formatting). Wholesale-only pricing surfaces
  with negotiated tiers — out of scope; those need a custom skill.
example_flow: |
  1. For each product, derive the displayed price from
     `price * (1 - discountPercentage/100)` if the catalog provides a
     discount field; otherwise use `price` directly.
  2. If discount > 0, render the original `price` with strikethrough
     to the left of the current price, in a muted color token. Order
     is original-then-current — never current-then-original (reads as
     a price hike).
  3. Format with the user's locale: `Intl.NumberFormat(locale, {
     style: 'currency', currency })`. Never hard-code `$` or `.` as
     decimal separator.
  4. In `<List>` and `<Table>` views, right-align prices and align on
     the decimal point so 9.99 and 100.00 stack visually.
  5. Use `<StatCard>` only for headline aggregates — cart subtotal,
     order total, "you saved $X". Never for a per-line-item price;
     that's `<Card>` body text.
  6. Surface shipping cost (or "free shipping") on the product detail
     page, the cart page, AND step 1 of checkout. NEVER defer the
     shipping cost reveal to step 4 — that is a documented dark
     pattern and breaks user trust.
known_failure_modes:
  - Showing current-then-original (looks like a markup). Must be
    original-then-current.
  - Hard-coding `$` so a EUR catalog renders as `$12.99`.
  - Centering prices in a list — reads as ransom-note typography.
  - Hiding shipping until the final checkout step. Even if the cost
    is computed late, surface "shipping calculated at next step" on
    every prior step instead of a silent gap.
  - Rendering `<StatCard>` per product card — visual noise, defeats
    the StatCard's "this is the headline number" semantic.
---

# Price emphasis

Price is the single piece of UI that every user reads and every
locale formats differently. This skill bundles the four rules a
recipe must apply every time it renders a price, so the compiler
does not re-derive them from a stale prompt fragment.

## Why this skill exists

Currency, decimal, and sales-price rendering are the kind of detail
agents fumble routinely — a wrong currency symbol or a transposed
decimal turns into a chargeback. Pinning the rules here means the
compiler binds one skill instead of repeating the logic across
catalog, cart, and checkout surfaces.

## Composition rules

- Always use `Intl.NumberFormat` for the currency symbol and decimal.
- Strikethrough goes on the ORIGINAL price, never the current.
- Shipping cost is visible from the cart onward. Never deferred to
  the final checkout step.
- `<StatCard>` is for headline totals only.
