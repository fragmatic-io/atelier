# `@cir/schemas`

Foundational schemas for the CIR (Capability · Intent · Render) framework.

This package is the contract every other CIR package depends on: Zod schemas
for the public artifacts (capabilities, skills, components), the private
artifact (intent profile + conversation overlay), the ephemeral artifact
(manifests, turn deltas, thread manifests), the trigger taxonomy, the policy
descriptor, and the audit event row.

For canonical examples of each artifact, see [`docs/artifacts.md`](../../docs/artifacts.md).

## Schemas

| Schema                      | Mirrors                                                            |
| --------------------------- | ------------------------------------------------------------------ |
| `CapabilitySchema`          | `docs/artifacts.md` §Capability                                    |
| `SkillSchema`               | `docs/artifacts.md` §Skill (frontmatter only)                      |
| `ComponentDefinitionSchema` | `docs/artifacts.md` §Component catalog                             |
| `ComponentRegistrySchema`   | The full `id -> definition` map                                    |
| `CompositionRuleSchema`     | `docs/component-catalog.md` composition rules                      |
| `IntentProfileSchema`       | `docs/artifacts.md` §Intent profile                                |
| `ConversationOverlaySchema` | `docs/chat/conversation-artifacts.md` §Conversation memory         |
| `TriggerSchema`             | `docs/triggers.md` + `docs/chat/triggers.md` (discriminated union) |
| `ManifestSchema`            | `docs/artifacts.md` §Render                                        |
| `TurnDeltaSchema`           | `docs/chat/conversation-artifacts.md` §Turn deltas                 |
| `ThreadManifestSchema`      | `docs/chat/conversation-artifacts.md` §Thread manifest             |
| `PolicySchema`              | `docs/architecture.md` §Policy engine (metadata only)              |
| `AuditEventSchema`          | `docs/architecture.md` §Audit log                                  |

## Use

```ts
import { CapabilitySchema, type Capability } from '@cir/schemas';

const cap: Capability = CapabilitySchema.parse(json);
```

Every schema has a paired inferred type — `CapabilitySchema` -> `Capability`,
`ManifestSchema` -> `Manifest`, etc.

## CLI

```bash
# Dump all schemas as JSON Schema documents (Draft 2019-09 by default)
pnpm exec cir-schemas dump --out .well-known/schemas

# Validate every JSON file under capabilities/, recipes/, components/,
# policies/ against the appropriate schema
pnpm exec cir-schemas validate-data

# Strict mode — fail on `_review` envelope drafts (e.g. capabilities
# imported from an OpenAPI spec that haven't been hand-reviewed yet)
pnpm exec cir-schemas validate-data --strict
```

The CLI lives in `src/cli/`. Path-based dispatch for `validate-data` is
configured in `src/cli/registry.ts` (`PATH_DISPATCH`). Skill markdown files
are NOT validated by this command — they need a frontmatter parser, which
ships with `@cir/policies`.

### Draft-safety: the `_review` envelope

`CapabilitySchema` accepts an optional `_review` envelope: `{ status: 'draft' | 'reviewed', generated_from?, notes? }`. The OpenAPI importer (`pnpm cir import openapi`) stamps generated capabilities with `_review.status = 'draft'` so a CI gate can refuse them until a human signs off. `validate-data --strict` fails on every draft; PRs adding new capabilities run the strict path in CI.

### Composition rules

`CompositionRulesSchema` validates the `components/composition-rules.json` sibling artifact (a `ComponentId -> CompositionRule` map). The script that emits `components/registry.json` from `@cir/components` also emits and re-validates this sibling — see [`../components/README.md`](../components/README.md) for how the two artifacts stay in sync.

## BrandKit (Wave 6 / P-6)

`BrandKitSchema` is the design-system contract. Beyond the baseline
tokens + variants + voice trio, Wave 6 adds optional fields the compiler
and `respects_brand_kit` policy lean on to drive a designed-feeling UI:

| Field            | Shape                                                     | Purpose                                                                      |
| ---------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `radius_scale`   | `Record<string, string>`                                  | Named radii (`{ sm: '4px', md: '8px' }`); inline `border-radius` must match. |
| `shadow_scale`   | `Record<string, string>`                                  | Named CSS shadow strings; inline `box-shadow` must match.                    |
| `motion`         | `{ duration_scale: Record<string, number>; easing? }`     | Animation durations (ms ints) + easing curves.                               |
| `iconography`    | `{ allowed_sets: string[]; minimum_size: number }`        | Allowed icon-pack ids and minimum touch size (px).                           |
| `voice.surfaces` | `Record<string, { tone: string; example? }>`              | Per-surface voice (`button`, `error`, `marketing`, …).                       |
| `accessibility`  | `{ contrast_minimum: number; focus_ring_required: bool }` | WCAG-style contrast minimum + focus-ring requirement.                        |

Every field is optional. Existing brand kits without them keep validating.
The `respects_brand_kit` policy enforces each field only when the kit
declares it AND the manifest carries an inline value the check is
interested in (token references like `token:radius.md` are presumed
audited at the kit level).

A starter `BrandKit` JSON can be generated from a Figma Design Tokens
export with `cir import figma <tokens.json>` — see `@cir/cli`.

## Information hierarchy (Wave 7b / P-9)

Two optional fields drive the compiler's information-hierarchy reasoner:

- `Capability.salience_default` — a free-form expression the compiler
  evaluates against the capability's data shape to derive a default
  per-item salience score (0–1). Examples: `"urgency * recency"`,
  `"unread_count + priority * 0.5"`, `"due_date - now"`. The compiler
  uses this to decide which list/table items get top-of-fold emphasis
  when no host-supplied sort overrides it.
- `IntentProfile.priority_rules` — an array of
  `{ domain, signal, weight? }` entries the user owns. Each rule
  modifies a named signal's contribution (multiplier in `[0, 1]`,
  default 1.0) within the matching domain. Signals are drawn from a
  small enum: `urgency`, `recency`, `unread`, `assigned_to_me`,
  `starred`, `due_date`. The compiler combines rules with the
  capability's `salience_default` before sorting.

Both fields are optional. Capabilities and intent profiles authored
before Wave 7b continue to validate without changes; the compiler
falls back to source order when neither is declared. The companion
skill is `skills/information-hierarchy.skill.md` and the companion
policy is `composes_hierarchy_for_long_lists` in `@cir/policies`.

## Golden tests

`test/golden/` holds a frozen JSON Schema dump. `test/golden.test.ts`
re-runs the dump and diffs. To deliberately update the golden after a
schema change:

```bash
pnpm exec cir-schemas dump --out packages/schemas/test/golden/
git diff packages/schemas/test/golden/   # review carefully
```

This is a public API change and should be reflected in the package version.
