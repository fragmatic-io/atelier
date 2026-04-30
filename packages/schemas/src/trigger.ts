// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Trigger schema — the events that invalidate manifests and drive
 * recompilation.
 *
 * Mirrors the taxonomy in `/Users/vid/cir/docs/triggers.md` and the chat-
 * specific extensions in `/Users/vid/cir/docs/chat/triggers.md`. Each trigger
 * is a discriminated union member tagged on `type`.
 *
 * The runtime emits triggers; the trigger bus routes them; the manifest
 * store invalidates affected cache entries. See `/Users/vid/cir/docs/architecture.md`
 * §Trigger Bus.
 */

import { z } from 'zod';
import {
  AppId,
  CapabilityId,
  ComponentId,
  ManifestId,
  SemverString,
  SkillId,
  UserId,
} from './common.js';

// -----------------------------------------------------------------------------
// Schema triggers (app-emitted)
// -----------------------------------------------------------------------------

const SchemaVersionDelta = z.object({
  app_id: AppId,
  old_v: SemverString.optional(),
  new_v: SemverString.optional(),
});

export const CapabilityAddedTrigger = SchemaVersionDelta.extend({
  type: z.literal('capability.added'),
  capability_id: CapabilityId,
});
export const CapabilityChangedTrigger = SchemaVersionDelta.extend({
  type: z.literal('capability.changed'),
  capability_id: CapabilityId,
});
export const CapabilityRemovedTrigger = SchemaVersionDelta.extend({
  type: z.literal('capability.removed'),
  capability_id: CapabilityId,
});
export const CapabilityVersionBumpedTrigger = SchemaVersionDelta.extend({
  type: z.literal('capability.version_bumped'),
  capability_id: CapabilityId,
});

export const ComponentAddedTrigger = SchemaVersionDelta.extend({
  type: z.literal('component.added'),
  component_id: ComponentId,
});
export const ComponentChangedTrigger = SchemaVersionDelta.extend({
  type: z.literal('component.changed'),
  component_id: ComponentId,
});
export const ComponentRemovedTrigger = SchemaVersionDelta.extend({
  type: z.literal('component.removed'),
  component_id: ComponentId,
});
export const ComponentVersionBumpedTrigger = SchemaVersionDelta.extend({
  type: z.literal('component.version_bumped'),
  component_id: ComponentId,
});

export const SkillAddedTrigger = SchemaVersionDelta.extend({
  type: z.literal('skill.added'),
  skill_id: SkillId,
});
export const SkillChangedTrigger = SchemaVersionDelta.extend({
  type: z.literal('skill.changed'),
  skill_id: SkillId,
});
export const SkillRemovedTrigger = SchemaVersionDelta.extend({
  type: z.literal('skill.removed'),
  skill_id: SkillId,
});
export const SkillVersionBumpedTrigger = SchemaVersionDelta.extend({
  type: z.literal('skill.version_bumped'),
  skill_id: SkillId,
});

export const PolicyChangedTrigger = z.object({
  type: z.literal('policy.changed'),
  app_id: AppId,
  rule_id: z.string().min(1),
});

// -----------------------------------------------------------------------------
// Intent triggers (user-emitted)
// -----------------------------------------------------------------------------

export const IntentPreferenceChangedTrigger = z.object({
  type: z.literal('intent.preference_changed'),
  user_id: UserId,
  scope: z.string().min(1),
});
export const IntentLensSwitchedTrigger = z.object({
  type: z.literal('intent.lens_switched'),
  user_id: UserId,
  app: AppId,
  lens: z.string().min(1),
});
export const IntentRuleAddedTrigger = z.object({
  type: z.literal('intent.rule_added'),
  user_id: UserId,
  scope: z.string().min(1),
  rule: z.string().min(1),
});
export const IntentRuleRemovedTrigger = z.object({
  type: z.literal('intent.rule_removed'),
  user_id: UserId,
  scope: z.string().min(1),
  rule: z.string().min(1),
});
export const IntentRuleModifiedTrigger = z.object({
  type: z.literal('intent.rule_modified'),
  user_id: UserId,
  scope: z.string().min(1),
  old_rule: z.string().min(1),
  new_rule: z.string().min(1),
});
export const IntentVocabularyUpdatedTrigger = z.object({
  type: z.literal('intent.vocabulary_updated'),
  user_id: UserId,
});

// -----------------------------------------------------------------------------
// Behavioral triggers (system-detected)
// -----------------------------------------------------------------------------

export const BehaviorWorkaroundDetectedTrigger = z.object({
  type: z.literal('behavior.workaround_detected'),
  user_id: UserId,
  app_id: AppId,
  pattern: z.string().min(1),
  occurrences: z.number().int().min(1),
  proposed_capability: CapabilityId.optional(),
  proposed_recompile: z.array(z.string()).optional(),
});

/**
 * `behavior.pattern_detected` — emitted by the runtime's behavioral pattern
 * detector (see `@cir/policies/SequenceDetector`) when N users converge on
 * the same action sequence often enough to merit promotion to a recipe.
 * Distinct from `behavior.workaround_detected` (single user finding a hacky
 * way around a missing feature) — patterns are POSITIVE signals worth
 * promoting; workarounds are signals of MISSING features.
 */
