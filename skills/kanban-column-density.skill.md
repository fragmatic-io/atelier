---
name: kanban-column-density
version: 0.1.0
description: Adapt Kanban card density and column visibility to viewport — title-only when columns are narrow, title plus meta when wider, collapsed columns when more than five are visible, and prose for empty columns.
capabilities_used:
  - board.column.list
  - board.card.list
when_to_use: |
  Whenever a recipe renders a `<Kanban>` board (or a `<Grid>` of column
  cards if the registry lacks `<Kanban>`). Apply on every render — the
  density picks are a function of measured column width, not a static
  manifest field. Pair with `card-priority-emphasis` for highlighting
  rules and `assignee-affordance` for the avatar group inside each card.
when_not_to_use: |
  Single-column "inbox" or task list surfaces — those use `<List>` rules,
  not Kanban density. Read-only swim-lane reports for printing — print
  output should always render full meta regardless of measured width.
  Calendar week views: even though they look like columns, calendar
  density is owned by `calendar-day-week-month`.
example_flow: |
  1. Call `board.column.list` to enumerate columns and their WIP-limit
     hints (when the capability declares `wip_limit` per column).
  2. For each visible column, measure rendered width:
     - `width < 200px`: render `<Card>` with title only.
     - `200px <= width < 320px`: title + one meta line (assignee or due).
     - `width >= 320px`: title + assignee row + due pill + label chips.
  3. Count columns that intersect the viewport.
     - `n <= 5`: show all columns expanded.
     - `n > 5`: collapse trailing columns into a vertical strip
       (column header + count badge only) and let the user click to
       expand. Never hide a column that owns "today" cards.
  4. For any column with zero cards, render a faint prose stub:
     "Drop something here to start" (or the brand voice equivalent —
     pull from `BrandKit.voice.surfaces.empty_state` if present).
  5. When `wip_limit` is declared and `card_count > limit`, render a
     "Over WIP" hint on the column header (warning tone, not error —
     blocking the user creates worse outcomes than over-WIP).
known_failure_modes:
  - Picking density on initial render and never re-measuring after a
    sidebar opens, leaving title-only cards in newly wide columns.
  - Collapsing the column that owns today's items just because it sits
    sixth in the order — collapse must be priority-aware, not positional.
  - Localizing the empty-column prose by copying English directly into
    the brand kit; always pull from the kit, never inline a string.
  - Rendering an "Over WIP" hint as a hard block — the policy is a hint;
    never refuse a drop on it.
---

# Kanban column density

Kanban boards are the most over-rendered surface in product-management
tooling: sixteen columns, four meta lines per card, six avatars, all on
a 1280px laptop. This skill keeps the surface scannable by tying density
to measured width and column count, not to a manifest opinion.

## Why this skill exists

The density decision recurs every render and every viewport change. If
the compiler re-derives it from prose, every keystroke costs a token
budget. Encoding the breakpoints once here means the compiler can pick
without reasoning.

## Composition rules

- Reference the registry's `<Kanban>` component when present; fall back
  to `<Grid>` of `<Card>` columns when it is not. Never roll your own
  drag layer — the runtime owns drop semantics.
- Empty-column prose comes from `BrandKit.voice.surfaces.empty_state`,
  not from this skill. The skill specifies _that_ a stub renders, not
  the words.
- WIP-limit hints are advisory. The capability layer enforces the
  actual limit (if any); the skill only surfaces it.
