# @cir/policies

Pure-function validators that the CIR compiler runs against a generated
manifest before serving it. Each policy is deterministic, fast, and
side-effect free — no LLM calls, no network. The package also declares
the `BehavioralPatternDetector` contract that the Phase 4 runtime
implements to plug detection into the trigger bus.

See [`docs/architecture.md` §"Policy engine"][arch] for the design.

[arch]: ../../docs/architecture.md

## Baseline policies

| ID                                      | Severity | Applies to | Description                                                                                                                 |
| --------------------------------------- | -------- | ---------- | --------------------------------------------------------------------------------------------------------------------------- |
| `data_access_within_grant`              | error    | data       | Every component data binding only projects fields the user has granted to this app.                                         |
| `confirmation_required_for_destructive` | error    | action     | Every destructive action (`send`, `delete`, `pay`, ...) is gated by a `ConfirmDialog` or a `confirmation: modal` prop.      |
| `no_pii_in_query_strings`               | error    | manifest   | No route path embeds a PII field as a placeholder (`/u/:email`) or literal segment.                                         |
| `rate_limited_actions_show_state`       | warn     | manifest   | Layouts that dispatch rate-limited actions surface the remaining quota (sibling/ancestor binds a `*.quota` data source).    |
| `reversibility_surfaced`                | error    | manifest   | Reversible actions surface an undo affordance in the same route. Destructive non-reversible actions emit a warn for review. |
| `respects_brand_kit`                    | error    | manifest   | Every component variant referenced by the manifest is allowed by the active `BrandKit`'s per-component variant whitelist.   |

Plus one factory policy (composed into the baseline by passing a rules map):

| Factory                                                      | Severity | Applies to | Description                                                                                              |
| ------------------------------------------------------------ | -------- | ---------- | -------------------------------------------------------------------------------------------------------- |
| `composesAccordingTo(rules)` → `composes_according_to_rules` | error    | manifest   | Component children obey the catalog's composition rules (`can_contain`, `min_children`, `max_children`). |

App-supplied custom policies plug in via `PolicyRegistry`:

```ts
import { BASELINE_POLICIES, PolicyRegistry, validateManifest } from '@cir/policies';

const registry = new PolicyRegistry([...BASELINE_POLICIES, myCustomPolicy]);
const result = validateManifest({ manifest, ..., policies: registry.list() });
```

## Usage

```ts
import { validateManifest, BASELINE_POLICIES } from '@cir/policies';

const result = validateManifest({
  manifest, // produced by the compiler
  capabilities, // resolved from the registry
  intent: { user_id, global_preferences, granted_fields },
  rate_limited_capability_ids: new Set(['mail.send']),
  pii_fields: new Set(['email', 'phone']),
});

if (!result.ok) {
  // surface result.violations to the compiler retry path
  // each violation carries an RFC 6901 JSON Pointer in `path`
}
```

`validateManifest` returns `ok: false` on any `error`-severity violation.
Pass `{ strict: true }` to also fail on `warn`-severity violations.

You can replace or extend the policy set by passing
`{ policies: [...BASELINE_POLICIES, myPolicy] }`.

## Behavioral pattern detector

`BehavioralPatternDetector` is the Phase 4 plug-point: the runtime feeds
observed actions in via `observe()` and surfaces detected workaround
patterns via `snapshot()`. Patterns become triggers (`toTrigger()`) and
flow into the bus, which the manifest store invalidates from. This
package only declares the interface and ships a `NoopBehavioralDetector`
reference implementation. The runtime owns the actual heuristics — see
[`docs/triggers.md` §"Behavioral triggers"][triggers].

[triggers]: ../../docs/triggers.md
