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
  'intent.changed',
  'capability.changed',
  'skill.changed',
  'component.changed',
  'policy.evaluated',
  'policy.violated',
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
