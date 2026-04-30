---
name: card-priority-emphasis
version: 0.1.0
description: Highlight high-signal cards on a board — left-border accent on the top three by priority, a date pill for today's items, and a dimmed appearance with reason tooltip for blocked cards. Color picks come from the BrandKit palette.
capabilities_used:
  - board.card.list
  - board.card.get
when_to_use: |
  When rendering a `<Kanban>` (or `<Grid>` of `<Card>` columns) and the
  card model carries `priority`, `due_at`, or `blocked_by` fields. Pair
  with `kanban-column-density` for the layout decisions and with
  `assignee-affordance` for the avatar group; this skill owns visual
  emphasis only.
when_not_to_use: |
  Lists where every row is a row in a `<Table>` (use the table's
  row-emphasis conventions). Personal task views with fewer than five
  items — emphasis adds noise when the surface is already short.
  Read-only audit logs — emphasis implies actionability the row does
  not have.
example_flow: |
  1. Sort visible cards by `priority` (descending). The top three get a
     4px-wide left-border accent. Color: `BrandKit.colors.accent` —
     verify the palette declares a color-blind-safe variant
     (`accent_safe`) and prefer it when present.
  2. For every card with `due_at` falling on the user's current local
     date, render a small date pill (e.g. `Today`) inline with the
     title. Use `BrandKit.colors.warning` for date-overdue, not red —
     red is reserved for hard errors.
  3. For every card with `blocked_by` set, render the card at 60%
     opacity with a tooltip on hover: "Blocked by {{title}}" sourced
     from the resolved blocker. Never hide the card outright — the
     user must see what is stuck.
  4. Never apply more than one accent at once on the same card. Order
     of precedence: blocked > top-three priority > today's pill. A
     blocked top-three card is dimmed with no left-border.
  5. Re-derive on every render of `board.card.list`; emphasis must
     follow the data, never be cached on the card record.
known_failure_modes:
  - Picking pure red and pure green for priority (fails 8% of male
    users with red-green color blindness). Always pull from the
    `accent_safe` palette in BrandKit when available.
  - Emphasizing every card because the user reordered the column —
    after a manual drag, only the top three by `priority`, not by
    column position, get the accent.
  - Showing the "Today" pill in the data origin's timezone instead of
    the user's local timezone (a card "due today" in UTC is "due
    yesterday" for a US user at 09:00).
  - Stacking the dimmed-blocked styling on top of the priority accent,
    producing a card that is both highlighted and faded.
---

# Card priority emphasis

The eye should land on the next thing to do, not on whichever card was
created last. This skill encodes the visual hierarchy that turns "every
card looks the same" into a glanceable surface.

## Why this skill exists

A board without emphasis is an expensive table. The compiler has the
priority, due-date, and blocker information the moment `board.card.list`
returns; this skill exists so the compiler does not have to re-derive
the visual rules from prose every render.

## Composition rules

- The palette is the BrandKit's responsibility. The skill names the
  _role_ (`accent`, `warning`, `accent_safe`); the kit binds the role
  to a hex value.
- Precedence is fixed: blocked > priority > today. Never invent a new
  ordering per recipe — a single deterministic order keeps the visual
  language readable across boards.
- Emphasis is recomputed every render. Never persist `is_top_three`
  on the card record — it is a function of the current sort.
