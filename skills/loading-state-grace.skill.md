---
name: loading-state-grace
version: 0.1.0
description: Loading-state thresholds — &lt;100ms nothing, 100-500ms `<Spinner>`, &gt;500ms spinner + "Loading…", &gt;2s `<Progress>` + estimate, &gt;10s "taking longer than usual" prose.
capabilities_used:
  - github.repo.list
  - dummyjson.product.list
when_to_use: |
  Any async fetch that gates UI rendering — initial route load, lazy
  list, modal contents, tab body. The thresholds apply uniformly to
  every loading surface.
when_not_to_use: |
  Background fetches that do not gate UI (silent revalidation, prefetch).
  Optimistic updates — those have their own no-spinner discipline (see
  `optimistic-update`).
example_flow: |
  1. Start a timer when the fetch fires. Do NOT render anything for the
     first 100ms — most fetches finish before that and a flashed
     spinner reads as a defect.
  2. 100ms-500ms: render a `<Spinner>` only. No prose.
  3. > 500ms: spinner + "Loading…" text. Use `<Skeleton>` for content
     placeholders if the layout is known (preferred over plain spinner
     for lists, cards, tables).
  4. > 2s: switch to `<Progress>` with an estimate if one is available
     ("Loading… about 5 seconds left"). Estimate from the
     dispatcher's `expected_latency_ms` or from a rolling p50.
  5. > 10s: append prose "This is taking longer than usual." with a
     "Cancel" affordance bound to the abort handle. After 30s, surface
     the `error-prose` retry path.
known_failure_modes:
  - Showing a spinner the instant the request fires — cached and fast
    fetches flash a spinner that reads as broken.
  - Never escalating past the spinner — a 30-second hang shows the
    same UI as a 200ms hang.
  - Estimates that lie (always "5 seconds") — once user trust is gone,
    estimates are worse than no estimate.
  - No cancel affordance on long-running fetches.
---

# Loading-state grace

A micro-skill: time-thresholded loading UI that respects how the human
brain perceives delay.

## The rule

100ms / 500ms / 2s / 10s — different UI at each threshold. Cancel
affordance past 10s. Skeletons preferred over bare spinners.
