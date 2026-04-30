---
name: dirty-state-warning
version: 0.1.0
description: Prompt the user before navigating away from a form with unsaved changes — but only when fields differ from the initial state, the form has been mounted long enough to be intentional, and an auto-save has not just succeeded.
capabilities_used:
  - dummyjson.cart.add
when_to_use: |
  When a route or modal contains an editable `<Form>` (or composed
  fieldset) and the user attempts to navigate away — back button,
  link click, route change, browser tab close, modal dismiss. Pair
  with `<ConfirmDialog>` and the runtime's navigation guard.
when_not_to_use: |
  Read-only views (no edits to lose). One-tap toggles where the
  change persists immediately on flip — the affordance is the
  commit. Search inputs (a typed-but-not-submitted query is not
  "unsaved work"). Recipes whose policy already declares
  `confirmation: 'modal'` on the underlying mutation — the
  destructive-action confirm is the source of truth, do not
  double-prompt.
example_flow: |
  1. On `<Form>` mount, snapshot the initial field values into a
     ref `initial_state` and record `mounted_at = Date.now()`.
  2. On every field change, compute `is_dirty` by shallow-equal
     against `initial_state`. The component must NOT prompt while
     `is_dirty === false`.
  3. Track auto-saves: on every successful auto-save, record
     `last_autosave_at = Date.now()`.
  4. On a navigation-away event (`beforeunload`, route guard, modal
     dismiss), evaluate the gate in this exact order:
     - If `!is_dirty` → allow navigation, no prompt.
     - If `Date.now() - mounted_at < 5000` → allow navigation, no
       prompt. (Brief mounts are usually accidental clicks; a prompt
       here annoys more than it protects.)
     - If `intent.automation_trust === 'permissive'` AND
       `last_autosave_at` exists AND
       `Date.now() - last_autosave_at < 10_000` → allow navigation,
       no prompt. The recent auto-save is the safety net.
     - Otherwise open a `<ConfirmDialog>` (`confirmation: 'modal'`)
       with three options: "Save and leave", "Discard changes",
       "Keep editing". Never reduce to a two-button dialog —
       Discard must always be visible and explicit.
  5. On Save-and-leave, run the bound save capability; only navigate
     after the success callback fires. On Discard, navigate
     immediately. On Keep editing, dismiss the dialog and refocus
     the most-recently-edited field.
known_failure_modes:
  - Prompting on a clean form because the dirty check compares
    against the initial render but the recipe seeded a default value
    server-side after mount — always snapshot post-hydration.
  - Prompting within the 5-second mount window after a stray click
    on the back button — annoying enough that users learn to
    dismiss the dialog reflexively, defeating the safety net.
  - Suppressing the prompt when an auto-save *failed* but is being
    treated as recent. The 10s window must require a *successful*
    auto-save.
  - Showing a two-button dialog (Stay / Leave) — users can lose work
    by mis-clicking Leave. Always offer Save, Discard, Cancel.
  - Stacking the dirty-state prompt on top of a modal-level confirmation
    on the underlying mutation. One confirmation per intent.
---

# Dirty state warning

A user who has typed for 90 seconds and clicks Back deserves a prompt;
a user who clicked Edit and immediately changed their mind does not.
This skill encodes the gate that distinguishes the two so the prompt
fires exactly when it earns its keep.

## Why this skill exists

The default agent move is "always prompt on navigation", which trains
users to dismiss the dialog without reading. The
dirty + mount-age + recent-autosave gate cuts ~80% of the false
positives, leaving a prompt that only appears when there is something
to actually lose.

## Composition rules

- Dirty detection compares against the post-hydration snapshot, not
  the initial JSX defaults.
- Use `confirmation: 'modal'` for the dialog shape; it is a real
  value in `CapabilitySchema.confirmation`.
- Three-button layout: Save, Discard, Cancel. Never two.
- The 10-second auto-save suppression applies only when
  `intent.automation_trust === 'permissive'` AND the most recent
  auto-save attempt succeeded.
