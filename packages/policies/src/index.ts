// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `@atelier/policies` — public surface.
 *
 * The compiler imports `validateManifest` and the baseline policies; the
 * runtime imports the `BehavioralPatternDetector` interface to plug its own
 * implementation in.
 *
 * See `/Users/vid/cir/docs/architecture.md` §"Policy engine" and
 * `/Users/vid/cir/docs/triggers.md` §"Behavioral triggers" for context.
 */

// -----------------------------------------------------------------------------
// Core types
// -----------------------------------------------------------------------------
export type {
  AmbientPolicySatisfier,
  CompositionRole,
  NamedPolicy,
  Policy,
  PolicyContext,
  PolicyResult,
  PolicySeverity,
  PolicyViolation,
} from './result.js';

// -----------------------------------------------------------------------------
// Composer + baseline
// -----------------------------------------------------------------------------
export { BASELINE_POLICIES, validateManifest, type ValidateOptions } from './validate.js';

// -----------------------------------------------------------------------------
// Custom-policy registration
// -----------------------------------------------------------------------------
export { PolicyRegistry } from './registry.js';

// -----------------------------------------------------------------------------
// Individual baseline policies (re-exported for granular composition)
// -----------------------------------------------------------------------------
export { actionsMatchActionSlots } from './baseline/actions_match_action_slots.js';
export {
  composesHierarchyForLongLists,
  VIRTUAL_THRESHOLD,
} from './baseline/composes_hierarchy_for_long_lists.js';
export {
  DEFAULT_SALIENCE_LEVEL,
  matchCapabilityGlob,
  resolveSalience,
  salienceResolved,
  type SalienceLevel,
} from './baseline/salience.js';
export { dataAccessWithinGrant } from './baseline/data_access_within_grant.js';
export {
  confirmationRequiredForDestructive,
  DESTRUCTIVE_SIDE_EFFECTS,
} from './baseline/confirmation_required_for_destructive.js';
export { emptyLoadingErrorHandled } from './baseline/empty_loading_error_handled.js';
export { manifestComponentContractSatisfied } from './baseline/manifest_component_contract_satisfied.js';
export { noPiiInQueryStrings } from './baseline/no_pii_in_query_strings.js';
export { rateLimitedActionsShowState } from './baseline/rate_limited_actions_show_state.js';
export { reversibilitySurfaced } from './baseline/reversibility_surfaced.js';
export { respectsBrandKit } from './baseline/respects_brand_kit.js';
export {
  composesAccordingTo,
  type CompositionRule,
  type CompositionRules,
} from './baseline/composition_rules.js';
export {
  ambientCovers,
  rateLimitChipSatisfier,
  undoToastSatisfier,
  RATE_LIMIT_CHIP_AMBIENT_SATISFIER,
  UNDO_TOAST_AMBIENT_SATISFIER,
} from './baseline/ambient-satisfiers.js';

// -----------------------------------------------------------------------------
// Internal helpers (exported so downstream policy authors can reuse them)
// -----------------------------------------------------------------------------
export {
  collectLayoutNodes,
  escapeJsonPointerSegment,
  walkLayout,
  walkManifest,
  type LayoutVisitor,
} from './internal/walk-layout.js';

// -----------------------------------------------------------------------------
// Behavioral pattern detector (Phase 4 plug-point)
// -----------------------------------------------------------------------------
export {
  NoopBehavioralDetector,
  type BehavioralPatternDetector,
  type DetectedPattern,
  type ObservedAction,
} from './behavioral/detector.js';
export { SequenceDetector, type SequenceDetectorOptions } from './behavioral/sequence-detector.js';
