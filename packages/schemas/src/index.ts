// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * `@cir/schemas` — public surface.
 *
 * All schema objects (`*Schema`) and inferred types are re-exported here.
 * Consumers can import either the runtime validator or the type alone:
 *
 *   import { CapabilitySchema, type Capability } from '@cir/schemas';
 *
 * See `/Users/vid/cir/docs/artifacts.md` for the canonical examples each
 * schema mirrors.
 */

// -----------------------------------------------------------------------------
// Common primitives (semver, identifiers, datetime, enums)
// -----------------------------------------------------------------------------
export {
  AppId,
  CapabilityId,
  ComponentId,
  ConfirmationLevel,
  DEFAULT_TENANT_ID,
  EventId,
  IsoDateTimeString,
  ManifestId,
  RateLimitString,
  SemverString,
  SkillId,
  TenantId,
  UserId,
} from './common.js';

// -----------------------------------------------------------------------------
// Capability
// -----------------------------------------------------------------------------
export {
  CapabilityIOSchema,
  CapabilitySchema,
  KNOWN_SIDE_EFFECTS,
  Permission,
  ReviewEnvelopeSchema,
  SideEffect,
  type Capability,
  type ReviewEnvelope,
} from './capability.js';

// -----------------------------------------------------------------------------
// Skill
// -----------------------------------------------------------------------------
export { SkillSchema, type Skill } from './skill.js';
export { parseSkillMarkdown, type ParsedSkill } from './skill-parser.js';

// -----------------------------------------------------------------------------
// Component catalog
// -----------------------------------------------------------------------------
export {
  ComponentDefinitionSchema,
  ComponentRegistrySchema,
  CompositionRuleSchema,
  CompositionRulesSchema,
  type ComponentDefinition,
  type ComponentRegistry,
  type CompositionRule,
  type CompositionRules,
} from './component.js';

// -----------------------------------------------------------------------------
// Intent
// -----------------------------------------------------------------------------
export {
  AutomationTrustPreference,
  ColorModePreference,
  ConversationOverlaySchema,
  ConversationOverrideSchema,
  CrossAppWorkflowSchema,
  DensityPreference,
  GlobalPreferencesSchema,
  IntentProfileSchema,
  IntentRuleSchema,
  ModalTolerancePreference,
  MotionPreference,
  type ConversationOverlay,
  type ConversationOverride,
  type CrossAppWorkflow,
  type GlobalPreferences,
  type IntentProfile,
  type IntentRule,
} from './intent.js';

// -----------------------------------------------------------------------------
// Trigger (discriminated union)
// -----------------------------------------------------------------------------
export {
  BehaviorErrorPatternTrigger,
  BehaviorFeatureUnusedTrigger,
  BehaviorWorkaroundDetectedTrigger,
  CapabilityAddedTrigger,
  CapabilityChangedTrigger,
  CapabilityRemovedTrigger,
  CapabilityVersionBumpedTrigger,
  ComponentAddedTrigger,
  ComponentChangedTrigger,
  ComponentRemovedTrigger,
  ComponentVersionBumpedTrigger,
  ContextThresholdReachedTrigger,
  IntentLensSwitchedTrigger,
  IntentPreferenceChangedTrigger,
  IntentRuleAddedTrigger,
  IntentRuleModifiedTrigger,
  IntentRuleRemovedTrigger,
  IntentVocabularyUpdatedTrigger,
  PolicyChangedTrigger,
  ScheduleFiredTrigger,
  SkillAddedTrigger,
  SkillChangedTrigger,
  SkillRemovedTrigger,
  SkillVersionBumpedTrigger,
  SubAgentResultEmittedTrigger,
  SystemCompilerUpgradedTrigger,
  SystemSecurityRevocationTrigger,
  ToolResultChangedDataShapeTrigger,
  TopicShiftedTrigger,
  TriggerSchema,
  TurnClassification,
  TurnClassifiedTrigger,
  UserRecompileAllTrigger,
  UserRecompileRouteTrigger,
  UserRevertManifestTrigger,
  UserTryLensTrigger,
  type Trigger,
} from './trigger.js';

// -----------------------------------------------------------------------------
// Manifest (+ chat: TurnDelta, ThreadManifest)
// -----------------------------------------------------------------------------
export {
  CompiledFromSchema,
  ComponentDataBindingSchema,
  LayoutNodeSchema,
  ManifestSchema,
  RouteRefreshSchema,
  RouteSchema,
  ThreadManifestSchema,
  ThreadStepSchema,
  TurnDeltaChangeSchema,
  TurnDeltaSchema,
  type CompiledFrom,
  type ComponentDataBinding,
  type LayoutNode,
  type Manifest,
  type Route,
  type RouteRefresh,
  type ThreadManifest,
  type ThreadStep,
  type TurnDelta,
  type TurnDeltaChange,
} from './manifest.js';

// -----------------------------------------------------------------------------
// Policy
// -----------------------------------------------------------------------------
export { PolicySchema, type Policy } from './policy.js';

// -----------------------------------------------------------------------------
// Brand kit (design system)
// -----------------------------------------------------------------------------
export {
  BrandKitSchema,
  BrandTokensSchema,
  BrandVariantsSchema,
  BrandVoiceSchema,
  BrandVoiceSurfaceSchema,
  BrandRadiusScaleSchema,
  BrandShadowScaleSchema,
  BrandMotionSchema,
  BrandIconographySchema,
  BrandAccessibilitySchema,
  type BrandKit,
  type BrandTokens,
  type BrandVariants,
  type BrandVoice,
  type BrandVoiceSurface,
  type BrandRadiusScale,
  type BrandShadowScale,
  type BrandMotion,
  type BrandIconography,
  type BrandAccessibility,
} from './brand-kit.js';

// -----------------------------------------------------------------------------
// Audit
// -----------------------------------------------------------------------------
export {
  AuditEventSchema,
  AuditEventType,
  PolicyEvaluationSchema,
  type AuditEvent,
  type PolicyEvaluation,
} from './audit.js';

// -----------------------------------------------------------------------------
// JSON Schema codegen
// -----------------------------------------------------------------------------
export { toJsonSchema, type ToJsonSchemaOptions } from './json-schema.js';
