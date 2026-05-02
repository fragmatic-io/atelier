// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
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
 * store any preference; these enums document the SHAPE that `@atelier/components`,
 * `@atelier/compiler`, and `@atelier/react` honour today. Values outside the enums are
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
 * Per-user compile cost budget. Bound to the intent profile because budgets
 * belong to the user (per ETHOS principle 3 — intent is the user's, and so
 * are the limits on what can be spent on their behalf). An app cannot widen
 * a user's budget; only the user can.
 *
 * `max_tokens_per_day` and `max_calls_per_hour` are independent: the meter
 * blocks on whichever fires first. Both fields are optional — omit either
 * to disable that axis. Day rollover is at 00:00:00 UTC; hour rollover on
 * the hour. UTC keeps deployments comparable across regions; if you need
 * a per-tenant local-time window that's a host-side concern (you'd build
 * it on top of the meter, not inside it).
 *
 * `on_exhausted: 'fall_through'` is the sane default for a CompositeCompiler
 * stack: when the LLM-backed compiler's budget is blown, fall through to a
 * deterministic FallbackCompiler so the user still sees their app. Pick
 * `'fail'` only if you'd rather surface the error than serve a stale or
 * generic UI.
 */
export const CompileBudgetSchema = z.object({
  /** Hard cap on tokens consumed by compile calls per UTC day. */
  max_tokens_per_day: z.number().int().nonnegative().optional(),
  /** Hard cap on compile invocations per UTC hour (rate limit). */
  max_calls_per_hour: z.number().int().nonnegative().optional(),
  /**
   * Soft cap on tokens any single compile may consume. The wrapper
   * (`BudgetMeteredCompiler`) cannot pre-empt the LLM mid-call, so this is
   * checked AFTER the compile returns. Exceeding it logs a warning via
   * `onExceeded` (and emits `compile.budget_exceeded` with
   * `code: 'tokens_per_call'`) but does not retroactively reject the
   * manifest. Use it to detect prompt-budget regressions early.
   */
  max_tokens_per_call: z.number().int().nonnegative().optional(),
  /**
   * What to do when the budget is exhausted.
   * - `'fall_through'`: skip this compiler and try the next one in the
   *   composite (preserves availability with a degraded result).
   * - `'fail'`: throw `CompilerBudgetExhaustedError` immediately so the
   *   caller can surface the error.
   */
  on_exhausted: z.enum(['fall_through', 'fail']).default('fall_through'),
});
export type CompileBudget = z.infer<typeof CompileBudgetSchema>;

/**
 * One priority-weighting rule. The compiler combines these with each
 * capability's `salience_default` expression to weight items in long lists
 * (lists/tables/grids) so the most important items receive emphasis treatment.
 *
 * Shape:
 * - `domain`: the capability's domain (e.g. `'github'`, `'email'`) or `'*'`
 *   for any domain.
 * - `signal`: the signal name the user is weighting. Aligned with the
 *   well-known set the hierarchy reasoner understands.
 * - `weight`: 0–1 multiplier applied to the signal's contribution. Defaults
 *   to 1.0 when omitted (i.e. honour the capability's expression as-is).
 *
 * Example: a user who says "urgency × 0.5 in github" stores
 * `{ domain: 'github', signal: 'urgency', weight: 0.5 }`. The compiler then
 * derives a per-item score from the GitHub capability's `salience_default`
 * with the urgency contribution halved relative to other signals.
 */
export const PriorityRuleSchema = z.object({
  domain: z.string().min(1),
  signal: z.enum(['urgency', 'recency', 'unread', 'assigned_to_me', 'starred', 'due_date']),
  weight: z.number().min(0).max(1).optional(),
});
export type PriorityRule = z.infer<typeof PriorityRuleSchema>;

