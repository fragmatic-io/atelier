// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Capability schema — typed action and data definitions.
 *
 * Mirrors the example in `/Users/vid/cir/docs/artifacts.md` §Capability:
 *
 *     {
 *       "id": "thread.archive",
 *       "kind": "action",
 *       "version": "2.1.0",
 *       "input": { "thread_id": "string" },
 *       "output": { "archived_at": "datetime" },
 *       "side_effects": ["mutates:thread_state"],
 *       "permissions": ["thread:write"],
 *       "confirmation": "none",
 *       "rate_limit": "100/min/user",
 *       "reversible": true,
 *       "rollback": "thread.unarchive"
 *     }
 *
 * Capabilities are the public, signed, versioned surface of an app. Anything
 * the compiler can ask the runtime to execute lives here.
 */

import { z } from 'zod';
import { CapabilityId, ConfirmationLevel, RateLimitString, SemverString } from './common.js';

/**
 * Known side-effect categories. The framework treats any side effect in this
 * list (or with a `mutates:` / `reads:` prefix) as triggering specific
 * confirmation/UI behavior.
 *
 * Source: `/Users/vid/cir/docs/chat/runtime-instructions.md` "Confirmation rules".
 *
 * The schema validator below allows additional categories via the regex,
 * but compilers and policy engines should warn on unknown values.
 */
export const KNOWN_SIDE_EFFECTS = [
  'send',
  'publish',
  'post',
  'share',
  'pay',
  'charge',
  'transfer',
  'refund',
  'delete',
  'archive',
  'purge',
  'grant',
  'revoke',
  'modify_permissions',
] as const;

/**
 * Side-effect descriptor. Either:
 *  - one of the known categories above, OR
 *  - a `mutates:<resource>` / `reads:<resource>` qualified form
 *
 * Examples: `mutates:thread_state`, `reads:calendar`, `delete`.
 */
export const SideEffect = z
  .string()
  .regex(
    /^(?:mutates:[a-z0-9_.-]+|reads:[a-z0-9_.-]+|[a-z][a-z0-9_]*)$/u,
    'Side effect must be one of the known categories or a `mutates:*` / `reads:*` qualified form',
  );
export type SideEffect = z.infer<typeof SideEffect>;

/**
 * Permission token (e.g. `thread:write`, `email:send`, `calendar:read`).
 * Free-form `<scope>:<verb>` shape; the policy engine resolves these to
 * concrete grants in the user's intent vault.
 */
export const Permission = z
  .string()
  .regex(/^[a-z][a-z0-9_.-]*:[a-z][a-z0-9_.-]*$/u, 'Permission must match `<scope>:<verb>`');
export type Permission = z.infer<typeof Permission>;

/**
 * The shape of the `input` and `output` objects. The doc example uses a flat
 * `{ "field": "type" }` map; we accept any JSON-ish record so capabilities can
 * embed nested JSON Schemas as their evolution requires.
 */
export const CapabilityIOSchema = z.record(z.unknown());

/**
 * Review envelope — draft metadata for capabilities produced by automated
 * importers (e.g. `cir import openapi`).
 *
 * Convention: hand-authored capabilities OMIT `_review`. Imported capabilities
 * always set it, with `needs` listing the heuristic decisions a human must
 * audit before the JSON can land on `main`. CI gates against any capability
 * with non-empty `_review.needs` via `atelier-schemas validate-data --strict`.
 *
 * The runtime treats `_review` as opaque metadata and ignores it during
 * dispatch. The underscore prefix is a visual marker that this is review
 * scaffolding rather than a runtime field.
 *
 * To clear a draft: audit each entry, fix the JSON, then DELETE the `_review`
 * field entirely. `validate-data --strict` will then accept it.
 */
export const ReviewEnvelopeSchema = z.object({
  /**
   * Outstanding review items. Common entries:
   *  - `side_effects` / `permissions` / `confirmation` / `reversible` /
   *    `rate_limit` — heuristic field decisions that need human audit.
   *  - `pii:input.<property>` / `pii:output.<property>` — properties whose
   *    name matched the importer's PII wordlist (e.g. `pii:input.email`).
   *
   * Empty array means "all items cleared" — but the convention is to drop
   * the entire `_review` field once cleared, not leave it empty.
   */
  needs: z.array(z.string().min(1)),
  /** Source spec reference, e.g. `openapi:/tmp/petstore.json` or `openapi:https://...`. */
  imported_from: z.string().min(1),
  /** ISO-8601 timestamp of import. */
  imported_at: z.string().datetime({ offset: true }),
  /** `@atelier/cli` version that produced the import. */
  importer_version: z.string().min(1),
});

/** Inferred TypeScript type for a Review envelope. */
export type ReviewEnvelope = z.infer<typeof ReviewEnvelopeSchema>;

