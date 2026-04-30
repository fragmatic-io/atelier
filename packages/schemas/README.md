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

## Golden tests

`test/golden/` holds a frozen JSON Schema dump. `test/golden.test.ts`
re-runs the dump and diffs. To deliberately update the golden after a
schema change:

```bash
pnpm exec cir-schemas dump --out packages/schemas/test/golden/
git diff packages/schemas/test/golden/   # review carefully
```

This is a public API change and should be reflected in the package version.
