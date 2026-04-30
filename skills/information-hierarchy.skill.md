---
name: information-hierarchy
version: 1.0.0
description: Encode the visual emphasis rules for long lists, tables, grids, and KPI rows so the most important items receive the user's attention first instead of whatever order the data arrived in.
capabilities_used:
  - thread.list
when_to_use: |
  When a `<List>`, `<Table>`, `<Grid>`, or `<KPIRow>` binding has more than
  seven items above the fold AND the underlying capability declares a
  `salience_default` expression OR the user's intent profile carries
  `priority_rules` that score the items. The skill does two jobs:

  - **Cap N = 7 above the fold.** A scrollable list shows up to seven items
    in the immediate viewport; the rest live below the fold and inherit
    default treatment.
  - **Top 1–3 get emphasis.** The highest-salience items at the top of the
    sort order get a visible upgrade — larger text, bolder weight, or a
    left-border accent (one of these, never all three on the same row).

  Pair the skill with `dashboard-with-stats` (it picks the row shape) and
  `decision-queue` (it surfaces items needing a decision). This skill
  layers the salience-aware ordering and emphasis treatment on top.
when_not_to_use: |
  Skip when the list has seven or fewer items — every item is already
  above the fold, emphasis on top three would be visual noise. Skip when
  the capability has no `salience_default` AND the intent declares no
  `priority_rules` — without a signal, "top three" collapses to "first
  three by source order", which is the bug this skill exists to prevent.

  Do not use this skill to reorder cards in `Kanban` columns (each column
  has its own ordering semantics) or rows inside a `Calendar` (time order
  is the salience). Do not stack emphasis with a separate "starred" or
  "pinned" row — pick one or the other; mixing them muddies the hierarchy.
example_flow: |
  1. Read the capability's `salience_default` expression and the user's
     `priority_rules`. Multiply each named signal's contribution by its
     matching rule's `weight` (default 1.0). Compute a per-item score.
  2. Sort items descending by score. Cap the visible window to seven for
     "above the fold" — the eighth item is the cut.
  3. Apply emphasis to the top 1–3 items. Default to top-3 when scores are
     spread out (max — min ≥ 0.3); collapse to top-1 when the leader
     dominates (top score ≥ 2× the second). Never emphasise more than
     three.
  4. Per component:
     - **List** → first item bold + a left-border accent (token reference,
       not raw colour). The remaining six are default weight.
     - **Table** → first row highlighted (subtle background tint from the
       brand kit's accent_subtle token). No font-weight change in tables;
       the row band is the signal.
     - **KPIRow** → the first stat is the hero size (one shape level
       larger than its siblings); the rest stay compact.
     - **Grid** → first tile gets the left-border accent; do not enlarge
       (would break grid alignment).
  5. Items below the cut fade by 10–15% opacity (token: `accent_dim`).
     Never go darker than that — the user must still be able to read
     them, just not be drawn to them.
known_failure_modes:
  - Sorting alphabetically when no signal is declared. The compiler must
    fall back to source order in that case, NOT to alphabetical — alpha
    order hides "what should I look at first" the same way it hides
    anomalies on a dashboard.
  - Applying all three emphasis treatments (large + bold + border) to the
    same top item. Pick ONE per component family. Two emphasis cues read
    as a system bug, three read as a design failure.
  - Dimming below-the-cut items to 40–60% opacity to "really make the top
    pop". The cap is 10–15%; anything heavier reads as disabled and
    invites the user to scroll past content they may still need.
  - Re-sorting on every data refresh so emphasised items shuffle while
    the user is reading. Lock the sort order to the initial fetch and
    only re-sort on explicit user action or a `data.refresh` trigger.
  - Applying salience to a list with seven or fewer items. The skill
    explicitly skips short lists; emphasis on a five-row table is
    distracting, not informative.
---

# Information hierarchy

Lists arrive in whatever order the upstream source produced. A great UI
puts the most important thing at the top and visually upgrades it; an
average UI just renders the array. This skill is the difference.

## Why this skill exists

The compiler picks layout components correctly but does not reason
about _importance_. Without an explicit hierarchy directive, the
top-of-list slot goes to whichever item happened to be first — which is
almost never the item the user needs to act on first. The
`salience_default` expression on capabilities is the data-side answer
("here is how to score importance"); `priority_rules` on the intent
profile is the user-side answer ("here is how I want those scores
weighted"). This skill encodes the rendering rules that turn those
scores into a visible hierarchy.

## When and When-not

When: long lists/tables/grids (more than seven items) backed by a
capability with `salience_default` or an intent with `priority_rules`.

When-not: short lists (≤ 7 items), Kanban columns, Calendar rows,
read-only reference views where the user is scanning rather than acting.

## Example

A GitHub issue triage queue with 23 issues, capability declares
`salience_default: "urgency * recency + assigned_to_me * 2"`, and the
user's intent has `priority_rules: [{ domain: 'github', signal:
'assigned_to_me', weight: 0.5 }]`. The compiler computes a per-item
score with the `assigned_to_me` term halved, sorts descending, picks
the top 7 above the fold, and emphasises the top 3 with bold + a
left-border accent. Items 8–23 stay at default weight, faded by 12%.

## Composition rules

- **Cap N = 7 above the fold.** Items 8+ render below the cut.
- **Emphasise 1–3 items.** Default top-3; collapse to top-1 when the
  leader is at least 2× the second.
- **One emphasis treatment per component.** List uses bold + accent
  border; Table uses row-band tint; KPIRow uses hero size; Grid uses
  left-border accent. Never combine.
- **Fade by 10–15%.** Below-the-cut items fade subtly; never to
  disabled-looking opacity.
- **Lock sort on initial fetch.** Re-sort only on explicit refresh.

## Failures

- Top-3 emphasis stacked with a separate "starred" row → pick one.
- Re-sort on every refresh → emphasis shuffles, breaks the user's
  reading frame.
- Dim below-the-cut to 40%+ → reads as disabled.
- Apply to short lists → noise, not signal.
- Alphabetical fallback when no signal → defeats the skill's purpose.