/**
 * Wave 7 / P-9 — categorical salience override.
 *
 * Where `priority_rules` weights signals WITHIN a capability's
 * `salience_default` expression, `priority_overrides` re-classifies the
 * capability ITSELF — bumping (or lowering) the level the user sees for a
 * matching capability id. A glob pattern matches one or many capabilities;
 * the first matching rule wins.
 *
 * Example: a user who marks all PRs as priority during onboarding stores
 * `{ capability_pattern: 'github.pr.*', salience: 'high', reason: 'user
 * marked all PRs as priority in onboarding' }`. The data resolver then
 * promotes rows from `github.pr.list` to `emphasis: 'high'` regardless of
 * the capability's own `salience_level`.
 *
 * Pattern syntax: shell-style globs over the capability id. `*` matches one
 * id segment, `**` matches any (including `.`); literal segments match
 * exactly. Authoritative matcher: `matchCapabilityGlob` in
 * `@atelier/policies/baseline/salience`.
 */
export const PriorityOverrideSchema = z.object({
  capability_pattern: z.string().min(1),
  salience: z.enum(['high', 'normal', 'low']),
  reason: z.string().min(1).optional(),
});
export type PriorityOverride = z.infer<typeof PriorityOverrideSchema>;

/**
 * Wave 11 / Vis-6 — per-surface density override.
 *
 * Where `global_preferences.density` is the user's GLOBAL density signal,
 * `density_overrides` is the per-surface escape hatch — a route-pattern glob
 * with a forced density that takes precedence over the global preference for
 * matching routes. Designed for the "admin tables stay compact even though I
 * prefer comfortable everywhere else" / "onboarding stays spacious even
 * though I'm a power user" pattern Stripe + Linear ship.
 *
 * Pattern syntax: shell-style globs over the route path. `*` matches one
 * path segment, `**` matches any (including `/`); literal segments match
 * exactly. The first matching rule wins.
 *
 * Example: `{ route_pattern: '/admin/*', density: 'compact',
 * reason: 'admin power-user surface' }` matches `/admin/queues` but not
 * `/admin/queues/123` (use `'/admin/**'` for that).
 *
 * Authoritative matcher: `matchRouteGlob` in
 * `@atelier/components/density-resolver`. The render walker calls
 * `resolveDensity(intent, route)` once per route and threads the result
 * to every density-aware component.
 */
export const DensityOverrideSchema = z.object({
  route_pattern: z.string().min(1),
  density: DensityPreference,
  reason: z.string().min(1).optional(),
});
export type DensityOverride = z.infer<typeof DensityOverrideSchema>;

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
  /**
   * Optional compile cost budget. When set, the host should wire a
   * `BudgetMeter` (from `@atelier/compiler`) into the `CompositeCompiler` so
   * spend is enforced. Omitted means unlimited (i.e. no enforcement).
   */
  compile_budget: CompileBudgetSchema.optional(),
  /**
   * Optional information-hierarchy weighting. Each rule modifies the
   * weight a signal contributes to a capability's `salience_default`
   * expression in the matching domain. The compiler's hierarchy reasoner
   * uses these to decide which list/table items get top-of-fold emphasis.
   * Omitted means "honour every capability's defaults".
   */
  priority_rules: z.array(PriorityRuleSchema).optional(),
  /**
   * Wave 7 / P-9 — categorical salience overrides. Each rule maps a
   * capability-id glob to a salience level that takes precedence over the
   * capability's own `salience_level`. The first matching override wins;
   * unmatched capabilities fall back to their declared level.
   */
  priority_overrides: z.array(PriorityOverrideSchema).optional(),
  /**
   * Wave 11 / Vis-6 — per-surface density overrides. Each rule maps a
   * route-pattern glob to a forced density that takes precedence over the
   * global density preference for matching routes. The first matching rule
   * wins; unmatched routes fall back to `global_preferences.density` (or
   * the framework default `'comfortable'`).
   */
  density_overrides: z.array(DensityOverrideSchema).optional(),
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
