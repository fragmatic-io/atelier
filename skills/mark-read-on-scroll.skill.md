---
name: mark-read-on-scroll
version: 0.1.0
description: Auto-mark messages as read after the user dwells more than 2 seconds — gated on automation_trust and overridable per-user via an "always confirm" setting.
capabilities_used:
  - thread.list
  - thread.get
when_to_use: |
  In any list-of-messages or list-of-threads surface where the user
  scrolls vertically and the runtime can observe per-row dwell time.
  Use when (a) `intent.global_preferences.automation_trust` is one of
  `'cautious'` or `'permissive'`, AND (b) the user has not enabled the
  per-app "Always confirm read" setting. The skill encodes the dwell
  threshold (2 seconds) and the "viewport center" rule that decides
  when a row is considered "dwelt on".
when_not_to_use: |
  Skip entirely when `automation_trust === 'strict'`. In strict mode
  the user has explicitly said "do not write state for me"; auto-mark-
  read is a write to the read flag, even if it feels passive. Fall
  through to an explicit Mark-as-read button in those cases. Skip in
  search results (`thread.search` etc.) — the user is sampling, not
  reading. Skip on horizontally-scrolling carousels (Gallery) — the
  dwell signal is too noisy.
example_flow: |
  1. On surface mount, read `intent.global_preferences.automation_trust`.
     If `strict`, register a no-op handler and return; render an
     explicit "Mark read" button on each row instead.
  2. On surface mount, read the per-app `always_confirm_read` setting.
     If true, same fallback as above.
  3. Otherwise, attach a viewport observer to each rendered row. Track:
       - `entered_viewport_at` — when the row's vertical center is within
         the viewport's middle 60%.
       - `left_viewport_at` — when it leaves that band.
     Compute dwell as `left - entered`. If dwell > 2000ms AND the row's
     `read_state` is currently `unread`, fire a debounced batch update.
  4. Debounce: collect dwell-fired ids in a 500ms window, then call
     `thread.list` with `read: false → true` semantics (the data layer
     handles the batched write). Never fire a per-row capability call
     from the scroll handler.
  5. Visible affordance: the row's "unread" dot fades to "read" only
     after the batched write succeeds — never optimistically. This keeps
     the visible state truth-of-record so an offline user does not see
     phantom reads.
  6. Settings surface: every app using this skill must expose a
     `Settings → Reading → "Always confirm read"` Toggle. The skill is
     OFF whenever that toggle is on, regardless of `automation_trust`.
known_failure_modes:
  - Treating any time-in-viewport as dwell. A 100ms scroll-past must
    NOT count. The 2-second threshold and the "middle 60%" band exist
    to filter scroll-past noise; do not relax them to "feel snappier."
  - Marking read on `automation_trust === 'strict'` because the dev
    forgot to gate the observer. The gate is the most important
    invariant of this skill — fail-closed if the preference is unset.
  - Marking read while the row is scrolled but not visually focused
    (e.g. the user is dragging a scrollbar past it at speed). The
    "middle 60%" rule plus the 2-second dwell prevents this; do not
    use a simpler "on entry" heuristic.
  - Firing one capability call per row instead of a batched update.
    A 50-row scroll can otherwise produce 50 writes; debounce to a
    single batched call.
  - Forgetting the per-app "Always confirm read" Toggle. Without it
    the user has no escape hatch other than changing global
    `automation_trust`, which is too coarse a setting.
---

# Mark read on scroll

A small, dedicated skill for one specific interaction: deciding when a
scrolled row is "read." It exists separately from `inbox-zero` because
the rules are testable in isolation and several non-inbox surfaces
(notification center, comments feed, mentions list) want the same
behavior.

## Why this skill exists

The compiler routinely either over-applies (auto-read on first paint)
or under-applies (require explicit click) this interaction. The 2s
dwell + middle-60% viewport rule is the well-trodden middle path that
matches user expectation in mature mail clients. Encoding it once here
keeps every surface consistent.

## Composition rules

- Always paired with a per-app "Always confirm read" Toggle. The skill
  must not ship to a surface whose Settings page does not expose the
  toggle — the policy engine should reject the manifest.
- Never fires a per-row write. The 500ms debounce and batched update
  are required; a per-row write storm makes the network tab unreadable
  and burns capability rate-limits.
- The visible "read" state lags the optimistic dwell signal until the
  capability write returns. Optimistic UI here is a bug, not a feature.

## Pairings

- `inbox-zero` declares this skill as the auto-read mechanism.
- `decision-queue` does NOT use this skill — queue rows are decided
  per-row, not via dwell.
