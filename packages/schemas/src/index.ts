// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `@atelier/schemas` — public surface.
 *
 * All schema objects (`*Schema`) and inferred types are re-exported here.
 * Consumers can import either the runtime validator or the type alone:
 *
 *   import { CapabilitySchema, type Capability } from '@atelier/schemas';
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
// Capability index — Wave 10 / S-5 generated `_index.json` summary.
// -----------------------------------------------------------------------------
export {
  CAPABILITY_INDEX_GENERATED_AT_SENTINEL,
  CapabilityIndexEntrySchema,
  CapabilityIndexSchema,
  type CapabilityIndex,
  type CapabilityIndexEntry,
} from './capability-index.js';

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
// Manifest component contract (schema-validated per-binding prop shape)
// See ETHOS principle #7. Consumed by the runtime registry (opt-in field on
// `ComponentBinding`) and the `manifest_component_contract_satisfied`
// policy in `@atelier/policies`.
// -----------------------------------------------------------------------------
export {
  ManifestComponentContractSchema,
  ManifestComponentPropTypeSchema,
  type ManifestComponentContract,
  type ManifestComponentPropType,
} from './manifest-component-contract.js';

// -----------------------------------------------------------------------------
// Intent
// -----------------------------------------------------------------------------
export {
  AutomationTrustPreference,
  ColorModePreference,
  CompileBudgetSchema,
  ConversationOverlaySchema,
  ConversationOverrideSchema,
  CrossAppWorkflowSchema,
  DensityOverrideSchema,
  DensityPreference,
  GlobalPreferencesSchema,
  IntentProfileSchema,
  IntentRuleSchema,
  ModalTolerancePreference,
  MotionPreference,
  PriorityOverrideSchema,
  PriorityRuleSchema,
  type CompileBudget,
  type ConversationOverlay,
  type ConversationOverride,
  type CrossAppWorkflow,
  type DensityOverride,
  type GlobalPreferences,
  type IntentProfile,
  type IntentRule,
  type PriorityOverride,
  type PriorityRule,
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
// App outline — Wave C / Phase C-4 once-per-app pre-pass
// -----------------------------------------------------------------------------
export { AppOutlineSchema, NavEntrySchema, type AppOutline, type NavEntry } from './app-outline.js';

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
  BrandOpenTypeSchema,
  NotificationTokensSchema,
  ElevationLevelSchema,
  ElevationScaleSchema,
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
  type BrandOpenType,
  type NotificationTokens,
  type ElevationLevel,
  type ElevationScale,
  type ElevationKey,
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

// -----------------------------------------------------------------------------
// Marketplace primitives — Wave 8 / V-6
// `atelier://author/persona@version` addressing + ed25519-signed bundle envelope.
// See `/Users/vid/cir/docs/vault-protocol.md` §"Marketplace endpoints".
// -----------------------------------------------------------------------------
export {
  MarketplaceAddressSchema,
  MarketplaceAuthor,
  MarketplaceKeyId,
  MarketplacePersona,
  SignedBundleSchema,
  canonicalJsonStringify,
  formatMarketplaceAddress,
  parseMarketplaceAddress,
  signingInputForBundle,
  type MarketplaceAddress,
  type SignedBundle,
} from './marketplace.js';

// View definitions — Wave 11 / Cnt-10
export {
  ViewDefinitionSchema,
  ViewDisplaySchema,
  ViewFilterOpSchema,
  ViewFilterSchema,
  ViewSortSchema,
  type ViewDefinition,
  type ViewDisplay,
  type ViewFilter,
  type ViewFilterOp,
  type ViewSort,
} from './view-definition.js';
