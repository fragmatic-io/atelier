---
name: progressive-disclosure
version: 0.1.0
description: Hide complexity until needed — `<Accordion>` for advanced settings, "Show more" past 7 above-fold rows, inline help that expands on hover.
capabilities_used:
  - dummyjson.product.list
  - github.repo.list
when_to_use: |
  Forms with optional advanced fields, long lists where the first 7
  rows answer the common case, panels with inline help that's useful
  but secondary, configuration surfaces with sane defaults.
when_not_to_use: |
  Crucial information — never hide a destructive-action warning, a
  required field, or a cost/price behind disclosure. Anything the user
  needs to make the primary decision belongs above the fold.
example_flow: |
  1. Count the cardinality of the list / form-fields. If ≥ 8, show the
     first 7 and append a "Show more" affordance (`<Button variant=ghost>`
     or `<Accordion>` row).
  2. For settings forms, group "Advanced" fields under a collapsed
     `<Accordion>`. Defaults must produce a working state with the
     accordion never opened.
  3. For inline help, prefer an expand-on-click `<Tooltip>` or a
     `<Drawer>` for longer content — never bury crucial details inside
     a hover-only tooltip.
  4. Persist the open/closed state across the session for the same user
     so a power user does not re-open the same accordion on every visit.
known_failure_modes:
  - Hiding a required field under "Advanced" — the user submits the
    visible form, gets a validation error pointing at a hidden field.
  - Using a hover tooltip for a payment-flow disclosure or a destructive
    confirm. Touch users never see it; that's a policy violation.
  - A "Show more" affordance that reveals the next 50 rows in one jump
    instead of paginating — defeats the point of the threshold.
---

# Progressive disclosure

A micro-skill: choose what's visible by default. The threshold is 7
above-fold rows / fields; past that, hide behind an explicit affordance.

## The rule

Crucial info is never disclosure-gated. Hover is never the only way to
reach disclosure on touch surfaces. Defaults work without ever
expanding anything.