export const BehaviorPatternDetectedTrigger = z.object({
  type: z.literal('behavior.pattern_detected'),
  /** Optional — pattern detection often aggregates across users. */
  user_id: UserId.optional(),
  app_id: AppId.optional(),
  pattern_id: z.string().regex(/^seq_[a-z0-9]+$/),
  description: z.string().min(1),
  capability_ids: z.array(CapabilityId),
  occurrences: z.number().int().nonnegative(),
  distinct_users: z.number().int().nonnegative(),
});
export const BehaviorFeatureUnusedTrigger = z.object({
  type: z.literal('behavior.feature_unused'),
  user_id: UserId,
  app_id: AppId,
  feature: z.string().min(1),
  unused_pct: z.number().min(0).max(100),
});
export const BehaviorErrorPatternTrigger = z.object({
  type: z.literal('behavior.error_pattern'),
  user_id: UserId,
  app_id: AppId,
  pattern: z.string().min(1),
});

// -----------------------------------------------------------------------------
// Explicit triggers (user-initiated)
// -----------------------------------------------------------------------------

export const UserRecompileRouteTrigger = z.object({
  type: z.literal('user.recompile_route'),
  user_id: UserId,
  route: z.string().min(1),
});
export const UserRecompileAllTrigger = z.object({
  type: z.literal('user.recompile_all'),
  user_id: UserId,
});
export const UserRevertManifestTrigger = z.object({
  type: z.literal('user.revert_manifest'),
  user_id: UserId,
  manifest_id: ManifestId,
});
export const UserTryLensTrigger = z.object({
  type: z.literal('user.try_lens'),
  user_id: UserId,
  lens_name: z.string().min(1),
});

// -----------------------------------------------------------------------------
// System triggers (rare)
// -----------------------------------------------------------------------------

export const SystemCompilerUpgradedTrigger = z.object({
  type: z.literal('system.compiler_upgraded'),
  old_v: SemverString,
  new_v: SemverString,
});
export const SystemSecurityRevocationTrigger = z.object({
  type: z.literal('system.security_revocation'),
  capability_id: CapabilityId.optional(),
  app_id: AppId,
  reason: z.string().min(1),
});

// -----------------------------------------------------------------------------
// Chat-specific triggers (`/Users/vid/cir/docs/chat/triggers.md`)
// -----------------------------------------------------------------------------

/** Turn classifier output: continue | extend | modify | replace | clarify. */
export const TurnClassification = z.enum(['continue', 'extend', 'modify', 'replace', 'clarify']);
export type TurnClassification = z.infer<typeof TurnClassification>;

export const TurnClassifiedTrigger = z.object({
  type: z.literal('turn.classified'),
  conversation_id: z.string().min(1),
  turn: z.number().int().nonnegative(),
  classification: TurnClassification,
});

export const ToolResultChangedDataShapeTrigger = z.object({
  type: z.literal('tool.result_changed_data_shape'),
  capability_id: CapabilityId,
  conversation_id: z.string().min(1),
  /** Free-form description of the shape change (e.g. `volume`, `error`, `rate_limit`). */
  reason: z.string().min(1),
});

export const TopicShiftedTrigger = z.object({
  type: z.literal('topic.shifted'),
  conversation_id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
});

export const ContextThresholdReachedTrigger = z.object({
  type: z.literal('context.threshold_reached'),
  conversation_id: z.string().min(1),
  /** Pct of the host context window in use. */
  pct_used: z.number().min(0).max(100),
});

export const SubAgentResultEmittedTrigger = z.object({
  type: z.literal('subagent.result_emitted'),
  conversation_id: z.string().min(1),
  agent_id: z.string().min(1),
  /** Reference to a manifest fragment the parent should incorporate. */
  manifest_fragment_id: z.string().optional(),
});

export const ScheduleFiredTrigger = z.object({
  type: z.literal('schedule.fired'),
  schedule_id: z.string().min(1),
  user_id: UserId,
  /** ISO datetime the schedule fired. */
  fired_at: z.string(),
});

// -----------------------------------------------------------------------------
// Discriminated union
// -----------------------------------------------------------------------------

export const TriggerSchema = z.discriminatedUnion('type', [
  // schema
  CapabilityAddedTrigger,
  CapabilityChangedTrigger,
  CapabilityRemovedTrigger,
  CapabilityVersionBumpedTrigger,
  ComponentAddedTrigger,
  ComponentChangedTrigger,
  ComponentRemovedTrigger,
  ComponentVersionBumpedTrigger,
  SkillAddedTrigger,
  SkillChangedTrigger,
  SkillRemovedTrigger,
  SkillVersionBumpedTrigger,
  PolicyChangedTrigger,
  // intent
  IntentPreferenceChangedTrigger,
  IntentLensSwitchedTrigger,
  IntentRuleAddedTrigger,
  IntentRuleRemovedTrigger,
  IntentRuleModifiedTrigger,
  IntentVocabularyUpdatedTrigger,
  // behavioral
  BehaviorWorkaroundDetectedTrigger,
  BehaviorPatternDetectedTrigger,
  BehaviorFeatureUnusedTrigger,
  BehaviorErrorPatternTrigger,
  // explicit
  UserRecompileRouteTrigger,
  UserRecompileAllTrigger,
  UserRevertManifestTrigger,
  UserTryLensTrigger,
  // system
  SystemCompilerUpgradedTrigger,
  SystemSecurityRevocationTrigger,
  // chat
  TurnClassifiedTrigger,
  ToolResultChangedDataShapeTrigger,
  TopicShiftedTrigger,
  ContextThresholdReachedTrigger,
  SubAgentResultEmittedTrigger,
  ScheduleFiredTrigger,
]);

/** Inferred type for any trigger. */
export type Trigger = z.infer<typeof TriggerSchema>;
