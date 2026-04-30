---
name: assignee-affordance
version: 0.1.0
description: Render a card's assignee group as a horizontal avatar stack — at most three visible, plus a "+N" overflow indicator — and turn the stack into an assign menu only when the assignee.update capability is granted to the manifest.
capabilities_used:
  - board.card.list
  - assignee.list
  - assignee.update
when_to_use: |
  Whenever a `<Card>` (Kanban or list) has an `assignees` array. Pair
  with `kanban-column-density` (for the card width that bounds the
  avatar group) and with `card-priority-emphasis` (which owns the
  surrounding visual emphasis). This skill owns the avatar group and
  its assign menu only.
when_not_to_use: |
  Single-assignee surfaces where the user is always the implicit owner
  (use a `Toggle` instead of an avatar group). Read-only audit logs
  where re-assignment is not a possible action — render the avatar
  group static, no menu, regardless of capability grants.
  Public-facing views where avatars leak PII — fall back to initials
  with no name on hover.
example_flow: |
  1. Read `assignees` from the card record. If empty, render a single
     ghost avatar with a "+ Assign" affordance (only when
     `assignee.update` is granted; otherwise render no affordance).
  2. For up to three assignees, render their avatars in a horizontal
     stack with overlap (z-index ordered by priority, not by array
     position). Avatar fallback when the user record has no image:
     two-letter initials over a deterministic background color
     (`hash(user_id) % palette.length` against `BrandKit.colors.avatar_palette`).
  3. For four or more assignees, render the first two avatars and a
     `+N` chip (where `N = assignees.length - 2`). Hover the chip to
     reveal the full list in a tooltip; click it to open the assign
     menu (when `assignee.update` is granted).
  4. The avatar stack is interactive only when the manifest's
     `capabilities_granted` includes `assignee.update`. When granted,
     clicking the stack opens an assign menu populated by
     `assignee.list`. When not granted, the stack is decorative
     (cursor: default, no hover state, no click handler).
  5. The assign menu writes go through `assignee.update` which declares
     `confirmation: inline` for de-assigning the current user (a
     destructive-feeling self-action) and `confirmation: none` for
     adding a teammate.
known_failure_modes:
  - Showing an assign menu when `assignee.update` is not in the
    manifest's capability grants — the click does nothing and the user
    blames the surface.
  - Picking a deterministic initials color from a palette that is
    not in the BrandKit, producing avatars that clash with the rest
    of the surface.
  - Truncating the assignee list to three without a `+N` chip, hiding
    the fact that more people own this card.
  - Letting a non-deterministic hash of `user_id` produce different
    initial-fallback colors across renders for the same user (always
    use a stable hash, never `Math.random()`).
---

# Assignee affordance

Cards live or die on whose face is on them. This skill keeps the
assignee group readable at every density — and gates the "click to
re-assign" menu behind a real capability grant rather than a hopeful
runtime check.

## Why this skill exists

Avatar overflow is the most frequently re-derived UI rule on a board.
Encoding "max three plus +N" once here saves a render-time decision and
prevents the common drift where some recipes render four overlapping
avatars and others two.

## Composition rules

- The avatar palette comes from `BrandKit.colors.avatar_palette`. The
  skill specifies the indexing rule (deterministic hash); the kit owns
  the colors.
- The assign menu is gated on capability grants. If the manifest does
  not declare `assignee.update`, the avatar group renders static — no
  exceptions, no graceful fallback to a "request access" modal.
- Avatar order in the stack reflects priority (the card's primary
  owner first), not the array order returned by the data layer.
