---
name: checkout-progressive
version: 0.1.0
description: Decide between single-page and multi-step checkout based on cart size and form complexity, render a Stepper for multi-step flows, persist the order summary on the right rail, and apply per-step confirmation policy.
capabilities_used:
  - dummyjson.cart.add
when_to_use: |
  When the user has tapped "Checkout" from a cart with at least one
  item. The skill governs the layout decision (single vs multi-step),
  the progress indicator, and the per-step confirmation requirements.
  Pair with downstream payment capabilities once they ship.
when_not_to_use: |
  Empty carts (route to the cart empty-state instead). Subscription
  renewals — those have their own confirmation policy and do not
  branch on cart size. Guest receipt views post-purchase — read-only,
  no stepper.
example_flow: |
  1. Inspect the cart. If `total_products <= 3` and the user has a
     saved address and saved payment, render single-page checkout: one
     `<Form>` with shipping, payment, and review collapsed sections,
     `confirmation: 'inline'` on the final Place Order button.
  2. Otherwise render multi-step: `<Stepper>` with 4 steps —
     Shipping, Payment, Review, Confirm. Right rail holds a sticky
     `<Card>` order summary that updates as the user progresses.
  3. Per-step confirmation policy (mirrors CapabilitySchema's
     `confirmation` enum):
     - Shipping: `confirmation: 'inline'` (Next button enables on
       valid form).
     - Payment: `confirmation: 'inline'` (Next button + tokenization).
     - Review: `confirmation: 'modal'` (open a `<ConfirmDialog>`
       summarizing total, address, and payment last-4 before issuing
       the charge).
     - Confirm (post-charge): no confirmation; receipt is read-only.
  4. The Stepper is bidirectional. Going back is always allowed — the
     state of completed steps is preserved. Never gate back-navigation
     behind a confirmation; that is a dark pattern.
  5. For carts with restricted items (age-gated, regulated), upgrade
     the Review step to `confirmation: 'verbal_required'` and capture
     a consent line in the audit log.
known_failure_modes:
  - Forcing multi-step for a 1-item cart with saved details — adds
    friction with no payoff.
  - Hiding the order total until the final step. Anti-pattern; total
    must be visible in the right rail from step 1.
  - Disabling back-navigation after Payment to "protect" the user from
    losing card data. Persist the tokenized state instead.
  - Skipping the modal on Review for high-cart-value flows. Modal is
    cheap; chargebacks are not.
---

# Checkout progressive

Checkout is the single most-tested flow in any commerce app. This
skill encodes the layout fork (single vs multi-step) and the per-step
confirmation policy so the compiler does not re-derive both from
scratch on every checkout binding.

## Why this skill exists

The default agent move on "render checkout" is a five-step wizard for
every user. That works for new buyers and burns returning ones. The
cart-size + saved-details heuristic above gives the recipe a clean
fork without needing per-customer A/B branching.

## Composition rules

- The order summary is always visible. Right rail on desktop, sticky
  bottom drawer on mobile.
- Going back is always allowed and never re-opens a confirmation.
- Confirmation strings come from `CapabilitySchema.confirmation` —
  `'inline' | 'modal' | 'verbal_required'`. Do not invent new values.
