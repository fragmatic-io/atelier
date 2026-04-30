---
name: inline-validation
version: 0.1.0
description: Choose the right validation cadence per field — per-keystroke for cheap local checks, on-blur with debounce for server-checked uniqueness, on-submit for cross-field constraints — and never display an error before the field has been blurred at least once.
capabilities_used:
  - dummyjson.cart.add
when_to_use: |
  Any time a `<Form>` has at least one field with a validation rule
  beyond "required". Pair with `<TextInput>`, `<NumberInput>`,
  `<Select>`, and the form runtime's per-field state machine.
when_not_to_use: |
  Read-only display. Search inputs (validation is for the search
  results, not the query box). One-shot OTP/PIN entries — those have
  their own per-character semantics governed by the auth flow.
  Recipes that explicitly opt into "validate on submit only" for
  legal-form reasons (consent capture).
example_flow: |
  1. Classify every field's rules into one of three buckets at
     compile time:
     - `cheap_local`: regex, length, range, enum membership. These
       are pure functions of the current value.
     - `server_checked`: uniqueness, "is-this-username-taken",
       coupon validity, address verification.
     - `cross_field`: "password matches confirm-password",
       "end_date >= start_date", "at least one of email or phone".
  2. Wire the cadence per bucket:
     - `cheap_local` → validate on every keystroke. Cheap to run,
       cheap to display.
     - `server_checked` → validate on blur, debounce 400ms (so
       arrow-keying through fields does not fan out a request per
       hop). Show a `<Spinner>` inline while the request is in
       flight; never block the rest of the form.
     - `cross_field` → validate on submit. Per-keystroke
     cross-field validation produces flapping errors as the user
     fills the second of the two fields.
  3. Display rule (applies to ALL three buckets): a field MUST
     have been blurred at least once before its error message is
     allowed to render. The dirty flag is per-field — typing in
     field A does not unlock errors on field B.
  4. On a successful submit, clear all error and "checking…" states.
     On a validation failure on submit, focus the first invalid
     field and surface a top-of-form `<Alert>` summarising the
     count ("3 fields need attention").
  5. For server-checked fields, cache the result by value for the
     life of the form mount — re-typing the same username does not
     re-fetch.
known_failure_modes:
  - Showing "required" errors on every empty field the moment the
    form mounts. Users have not even tried yet — the errors look
    like the form is shouting at them.
  - Per-keystroke server validation that fires a request on every
    character. Always debounce server checks on blur.
  - Showing a cross-field error ("passwords do not match") before
    the second field has been blurred — flaps as the user types.
  - Treating a 422 server response as a transient error and
    auto-retrying. Validation failures are user errors; do not
    retry, do not loop a spinner.
  - Clearing error state on a successful keystroke without
    re-running the validator. The error must clear from the
    validator output, not from the focus event.
---

# Inline validation

Validation cadence is a UX decision dressed up as a code one. The
default agent move — "validate everything on every keystroke" — burns
server bandwidth and produces a form that lights up red the moment a
user lands on it. This skill encodes the per-bucket cadence and the
"never before first blur" display rule.

## Why this skill exists

The compiler will otherwise pick a single cadence per form
(usually "validate on submit") because a single cadence is simpler
to express in a manifest. The result is forms that succeed on the
happy path but produce a wall of errors on submit when the user
typed one wrong character on the second field. The three-bucket
classification + per-bucket cadence gives feedback at the right
time without flapping.

## Composition rules

- Classify rules into `cheap_local | server_checked | cross_field`
  at compile time — the manifest carries the bucket, the runtime
  carries the cadence.
- Server checks always debounce (400ms minimum) and always cache
  by value for the life of the mount.
- A field's error message renders only after the field has been
  blurred at least once. This is a hard rule, not a heuristic.
- On submit failure, focus the first invalid field; surface an
  `<Alert>` with the count.
