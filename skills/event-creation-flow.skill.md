---
name: event-creation-flow
version: 0.1.0
description: Pattern for creating a calendar event — click-and-drag for direct manipulation, button-then-form for keyboard users — with conflict detection, timezone confirmation, and duration suggestions seeded from the user's intent vocabulary.
capabilities_used:
  - calendar.event.list
  - calendar.event.create
  - calendar.event.conflict_check
when_to_use: |
  Whenever a recipe exposes "create event" affordances on a `<Calendar>`
  surface (or its `<Grid>` fallback). Pair with `calendar-day-week-month`
  for the host view and with the runtime's confirmation policy for the
  write itself.
when_not_to_use: |
  Recurring-series creation (use the recurrence skill — recurring rules
  need a separate UX). Imports from a third-party calendar (use the
  import skill, not the per-event create flow). Read-only previews —
  no creation affordance should render at all.
example_flow: |
  1. Pick the entry path:
     - Pointer/touch on day or week view: enable click-and-drag on the
       time grid; the drag length sets the duration. On drop, open an
       inline `<Form>` anchored to the drag rectangle.
     - Keyboard or month view: render a "+ New event" button in the
       header. On click, open a centered `<Modal>` `<Form>`.
  2. Pre-fill the form:
     - Start: the drag-start time, or the current hour rounded to the
       next quarter when entered via the button.
     - Duration: 30 minutes by default, but if the user's intent
       vocabulary (`IntentProfile.vocabulary`) has a matching token
       (e.g. "deep work" → 90 minutes, "standup" → 15 minutes), use
       it. Surface three suggestion chips: 15 / 30 / 60 minutes (or
       the vocabulary-derived value plus the two flanking standards).
     - Timezone: the user's local timezone, even when the calendar
       data origin is elsewhere. Show the timezone in the form footer.
  3. As the user types start/end, call `calendar.event.conflict_check`
     (read-only, debounced 300ms). If overlap with an existing event
     is detected, render an inline warning: "Overlaps with
     {{conflicting_title}} — create anyway?" Do not block submission.
  4. On submit, show the confirmation copy: "Create '{{title}}' on
     {{date}} from {{start}} to {{end}} ({{user_tz}})?" The
     timezone is non-optional in the confirmation string.
  5. The write goes through `calendar.event.create` which declares
     `confirmation: inline` (modal for cross-calendar invites). On
     success, render a Toast with an Undo affordance bound to
     `calendar.event.delete` for at least 10 seconds.
known_failure_modes:
  - Pre-filling the duration from "deep work" without checking that
    the user's vocabulary actually maps it (a generic recipe should
    fall back to 30 minutes, not assume).
  - Suppressing the timezone in the confirmation copy because "the
    user is in their own timezone" — until you confirm origin and
    user locale match, always show it.
  - Treating a conflict-check failure as a hard block; the user must
    be able to override (some overlaps are intentional).
  - Forgetting to debounce `conflict_check` and firing it on every
    keystroke, hammering the calendar backend.
  - Skipping the Undo on `event.create` — every write to a shared
    calendar should be reversible by default.
---

# Event creation flow

Calendar event creation is the single most-used write in any
calendaring product. This skill encodes the "two paths, one form" UX
so recipes do not reinvent it (and skip the conflict check, the
timezone footer, or the Undo).

## Why this skill exists

The temptation to roll a custom create flow per recipe is high — every
team has an opinion. Encoding the pattern (drag for pointer, button for
keyboard, conflict-check inline, timezone in the confirmation) once in
this skill keeps the surface predictable across calendars, brands, and
agents.

## Composition rules

- Reference the registry's `<Calendar>` when present; otherwise compose
  a `<Grid>` of day cells with a `<Card>` per event and a `<Form>` as
  the create modal.
- The vocabulary lookup is optional — `IntentProfile.vocabulary` may be
  absent. Always have a 30-minute default to fall back to.
- Conflict checks are advisory, never blocking. The runtime owns the
  hard-block path through `confirmation: modal` for true conflicts
  (cross-calendar double-bookings) — this skill only surfaces overlap.
- Timezone in the confirmation string is a contract. The runtime's
  `verbal_required` confirmation policy will refuse a confirm prompt
  that omits the timezone for cross-tz writes.
