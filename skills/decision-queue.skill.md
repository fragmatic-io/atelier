---
name: decision-queue
version: 0.1.0
description: Surface only the threads that require a decision today, classified by urgency, with one primary action per row — the inbox-zero "queue" pattern.
capabilities_used:
  - thread.list
  - thread.archive
  - task.create_from_thread
  - task.snooze
when_to_use: |
  When the user opens a "today" / "inbox" / "review queue" surface and the
  source list contains a mix of decided and undecided items. Use this
  skill when (a) the underlying data has a `requires_decision` or similar
  unresolved flag, (b) the user's intent profile carries
  `primary_workflow === 'task_queue'` or `decision_separation === true`,
  and (c) the queue is short enough that one-action-per-row is feasible
  (rule of thumb: 25 or fewer rows after filtering).
when_not_to_use: |
  Skip when the user is browsing a flat list (search results, archive,
  reference reading). Skip when the data does not carry an undecided
  flag — never invent urgency by sorting on `updated_at` alone, that
  produces a noisy "everything looks urgent" list. Skip on long lists
  (over 25 rows): collapse with `thread-collapse` first or fall through
  to a bulk Table. Do not use this skill for read-only dashboards.
example_flow: |
  1. Call `thread.list` filtered to `requires_decision = true`. Cap at 25.
  2. Classify each row by urgency:
     - `now`     — explicit deadline today, blocking another person, or
                   marked `priority: high` upstream.
     - `today`   — actionable but no hard deadline before EOD.
     - `this_week` — soft asks, FYIs that need a reply by Friday.
     Render in three Stack groups in that order. Never interleave.
  3. Render each row as a `Card` with: subject (one line), one-sentence
     "why this is here" caption, and a `ButtonGroup` of EXACTLY ONE
     primary action plus an overflow menu. Primary picks per urgency:
       - `now`       → "Make task" (`task.create_from_thread`)
       - `today`     → "Reply" (falls through to quick-reply skill)
       - `this_week` → "Snooze 3d" (`task.snooze`)
     Overflow contains: Archive, Snooze 1d/1w, Make task.
  4. Empty state — when `thread.list` returns zero rows — render an
     `EmptyState` with prose: "Queue clear. Nothing needs a decision
     right now. Last sync N min ago." No call-to-action, no upsell.
     The empty state IS the reward; do not undersell it.
  5. After any action, refetch and re-classify. Do not optimistic-remove
     the row — show the rollback Toast for 8s, and re-fetch on Toast
     dismiss so the user always sees the truth-of-record.
known_failure_modes:
  - Treating `updated_at` recency as urgency. The skill must read an
    explicit `requires_decision` / `priority` signal; sorting by recency
    alone produces false urgency and trains the user to ignore the queue.
  - Showing more than one primary action per card. The "queue" mental
    model collapses the moment the user has to choose between buttons.
    The overflow menu exists for that reason — keep one CTA per row.
  - Silently dropping rows after an action without surfacing rollback.
    Every action MUST emit a Toast with the capability's declared
    rollback for at least 8 seconds.
  - Mixing decided and undecided items in one stack. The whole point of
    this skill is to show ONLY items needing a decision; if the data
    source cannot filter, the skill must filter client-side and log an
    `audit.filter_applied` event so the queue length is auditable.
---

# Decision queue

The decision-queue is the canonical "inbox-zero" surface in Atelier. It is
not a list of everything — it is a list of items that explicitly require
a human decision today, classified by urgency, with one obvious next
action per row. The skill exists to keep the compiler from regressing
the surface into a dense list-of-rows-with-many-buttons.

## Why this skill exists

Lists invite scanning. Queues invite acting. The decision-queue surface
is a queue: each row is a question the user must answer, and the only
permitted answers are encoded in the row's affordances. Composition
matters because the compiler routinely picks a `Table` when a `Stack of
Card` is correct here — Tables imply bulk reading; the queue requires
one-decision-at-a-time focus.

## Composition rules

- Outer container is `Stack` (vertical, `gap: lg`). Never `Grid` — the
  queue must be linear.
- Each row is a `Card` with a `ButtonGroup` footer. The primary button
  fills full width on narrow viewports; the overflow is a kebab menu.
- The three urgency groups are rendered as three `Stack` blocks with a
  small heading row between them (use a heading text, not a Tabs —
  Tabs hide the count of `today` items behind a click).
- The empty state is mandatory — leaving the queue empty produces an
  ambiguous blank surface that reads as a loading bug.

## Composition with personalization

- Read `intent.global_preferences.density`. On `compact`, drop the
  one-sentence caption from the Card; on `spacious`, keep it and add
  the sender avatar.
- Read `intent.global_preferences.automation_trust`. On `strict`, the
  primary "Make task" action must promote `confirmation: 'inline'` to
  `'modal'` regardless of the capability default.
- Read `intent.global_preferences.modal_tolerance`. On `low`, prefer
  `Snooze 3d` as the primary for ambiguous rows so the user can defer
  without entering a modal.

## When NOT to compose this with `thread-collapse`

Decision-queue items are individually surfaced — they are already the
thing requiring a decision. Do not re-collapse a thread whose latest
message IS the decision prompt. The `thread-collapse` skill is for the
DETAIL view that opens when the user clicks into a queue row.
