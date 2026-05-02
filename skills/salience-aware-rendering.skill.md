---
name: salience-aware-rendering
version: 0.1.0
description: Honour the categorical salience level a capability declares (and the user's intent overrides) by emitting a per-row `emphasis` flag on data-bound rows. The data resolver auto-stamps the flag for high-salience bindings; this skill explains the rendering contract so authors do not hand-emphasise.
capabilities_used:
  - github.issue.list
when_to_use: |
  Whenever a `<Queue>`, `<List>`, `<Grid>`, or `<Table>` is bound to a
  capability whose effective salience resolves to `'high'`. "Effective"
  means the result of `resolveSalience(capability, intent)` —
  `IntentProfile.priority_overrides` overrides `Capability.salience_level`
  per-user.

  The data resolver auto-stamps `emphasis: 'high'` on each row of a
  high-salience binding. The renderer reads `emphasis` from the row and
  surfaces `data-emphasis="<level>"` on the row element. Host stylesheets
  pick that attribute up and apply the visual treatment — a subtle row
  band, a stronger border, a heavier weight, but exactly ONE cue per
  component family (per `information-hierarchy`'s composition rules).

  Pair this skill with `information-hierarchy` (which owns the cap-N=7
  decision and the within-list ordering) and with `card-priority-emphasis`
  on Kanban surfaces.
when_not_to_use: |
  Do not author per-row `emphasis` overrides in the manifest. The data
  resolver is the canonical source for salience; manual overrides drift
  from intent immediately the user updates `priority_overrides`. The
  skill's job is to compose hierarchy-respecting layouts — high-salience
  routes get top placement; high-salience rows surface the resolver's
  emphasis flag through the salience-aware container — not to micromanage
  per-row visuals.

  Skip when the capability resolves to `'normal'` or `'low'`. Mixing
  emphasised and non-emphasised content from low-salience capabilities
  signals importance the data does not carry.

  Do not apply the salience treatment to `Kanban`, `Calendar`, or
  `Timeline` — those surfaces have their own ordering semantics
  (column / time / sequence) and the row-level emphasis affordance does
  not exist there.
example_flow: |
  1. The compiler resolves the manifest and binds a `<Queue>` to
     `github.issue.list`. The capability declares
     `salience_level: 'high'` (or the user's intent overrides bump it).
  2. The data resolver fetches the rows and, recognising the high level,
     stamps `emphasis: 'high'` on each row before returning the array.
  3. The `<Queue>` renderer reads `emphasis` from each row and surfaces
     `data-emphasis="high"` on the `<li>`. The host stylesheet applies
     the route's salience treatment (a brand-token-driven left-border
     accent, a slightly stronger row weight, never both).
  4. When the user updates `priority_overrides` to demote the capability
     back to `'normal'`, the next resolver pass returns rows without the
     emphasis flag. No manifest re-compile is necessary — the
     resolver-driven path closes the loop.
known_failure_modes:
  - Hand-emphasising rows in the manifest, drifting from the resolved
    level as soon as the user adjusts intent. The resolver is the one
    place salience is decided; manifests should never override it.
  - Stacking the salience treatment with a separate "pinned" / "starred"
    row affordance. Pick one; mixing them muddies the hierarchy.
  - Applying the row-level treatment on `Kanban` or `Calendar` — both
    have their own ordering semantics and no row-level surface to land
    the emphasis flag on.
  - Treating salience as an ordering signal. The `information-hierarchy`
    skill is the authority on within-list ordering; this skill is about
    the visual surface ONLY. Reorder via the resolver / `data.sort`,
    never via the emphasis flag.
---

# Salience-aware rendering

Wave 7 / P-9 brings salience back as a first-class data field. The data
resolver auto-emits `emphasis: 'high'` on rows for high-salience
bindings; this skill is the rendering contract.

## Why this skill exists

The marketplace pivot (Wave M) stripped `IssueQueue.emphasizeTopN` —
salience as a custom-component prop did not generalise. P-9 puts
salience back as a property of the **capability** (and the user's
**intent**), not the rendered component. The data resolver is the
choke point: it resolves salience once, stamps each row, and the
salience-aware containers (`<Queue>`, `<List>`, `<Grid>`, `<Table>`)
pick the flag up automatically.

## When and when-not

When: a `<Queue>` / `<List>` / `<Grid>` / `<Table>` bound to a
capability whose effective salience (per `resolveSalience`) is
`'high'`.

When-not: row-less surfaces (`Kanban`, `Calendar`, `Timeline`),
non-data-bound components, low-salience routes.

## Composition rules

- The renderer reads `emphasis` from each row and surfaces it as
  `data-emphasis` on the row element. ONE visual cue per component
  family, brand-token-driven, never inline colour.
- Per `information-hierarchy`, do not stack emphasis treatments on the
  same row.
- High-salience routes deserve top placement in the layout. A
  high-salience binding buried below the fold defeats the purpose.

## Failures

- Hand-emphasised rows in the manifest — drift from intent.
- Stacking with starred / pinned — pick one cue.
- Applying to surfaces without a row level (Kanban, Calendar).
- Using `emphasis` to imply ordering — that is `data.sort` / the
  hierarchy reasoner's job.
