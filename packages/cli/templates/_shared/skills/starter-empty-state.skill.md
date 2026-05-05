---
name: starter-empty-state
version: 0.1.0
description: Write `<EmptyState>` titles and bodies that name the domain and offer a CTA when one is available.
capabilities_used:
  - starter.items.list
when_to_use: |
  Whenever a list, grid, table, or detail view binds to a data source
  that can legitimately return zero rows.
when_not_to_use: |
  Failure states (use the `error-prose` skill instead). Loading states
  (use `loading-state-grace`).
example_flow: |
  1. Check the data source the empty `<List>` / `<Grid>` / `<Table>` is
     bound to. Name the domain in the title — never "no items".
  2. Title <= 60 chars, sentence case, no terminal period.
  3. Body <= 120 chars: one line that either congratulates ("nice work,
     inbox is clear today") OR points at the next action.
  4. If a CTA exists in the surrounding flow, render it as a `<Button>`
     inside the empty state.
known_failure_modes:
  - Generic "No items" / "Nothing here" prose that could appear in any app.
  - Adding a CTA that points at a route the current user has no scope for.
---

# Starter empty-state prose

Every `<EmptyState>` in a generated manifest should read like a person
wrote it for this product, not like the framework's default placeholder.

## The rule

Title names the domain. Body either celebrates or directs. CTA is
present whenever one exists in the route's action surface.
