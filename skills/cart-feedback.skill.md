---
name: cart-feedback
version: 0.1.0
description: After a cart write succeeds, surface a Toast, animate the cart badge (motion-permitting), open a mini-cart preview on hover, and hold a 5-second undo window before the action is considered final.
capabilities_used:
  - dummyjson.cart.add
when_to_use: |
  Immediately after any successful `dummyjson.cart.add` call. Every cart
  write must produce visible feedback — silence is the worst affordance
  in a cart flow because the user re-clicks and double-adds. Pair with
  `cart-add` (resolves the product) and this skill (closes the loop).
when_not_to_use: |
  Cart reads (badge updates on initial load are a different concern —
  no animation, no toast). Failed writes — those go through error
  handling, not the success affordances here. Wishlist additions — they
  are not cart writes and must not animate the cart badge.
example_flow: |
  1. On `dummyjson.cart.add` success, render a `<Toast>` with the product
     title, quantity, and an "Undo" button bound to the declared
     rollback (`dummyjson.cart.remove`). Hold for 5000ms.
  2. Increment the cart badge count. If
     `prefers_reduced_motion === false` and the runtime motion
     preference is not 'reduced', play a 200ms scale-pulse on the badge.
     Otherwise update the count silently (still visible, no animation).
  3. On hover of the cart icon for >300ms, expand a mini-cart preview
     `<Drawer>` showing the last 3 line items and a subtotal. Do not
     auto-open on add — that competes with the toast.
  4. If the user clicks Undo within the 5s window, call the rollback
     and dismiss the toast immediately. After 5s, the toast fades and
     the action is considered final (the rollback affordance moves to
     the mini-cart line item).
  5. Emit `audit.action_executed` with the rollback handle so the
     trigger bus can replay the undo if requested.
known_failure_modes:
  - Animating the badge when motion_preference is 'reduced' — violates
    the accessibility contract.
  - Stacking multiple toasts when the user adds 3 items quickly. Coalesce
    into one toast that reports the count and offers undo on the last
    add.
  - Showing the toast but not wiring Undo to the actual rollback — dead
    affordance.
  - Auto-opening the mini-cart on every add; competes with the toast and
    annoys users who add many items in a row.
---

# Cart feedback

The cart write succeeds in ~150ms. The user's confidence in the write
takes longer. This skill encodes the four affordances that close the
loop: toast, badge animation, mini-cart preview, and the undo window.

## Why this skill exists

`cart-add` resolves the product and issues the write. This skill is
about the 5 seconds after the write — the period in which a user
either confirms the system understood them, or reaches for Undo
because it didn't. Splitting the two skills keeps each focused; a
recipe that uses `cart-add` should always also bind `cart-feedback`.

## Composition rules

- The undo window is exactly 5 seconds. Do not extend it; users expect
  finality.
- Motion is gated on the runtime `motion_preference` signal. If the
  signal is missing, default to 'reduced' (no animation).
- The mini-cart preview is a `<Drawer>`, not a `<Modal>` — it must not
  steal focus.
