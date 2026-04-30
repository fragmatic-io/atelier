// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Audit log event schema.
 *
 * Mirrors `/Users/vid/cir/docs/architecture.md` §Audit log. Every state
 * transition in a CIR system is recorded as one of these events:
 * manifest compiled, manifest served, action executed, intent changed,
 * capability changed.
 *
 * The audit log is immutable and append-only. This schema describes one row.
 */

import { z } from 'zod';
import { AppId, EventId, IsoDateTimeString, ManifestId, TenantId, UserId } from './common.js';

/**
 * The event-type enum.
 *
 * The doc lists `manifest.compiled | manifest.served | action.executed |
 * intent.changed | capability.changed | ...`. We enumerate the documented
 * cases plus a few obvious sibling events (rollback, policy violation) so
 * downstream code has a discriminator to switch on.
 */
export const AuditEventType = z.enum([
  'manifest.compiled',
  'manifest.served',
  'manifest.rolled_back',
  'manifest.invalidated',
  'action.executed',
  'action.denied',
  /**
   * Emitted by `optimisticDispatch()` the moment the synthesized expected
   * outcome is applied to UI state — BEFORE the network call returns. The
   * trigger chain carries `action:<capability_id>` so dashboards can pair
   * each apply with the eventual `action.executed` (or
   * `action.optimistic_rolled_back` on failure).
   */
  'action.optimistic_applied',
  /**
   * Emitted by `optimisticDispatch()` when the underlying `dispatch()` fails
   * after an optimistic apply. The trigger chain carries the redacted error
   * message — never the input payload — so the audit log does not leak
   * sensitive data through a failure path.
   */
  'action.optimistic_rolled_back',
  'intent.changed',
  'capability.changed',
  'skill.changed',
  'component.changed',
  'policy.evaluated',
  'policy.violated',
  /**
   * Emitted on each successful compile that flowed through a `BudgetMeter`,
   * carrying the after-state of the budget so dashboards can plot remaining
   * tokens / calls. Payload (out-of-band): `{ tokens, remaining_tokens,
   * remaining_calls }`.
   */
  'compile.budget_used',
  /**
   * Emitted when a `BudgetMeter` blocks a compile (whether the composite
   * falls through to a fallback or surfaces the error to the caller).
   * Payload (out-of-band): `{ budget, used, would_use }`.
   */
  'compile.budget_exceeded',
]);
export type AuditEventType = z.infer<typeof AuditEventType>;

/**
 * One policy evaluation row attached to an event. Free-form so the policy
 * engine can attach whatever context it deems useful.
 */
export const PolicyEvaluationSchema = z.object({
  policy_id: z.string().min(1),
  passed: z.boolean(),
  detail: z.string().optional(),
});
export type PolicyEvaluation = z.infer<typeof PolicyEvaluationSchema>;

export const AuditEventSchema = z.object({
  event_id: EventId,
  timestamp: IsoDateTimeString,
  user_id: UserId,
  app_id: AppId,
  /**
   * Optional tenant scope. When set, audit subscribers can filter by tenant
   * (`StreamingAuditSink.subscribe(listener, { tenant_id })`) so a per-tenant
   * dashboard never sees another tenant's events.
   */
  tenant_id: TenantId.optional(),
  type: AuditEventType,
  actor: z.enum(['user', 'agent', 'system']),
  before_state_hash: z.string(),
  after_state_hash: z.string(),
  trigger_chain: z.array(z.string()),
  token_cost: z.number().nonnegative(),
  policy_evaluations: z.array(PolicyEvaluationSchema),
  manifest_id: ManifestId.optional(),
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;
