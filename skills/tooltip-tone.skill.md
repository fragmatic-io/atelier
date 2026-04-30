---
name: tooltip-tone
version: 0.1.0
description: Tooltip prose ≤80 chars, no terminal period, never repeats the visible label, never the only path to crucial info, with a long-press / tap-to-stick fallback for touch.
capabilities_used:
  - github.repo.list
  - dummyjson.product.list
when_to_use: |
  Any icon-only `<Button>`, abbreviated label, or status pill where the
  user benefits from a one-line clarification. Affordances whose
  meaning isn't obvious from the glyph alone.
when_not_to_use: |
  Crucial information (price, irreversible-action warning, validation
  error, payment state). Long help (use `<Drawer>` or inline help
  instead). Tooltips on text that already says the thing — that's noise.
example_flow: |
  1. Write the prose: ≤ 80 characters, sentence case, no terminal
     period, never repeats the visible label verbatim.
  2. Tooltip never explains the obvious. "Save" on a save button does
     not need "Click to save." Add value: "Save (cmd+S)" or "Saves a
     draft — does not publish."
  3. Hide on click. Tooltips that linger after the user has clicked
     through occlude the next interaction.
  4. Touch device fallback: long-press shows the tooltip, OR a single
     tap "sticks" it open until tapped again. Never leave touch users
     without access to the same affordance.
  5. Position: prefer `top` for icon-only triggers, `right` for inline
     glyphs in a row. Flip to stay on-screen.
known_failure_modes:
  - Putting price, warning, or required-action prose in a tooltip —
    keyboard / touch users may never reveal it.
  - Repeating the visible label ("Save" / "Save").
  - Persistent tooltips that overlap the next button after the user
    clicks through.
  - No touch fallback — hover-only on iPad means invisible.
---

# Tooltip tone

A micro-skill: short, additive, never load-bearing.

## The rule

≤ 80 chars, no period, never repeats the label, never the only path to
crucial info, hide on click, long-press fallback on touch.