/**
 * Capability — full schema.
 *
 * Notes on optionality:
 * - `rate_limit` is optional (not every capability is rate-limited).
 * - `rollback` is optional but must be present whenever `reversible === true`
 *   in production capabilities. The schema allows it to be absent so newly-
 *   authored capabilities can stage rollback work; the policy engine enforces
 *   the cross-field rule.
 * - `_review` is optional; present only on imported drafts. CI's strict mode
 *   refuses to merge capabilities with non-empty `_review.needs`.
 */
export const CapabilitySchema = z.object({
  id: CapabilityId,
  kind: z.enum(['action', 'data']),
  version: SemverString,
  input: CapabilityIOSchema,
  output: CapabilityIOSchema,
  side_effects: z.array(SideEffect),
  permissions: z.array(Permission),
  confirmation: ConfirmationLevel,
  rate_limit: RateLimitString.optional(),
  reversible: z.boolean(),
  rollback: CapabilityId.optional(),
  /**
   * When `reversible: true && low_stakes: true`, the runtime applies the
   * action's expected outcome to UI state immediately and rolls back on
   * dispatch failure. Use for: archive, snooze, mark-read, like,
   * save-for-later. NOT for: actions affecting other users, billable
   * actions, anything irreversible from another user's perspective.
   *
   * Defaults to `false` when omitted. Backwards-compatible: pre-existing
   * capabilities without this flag dispatch through the standard
   * (non-optimistic) path.
   */
  low_stakes: z.boolean().optional(),
  /**
   * A free-form expression the compiler evaluates against the capability's
   * data shape to derive a default salience score (0–1) per item. Examples:
   * `"urgency * recency"`, `"unread_count + priority * 0.5"`,
   * `"due_date - now"` (more-overdue = higher). The compiler uses this to
   * sort/feature items in lists when no host-supplied sort overrides it.
   *
   * The expression is opaque to the schema — it is interpreted by the
   * compiler's hierarchy reasoner alongside the user's
   * `IntentProfile.priority_rules` overrides. Capabilities without a
   * `salience_default` continue to validate; the compiler simply falls back
   * to source order.
   */
  salience_default: z.string().optional(),
  /**
   * Wave 7 / P-9 — categorical salience level. Independent of (and
   * complementary to) the numeric `salience_default` expression: where the
   * expression scores items WITHIN a single capability's data set, the
   * level scores the capability ITSELF among its peers.
   *
   * Semantics:
   *  - `'high'` — destructive irreversible actions, mentions /
   *    notifications, urgent decisions; the user should see this on first
   *    glance.
   *  - `'normal'` — the default, the bulk of capabilities.
   *  - `'low'` — ambient quota / metadata / status indicators; legitimately
   *    present but not what the user came here for.
   *
   * The data resolver promotes high-salience bindings to `emphasis: 'high'`
   * on each row by default (see `@atelier/data-resolvers`), and the
   * `salience_resolved` policy advises authors to compose hierarchy-
   * respecting layouts when a high-salience capability is bound. The
   * user's `IntentProfile.priority_overrides` can override this per-user.
   *
   * Capabilities without an explicit level are treated as `'normal'`.
   */
  salience_level: z.enum(['high', 'normal', 'low']).optional(),
  /**
   * When `undoable: true`, the dispatcher returns an undo handle valid for
   * `undo_window_ms`. The runtime emits `action.undoable_window_open` on
   * dispatch and `action.undone` if undo fires within the window. Use for:
   * archive, delete, move, send-to-trash. NOT for: send-email or anything
   * with side effects visible to other users immediately. The flag is only
   * honoured when `reversible: true` and a `rollback` is declared — a
   * declaration without those is treated defensively (no token minted).
   */
  undoable: z.boolean().optional(),
  /** Undo window in ms. Defaults to 5000 when `undoable: true` is set. */
  // `.min(1)` rather than `.positive()` to avoid Ajv 2019 / draft-04
  // `exclusiveMinimum: true` shape rejection (see brand-kit.ts for the
  // same workaround).
  undo_window_ms: z.number().int().min(1).optional(),
  /**
   * Wave 10 / S-2 — typical/expected output cardinality for `data` capabilities.
   * The policy walker reads this to decide when a `<List>` / `<Table>` /
   * `<Grid>` binding has crossed the virtual threshold (default 500) and the
   * manifest should swap to `<VirtualList>` / `<VirtualTable>` to keep the
   * DOM count manageable. Same heuristic the long-list-hierarchy policy
   * already used for inline `expected_count` hints — promoted to the
   * capability so authors declare it once.
   *
   * Action capabilities ignore this field; only `kind: 'data'` consults it.
   * Bindings can still inline an `expected_count` hint; the inline value
   * wins when both are present.
   */
  expected_count: z.number().int().min(0).optional(),
  _review: ReviewEnvelopeSchema.optional(),
});

/** Inferred TypeScript type for a Capability. */
export type Capability = z.infer<typeof CapabilitySchema>;
