---
name: inbox-zero
version: 0.1.0
description: Workflow rules for an inbox surface that aims at zero — mark-read-on-scroll gating, swipe-archive, bulk-archive empty paths, and the "you're caught up" celebration prose.
capabilities_used:
  - thread.list
  - thread.archive
  - thread.get
when_to_use: |
  When the user opens an inbox-style surface (mail, message threads,
  notification center) and the goal is to drain it to empty in one
  pass. Use when the user's intent profile has `primary_workflow`
  containing the word "inbox", or when the surface is named "Inbox" /
  "Today" / "Catch up". This skill governs the WORKFLOW (read state,
  archive flow, bulk path, empty celebration); pair it with
  `decision-queue` for the rendering of undecided rows, and with
  `mark-read-on-scroll` for the dwell-based read-state details.
when_not_to_use: |
  Reference inboxes (search a year of mail, build a digest). Anything
  where the user is intentionally NOT trying to reach zero — a long
  archive view, a starred-only view, a label/tag drilldown. Skip when
  `intent.global_preferences.automation_trust === 'strict'`: the
  swipe-archive and bulk-archive paths are too quiet for that mode;
  fall through to explicit-button archive instead. Skip in compose /
  reply views — those are not inbox surfaces.
example_flow: |
  1. Call `thread.list` (no filter — the inbox shows everything not yet
     archived). Render rows newest-first.
  2. Mark-read-on-scroll: defer to the `mark-read-on-scroll` skill for
     the dwell-time rules. This skill only declares that auto-read is
     ON for the inbox surface, gated on
     `intent.global_preferences.automation_trust !== 'strict'` and
     overridden by an explicit `Settings → "Always confirm read"` toggle.
  3. Swipe-archive: on touch viewports, a left-swipe on a row triggers
     `thread.archive`. The capability declares `confirmation: 'modal'`
     for safety; the swipe gesture itself is the inline confirm and
     the manifest must promote the swipe to count as that confirm
     (declare `confirmation: 'inline'` in the gesture binding). On
     `automation_trust === 'strict'`, disable swipe entirely and show
     the explicit Archive button.
  4. Bulk-archive empty path: if the user has read every visible row
     (UI tracks `read_count === total_count`), surface a top-bar
     `ButtonGroup` with "Archive all read" → modal confirm → batched
     `thread.archive` calls. This is the only bulk write the inbox
     surface should expose.
  5. "You're caught up" celebration: when `thread.list` returns zero
     rows, render an `EmptyState` with the prose pattern below. Do
     NOT show a CTA back into the queue, do NOT show ads or upsell —
     the empty state's job is to reward the user for reaching zero.

  Celebration prose patterns (rotate; never repeat within a session):
    - "You're caught up. Nothing left to read. Last sync N min ago."
    - "Inbox zero. N messages archived today."
    - "Nothing here. Closing this tab is a fine next move."
  Avoid sycophancy ("Great job!", "You crushed it") — calm, factual.
known_failure_modes:
  - Auto-archiving when `automation_trust === 'strict'`. The user has
    explicitly opted out of quiet writes; respect it even if the swipe
    feels obvious. Surface the explicit Archive button instead.
  - Bulk-archive without a modal confirm. The bulk path writes many
    capabilities at once; even though `thread.archive` is reversible,
    a 200-row batched archive is hard to undo per-row. Always modal.
  - Forgetting to refetch after a swipe-archive. The optimistic remove
    is fine for the row, but the count badge in the NavBar must read
    truth-of-record on next render.
  - Showing the celebration empty state when the inbox is empty due to
    a fetch error (not a real zero). Distinguish `error` vs `empty`
    states — only celebrate on a successful zero result.
  - Repeating the same celebration string across days. Rotate from a
    small list; never invent new prose at runtime — that produces
    LLM-flavored copy ("Way to go, champion!") and breaks brand voice.
---

# Inbox zero

The inbox-zero skill is the WORKFLOW around an inbox surface — the rules
that govern read-state, archive, bulk-archive, and the celebration when
the surface drains to empty. It does NOT specify rendering of individual
rows (that is `decision-queue` if any rows require a decision, or a
plain `List` of `thread.list` otherwise).

## Why this skill exists

Reaching zero is the entire reward loop of an inbox app. The compiler
has a tendency to either (a) over-automate (auto-archive everything
the user scrolled past) or (b) under-automate (require a button click
for every row). This skill encodes the middle path: dwell-based auto-
read, gesture-based archive, and explicit bulk-archive — all gated on
`automation_trust`.

## Composition rules

- The skill is gated by `automation_trust`. In `strict` mode, all the
  quiet writes (auto-read on dwell, swipe-archive, etc.) are disabled
  and the surface degrades to explicit buttons.
- The bulk-archive button is ONLY shown when `read_count === total_count`.
  Hiding it before that prevents the user from accidentally archiving
  unread rows in a "select all" panic.
- The celebration empty state is part of the contract — leaving the
  surface blank when the inbox drains is a regression, not a neutral
  state.

## Pairings

- `mark-read-on-scroll` for the dwell-time read rules.
- `decision-queue` for rendering the rows that require a decision.
- `quick-reply-affordance` for inline reply on rows that do not need
  to be promoted into a task.
- `thread-collapse` for the detail view that opens on row tap.
