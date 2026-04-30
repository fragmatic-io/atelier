---
name: bulk-edit-affordance
version: 0.1.0
description: Add a checkbox column to a list or table only when a backing capability supports `*.bulk_update`, surface a floating action bar as soon as one row is selected, expose the standard keyboard shortcuts (Cmd+A, Esc), and always confirm before issuing destructive bulk actions.
capabilities_used:
  - github.issue.close
when_to_use: |
  When a `<List>`, `<Table>`, or `<Kanban>` is bound to a capability
  registry that includes a sibling `*.bulk_update`, `*.bulk_delete`,
  `*.bulk_close`, or `*.bulk_archive` entry. The presence of the
  bulk capability is the gate — without it there is no use exposing
  selection. Pair with `<MultiSelect>`, `<Toast>`, and
  `<ConfirmDialog>`.
when_not_to_use: |
  Lists where every row is a one-shot affordance (e.g. a feed of
  notifications, a chat sidebar). Tables backed only by single-row
  capabilities — a checkbox column promises a power that does not
  exist. Read-only views (no edits to make in bulk). Tree views
  with parent-child semantics — bulk edit on a subtree is a
  different skill.
example_flow: |
  1. At compile time, inspect the bound capability set for sibling
     `<resource>.bulk_*` entries (e.g. `github.issue.bulk_close`).
     If none exist, do not render the checkbox column at all — the
     manifest must not promise actions the runtime cannot deliver.
  2. When a bulk capability is present, render a leading checkbox
     column on the list/table. The header checkbox toggles
     select-all on the current page (not the entire result set —
     cross-page selection is a different skill).
  3. As soon as `selection.length >= 1`, dock a floating
     `<Stack direction="row">` action bar above the list, sticky
     to the viewport. The bar shows: selection count
     ("3 selected"), an Esc-to-clear hint, the available bulk
     actions as `<Button>`s, and a "Select all on page" / "Clear"
     toggle.
  4. Bind keyboard shortcuts at the list root:
     - `Cmd/Ctrl+A` → select all on the current page (mirrors the
       header checkbox).
     - `Esc` → clear selection. Always available; never gated.
     - `Shift+Click` on a row → range-select between the last
       selected row and the clicked row.
     Surface the hints inline in the action bar — never bury them
     in a help menu only the power user finds.
  5. For destructive bulk actions (`bulk_delete`, `bulk_close`,
     `bulk_archive`), open a `<ConfirmDialog>` summarising the
     count and the action, with a clear "This affects N items"
     line. Reuse the `confirm-on-destructive` skill's per-count
     escalation rules — single-row destructive uses `'modal'`,
     bulk destructive at 10+ items escalates to
     `'verbal_required'`.
  6. On success, surface a `<Toast>` with the count and an Undo
     button bound to the rollback (if the bulk capability
     declared `reversible: true`). Hold for 8 seconds — bulk
     actions deserve more recovery time than single-row ones.
known_failure_modes:
  - Rendering the checkbox column on every list "for consistency"
    even when no bulk capability backs it. The selection bar then
    promises actions that resolve to "not implemented".
  - Hiding the action bar in a kebab menu so the count is invisible
    until the user clicks. The count IS the affordance — keep it
    front of mind.
  - Auto-confirming bulk destructive actions because the underlying
    single-row capability is declared with no confirmation. Bulk always
    escalates the confirmation level, never inherits it.
  - Forgetting `Esc` to clear. Users learn the shortcut on one
    table and expect it everywhere.
  - Persisting selection across pagination invisibly. Either show
    a "5 on this page, 12 total selected" indicator, or clear
    selection on page change — never silently keep ghost selections.
---

# Bulk edit affordance

Selection is a UX promise: that the rows the user has checked will
all receive the same action. This skill encodes when to make the
promise (only when the capability set can keep it), how to surface
selection state (a sticky action bar, never a kebab), and how to
gate destructive actions (always confirmed, escalating with count).

## Why this skill exists

The default move on "render a list" is a checkbox column at every
row, because lists in design systems ship with one. The result is
recipes that promise bulk editing the runtime cannot perform. The
"capability gates the affordance" rule keeps the manifest honest.

## Composition rules

- Checkbox column is gated on the existence of a sibling
  `*.bulk_*` capability. No bulk capability → no column.
- Action bar is sticky and always visible while selection is non-empty.
- Destructive bulk actions escalate confirmation: single-row
  `'modal'` becomes `'verbal_required'` at 10+ rows. See
  `confirm-on-destructive`.
- Keyboard hints (Cmd+A, Esc) render inline in the action bar.
- Cross-page selection is out of scope; this skill governs
  per-page selection only.
