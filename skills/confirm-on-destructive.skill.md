---
name: confirm-on-destructive
version: 0.1.0
description: Pick the right confirmation level for a destructive capability — modal for delete-one, verbal_required (typed-phrase) for delete-many or unrecoverable actions — and never auto-confirm even when intent automation_trust is permissive.
capabilities_used:
  - github.issue.close
  - github.issue.create
when_to_use: |
  When binding a capability with `kind: 'action'` whose
  `side_effects` include any of `mutates:*`, `archive`, `delete`,
  `revoke`, `expire`, OR whose `reversible` flag is `false`. Pair
  with `<ConfirmDialog>`, `<Modal>`, and the runtime's verbal-input
  capture surface.
when_not_to_use: |
  Read-only capabilities (`kind: 'data'`). Reversible "soft" actions
  with a clear undo path that holds for at least 5 seconds (e.g. a
  `task.complete` with `task.reopen` rollback) — the toast-with-undo
  skill is sufficient. UI-state changes (collapse/expand, theme
  toggles) — not destructive. Anything where the runtime already
  declares `confirmation: 'none'` because the action is purely
  additive (e.g. `cart.add`).
example_flow: |
  1. Classify the action against three axes: cardinality (one row
     vs many), reversibility (does the capability declare
     `reversible: true` with a real `rollback`?), and recoverability
     (could the user reconstruct the lost data from another surface
     within five minutes?).
  2. Pick the confirmation level by table:
     - Single row, reversible (e.g. archive one issue) →
       `confirmation: 'modal'`. Render `<ConfirmDialog>` with a
       single "Archive" button and an explicit Cancel.
     - Single row, NOT reversible (e.g. permanent delete of an
       account) → `confirmation: 'verbal_required'`. The user must
       type a confirmation phrase ("DELETE my-account") before the
       primary button enables. Phrase is case-sensitive and
       non-default — never "yes" or "ok".
     - Multi-row destructive (e.g. delete 12 issues) →
       `confirmation: 'verbal_required'`. The phrase includes the
       count: "DELETE 12 issues".
     - Multi-row reversible (bulk archive with bulk-undo) →
       `'modal'` is acceptable IF the rollback is automated and
       holds for at least 30 seconds. Otherwise escalate.
  3. The confirmation level is set on the capability declaration,
     not on the manifest binding. The compiler reads
     `CapabilitySchema.confirmation` and the runtime enforces it;
     the recipe must compose around it, not bypass it.
  4. NEVER auto-confirm a destructive action even when
     `intent.automation_trust === 'permissive'`. The permissive
     setting suppresses auxiliary prompts (dirty-state warnings,
     stale-data nudges) — it does NOT suppress the confirmation
     gate on a destructive capability. This is a hard rule.
  5. Always pair the confirmation with explicit copy that names
     the consequence: not "Are you sure?" but "This will permanently
     delete 12 issues. They cannot be recovered." The `<Alert>`
     inside the dialog uses the BrandKit's `error` voice surface.
  6. After the action executes, emit `audit.action_executed` with
     the consent shape (`modal_confirmed_at` for `'modal'`,
     `verbal_phrase_at` + `phrase_hash` for `'verbal_required'`).
     The audit row is the only record that the user actually
     consented; treat it as load-bearing.
known_failure_modes:
  - Using `'modal'` for a permanent delete because "the dialog has
    a Cancel button". Modals are too easy to dismiss reflexively
    on muscle memory; verbal_required forces deliberate input.
  - Letting `automation_trust === 'permissive'` skip the dialog.
    Permissive applies to nudges, never to destructive consent.
  - Reusing the same phrase across actions ("DELETE") without the
    target. The phrase must include something specific to this
    action so a stuck-keyboard or auto-paste cannot satisfy it.
  - Showing a confirmation that says "Are you sure?" with no detail
    on what will be lost or how many items are affected.
  - Forgetting to record the consent in the audit log. Without the
    audit row, the compliance team cannot prove the user agreed.
---

# Confirm on destructive

Destructive consent is the load-bearing UX of any product that lets
users delete things. This skill encodes the per-action confirmation
table (modal vs verbal_required) and the rule that
`automation_trust === 'permissive'` never bypasses the gate.

## Why this skill exists

The default move is "modal everything destructive", which works until
the user develops modal-dismissal muscle memory. By that point the
system has trained users to ignore the safeguard. The
verbal_required escalation for unrecoverable or multi-row actions
restores the deliberate-action property the user needs to actually
think before clicking.

## Composition rules

- Confirmation level lives on the capability declaration
  (`CapabilitySchema.confirmation`); recipes compose around it,
  never override it.
- Permitted values: `'inline' | 'modal' | 'verbal_required'`.
  `'verbal_required'` ships per Wave 5c — it is a real value, not
  aspirational.
- `automation_trust === 'permissive'` does NOT bypass destructive
  confirmations. It only applies to advisory prompts.
- Phrase for `'verbal_required'` includes the action target and,
  for bulk, the count. Never reusable across actions.
- Audit emits the consent shape; the audit row is the consent
  record of truth.
