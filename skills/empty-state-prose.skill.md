---
name: empty-state-prose
version: 0.1.0
description: Write `<EmptyState>` titles and bodies that name the domain, never read as a system error, and always offer a CTA when one is available.
capabilities_used:
  - github.repo.list
  - dummyjson.product.list
when_to_use: |
  Whenever a list, grid, table, or detail view binds to a data source
  that can legitimately return zero rows — inbox empty, no PRs awaiting
  review, no products in a category, no results for a filter.
when_not_to_use: |
  Failure states (use the `error-prose` skill instead). Loading states
  (use `loading-state-grace`). A list that should never be empty in
  steady state — that's a bug to surface, not an empty-state to dress up.
example_flow: |
  1. Check the data source the empty `<List>` / `<Grid>` / `<Table>` is
     bound to. Name the domain in the title: "no PRs awaiting review",
     not "no items".
  2. Title ≤ 60 chars, sentence case, no terminal period, no exclamation.
  3. Body ≤ 120 chars: one line that either congratulates ("nice work,
     inbox is clear today") OR points at the next action ("connect a
     repo to see PRs here").
  4. If a CTA exists in the surrounding flow, render it as a `<Button>`
     inside the empty state — never leave the user without a forward path.
  5. Use the brand voice surface `empty_state` when the brand kit
     declares one; otherwise fall back to `voice.tone`.
known_failure_modes:
  - Generic "No items" / "Nothing here" prose that could appear in any
    app — fails the brand-aware check.
  - Adding a CTA that points at a route the current user has no scope
    for (e.g. "Create org" for a viewer-only role).
  - Treating zero-results-from-a-filter the same as zero-rows-ever.
    Filtered empty should say "no PRs match these filters" with a "Clear
    filters" affordance, not the steady-state empty body.
---

# Empty-state prose

A micro-skill: every `<EmptyState>` in a generated manifest should read
like a person wrote it for this product, not like the framework's
default placeholder.

## The rule

Title names the domain. Body either celebrates or directs. CTA is
present whenever one exists in the route's action surface. Never the
phrase "no items" or "nothing here".
