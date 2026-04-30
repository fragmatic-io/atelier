// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Intent profile + conversation overlay.
 *
 * Mirrors `/Users/vid/cir/docs/artifacts.md` §Intent profile (the persistent
 * vault artifact) and `/Users/vid/cir/docs/chat/conversation-artifacts.md`
 * §Conversation memory as intent slice (the conversation-scoped overlay).
 *
 * Intent belongs to the user (ETHOS principle 3). This schema only describes
 * the SHAPE — read access is gated by the vault's permission flow, write
 * access only by the user via their own agent.
 */

import { z } from 'zod';
import { IsoDateTimeString, TenantId, UserId } from './common.js';

/**
 * One rule in the user's intent profile.
 *
 * `scope`: `'*'` (global), or a domain (`'email'`, `'calendar'`, etc.).
 * `version`: bumped each time the user revises the rule.
 * `locked`: prevents the agent from auto-relaxing the rule (e.g.
 *   "Never auto-send. Always confirm." — this should never silently weaken).
 */
export const IntentRuleSchema = z.object({
  scope: z.string().min(1),
  rule: z.string().min(1),
  version: z.number().int().nonnegative(),
  locked: z.boolean().optional(),
});
export type IntentRule = z.infer<typeof IntentRuleSchema>;

/**
 * Canonical enums for the well-known personalisation signals.
 *
 * `global_preferences` is a free-form `Record<string, unknown>` so apps can
 * store any preference; these enums document the SHAPE that `@cir/components`,
 * `@cir/compiler`, and `@cir/react` honour today. Values outside the enums are
 * not rejected by `IntentProfileSchema` — the runtime/compiler simply falls
 * back to the comfortable default. New keys may be added without a schema bump.
 */
export const DensityPreference = z.enum(['compact', 'comfortable', 'spacious']);
export type DensityPreference = z.infer<typeof DensityPreference>;

export const ColorModePreference = z.enum(['light', 'dark', 'system']);
export type ColorModePreference = z.infer<typeof ColorModePreference>;

export const MotionPreference = z.enum(['reduced', 'subtle', 'rich']);
export type MotionPreference = z.infer<typeof MotionPreference>;

export const AutomationTrustPreference = z.enum(['strict', 'cautious', 'permissive']);
export type AutomationTrustPreference = z.infer<typeof AutomationTrustPreference>;

export const ModalTolerancePreference = z.enum(['low', 'medium', 'high']);
export type ModalTolerancePreference = z.infer<typeof ModalTolerancePreference>;

/**
 * Strongly-typed view of `IntentProfile.global_preferences`.
 *
 * The profile schema keeps the field as a free-form record (keys may be added
 * by apps without a schema bump). This schema is the canonical contract the
 * compiler, components, and React renderer agree on for the well-known keys.
 * Use it via `GlobalPreferencesSchema.parse(...)` when you want a typed read
 * of the preferences without rejecting unknown keys (passthrough is enabled).
 */
export const GlobalPreferencesSchema = z
  .object({
    density: DensityPreference,
    color_mode: ColorModePreference,
    motion_preference: MotionPreference,
    automation_trust: AutomationTrustPreference,
    modal_tolerance: ModalTolerancePreference,
  })
  .partial()
  .passthrough();
export type GlobalPreferences = z.infer<typeof GlobalPreferencesSchema>;

/**
 * Cross-app workflow declaration. Lives in the user's vault, NOT the app's
 * registry — the user composes capabilities across apps for their own use.
 */
export const CrossAppWorkflowSchema = z.object({
  name: z.string().min(1),
  trigger: z.string().min(1),
  uses: z.array(z.string().min(1)),
});
export type CrossAppWorkflow = z.infer<typeof CrossAppWorkflowSchema>;

/**
 * Persistent intent profile — the user's "how I want software to behave" doc.
 */
export const IntentProfileSchema = z.object({
  user_id: UserId,
  /** Optional tenant scope. See `Manifest.tenant_id` for the model. */
  tenant_id: TenantId.optional(),
  profile_version: z.number().int().nonnegative(),
  updated_at: IsoDateTimeString,
  /** Free-form key/value preferences (`density`, `color_mode`, ...). */
  global_preferences: z.record(z.string(), z.unknown()),
  /** Per-domain "lens" selection — `email: founder_inbox`, etc. */
  lenses: z.record(z.string(), z.string()),
  rules: z.array(IntentRuleSchema),
  /** User-defined vocabulary — names, aliases, time references. */
  vocabulary: z.record(z.string(), z.unknown()),
  cross_app_workflows: z.array(CrossAppWorkflowSchema).optional(),
});
export type IntentProfile = z.infer<typeof IntentProfileSchema>;

/**
 * One per-conversation override. The compiler reads these on top of the
 * persistent profile; they do NOT write back to the vault unless the user
 * explicitly says "remember this."
 */
export const ConversationOverrideSchema = z.object({
  scope: z.string().min(1),
  rule: z.string().min(1),
  /** The turn number at which the override was set (for audit/replay). */
  set_at_turn: z.number().int().nonnegative(),
});
export type ConversationOverride = z.infer<typeof ConversationOverrideSchema>;

/**
 * Conversation-scoped intent overlay.
 *
 * From `/Users/vid/cir/docs/chat/conversation-artifacts.md` §Conversation
 * memory as intent slice.
 */
export const ConversationOverlaySchema = z.object({
  conversation_id: z.string().min(1),
  overrides: z.array(ConversationOverrideSchema),
  context_summary: z.string(),
});
export type ConversationOverlay = z.infer<typeof ConversationOverlaySchema>;
