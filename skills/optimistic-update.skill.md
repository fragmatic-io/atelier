---
name: optimistic-update
version: 0.1.0
description: Apply optimistic UI for reversible, low-stakes capabilities via `useOptimisticAction`; revert with a `<Toast>` on failure. Never optimistic for irreversible writes.
capabilities_used:
  - dummyjson.cart.add
  - github.issue.close
when_to_use: |
  A capability is reversible (`reversible: true` in its declaration) AND
  low-stakes (no payment, no public publish, no destructive irreversible
  side-effect). Typical: toggle, archive, mark-read, add-to-cart, close
  issue. The compiler resolves the capability's reversibility flag and
  binds `useOptimisticAction` from `@cir/react`.
when_not_to_use: |
  Irreversible capabilities — payment, publish, send-email, delete-
  permanent, file-upload-to-public-bucket. The user must see the network
  round-trip; never lie about the state of an irreversible side-effect.
  Also skip when the response materially changes the UI (e.g. server
  generates an id the next render needs).
example_flow: |
  1. Confirm the capability declares `reversible: true` AND the rollback
     handle resolves. If either is missing, fall through to a
     pessimistic update with a `<Spinner>`.
  2. Bind the action to `useOptimisticAction` from `@cir/react`. Apply
     the predicted next state immediately on click.
  3. On success — do nothing visible (state already reflects the change).
  4. On failure — revert the optimistic state and show a `<Toast
     variant=error>` explaining what reverted: "Couldn't archive — try
     again." Title ≤ 60 chars, body ≤ 120 chars.
  5. The toast's CTA is "Retry", not "Dismiss".
known_failure_modes:
  - Applying optimistic UI to an irreversible capability — user sees
    "sent" before the email actually leaves.
  - Reverting silently on failure — the user thinks the action stuck.
    Always surface the failure.
  - Optimistic state derived from stale local data when the server
    response would have included a server-side id or timestamp the
    next render needs.
---

# Optimistic update

A micro-skill: speed up the perceived UI when the capability is
reversible and the prediction is safe.

## The rule

Reversible + low-stakes → optimistic via `useOptimisticAction`.
Irreversible → never optimistic. Failure → revert + toast with retry.
