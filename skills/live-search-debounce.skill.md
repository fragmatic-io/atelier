---
name: live-search-debounce
version: 0.1.0
description: Debounce `<Search>` input ≥250ms, show a `<Spinner>` after 200ms inflight, cancel the previous query on each keystroke, and keep stale results visible during refetch.
capabilities_used:
  - dummyjson.product.search
  - github.repo.list
when_to_use: |
  Any `<Search>` or `<TextInput>` bound to a typeahead / live-search
  capability. Catalogs, repo filters, mention pickers, command
  palettes — anywhere keystrokes drive a fetch.
when_not_to_use: |
  Pure local filtering of an already-loaded list — no debounce needed,
  apply on every keystroke. Forms with submit buttons (the search runs
  on submit, not on input).
example_flow: |
  1. Wrap the input handler with a debounce of ≥ 250ms. Tune up to 400ms
     if the backend is slow; never below 250ms.
  2. On each new keystroke, abort the in-flight request (AbortController
     or framework equivalent) before issuing the next.
  3. After 200ms of inflight time, render an inline `<Spinner size=sm>`
     adjacent to the input — never replace the results area with a
     spinner.
  4. Keep the previous result set visible during refetch. Crossfade or
     fade-in newly arrived results; do not blank-then-replace (that
     reads as a layout flash).
  5. On empty query, do not call the search capability — fall back to
     the list capability (or an empty-state per `empty-state-prose`).
known_failure_modes:
  - No debounce → one network request per keystroke, rate-limit cliff.
  - Blanking the result area on every keystroke → looks broken even
    when the network is fast.
  - Forgetting to cancel previous requests → out-of-order responses
    overwrite a newer query's results.
  - Calling the search capability with an empty string instead of
    falling back to list.
---

# Live-search debounce

A micro-skill: make typeahead feel fast, cheap, and stable.

## The rule

Debounce 250ms+. Spinner at 200ms inflight. Cancel previous on each
keystroke. Keep results visible during refetch.
