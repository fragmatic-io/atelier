// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Core types for the policy engine.
 *
 * Policies are pure functions over `(manifest, capabilities, intent slice, ...)`.
 * They emit `PolicyViolation`s; the composer (`validateManifest`) aggregates
 * them into a single `PolicyResult`.
 *
 * The metadata on `NamedPolicy` mirrors the runtime `Policy` schema in
 * `@cir/schemas` — keep them aligned. See `/Users/vid/cir/docs/architecture.md`
 * §"Policy engine" for the baseline policy specs this package implements.
 */

import type { BrandKit, Capability, IntentProfile, Manifest } from '@cir/schemas';

/**
 * Severity of a policy violation.
 *  - `error`: blocks compilation; the compiler retries until satisfied.
 *  - `warn`:  records to audit but permits.
 *  - `info`:  non-blocking advisory. Used when the runtime supplies a
 *    sensible default and the policy only nudges authors toward an explicit
 *    override (Phase 2 #4 — resolver fallback contract).
 */
export type PolicySeverity = 'error' | 'warn' | 'info';

/**
 * Composition role a custom component plays for policy evaluation.
 *
 * Baseline catalog ids (`List`, `Table`, `Grid`) are always treated as their
 * nominal role. Hosts can register additional component ids here so the
 * composition policies (`composes_hierarchy_for_long_lists`,
 * `empty_loading_error_handled`) treat them equivalently — e.g. a custom
 * `<IssueQueue>` whose `compositionRole` is `'list'` is subject to the same
 * long-list hierarchy obligation as a bare `<List>`.
 *
 * The mechanism is strictly opt-in / additive — components without an entry
 * in the map are unaffected. Mirrors `CompositionRole` on `ComponentBinding`
 * (`@cir/runtime`); kept independent here so `@cir/policies` does not gain
 * a runtime dependency.
 *
 * Source: Wave 8 / E-A — see
 * `/Users/vid/cir/apps/demo-github/lib/component-bindings.ts`.
 */
export type CompositionRole = 'list' | 'grid' | 'table';

/**
 * One violation emitted by a policy.
 *
 * `path` is an RFC 6901 JSON Pointer rooted at the manifest object, so audit
 * tooling can deep-link into the offending node (e.g. `/routes/0/layout/children/2`).
 */
export interface PolicyViolation {
  policy_id: string;
  severity: PolicySeverity;
  message: string;
  /** JSON Pointer (RFC 6901) into the manifest where the violation was found. */
  path: string;
  /** Optional remediation hint surfaced in audit logs. */
  hint?: string;
}

/** Aggregate result of running one or many policies. */
export interface PolicyResult {
  ok: boolean;
  violations: PolicyViolation[];
}

/**
 * Context every policy receives.
 *
 * The compiler is responsible for resolving these inputs before invoking
 * the engine: capabilities looked up from the registry, intent slice fetched
 * from the user's vault, rate-limit metadata derived from capability declarations.
 */
export interface PolicyContext {
  /** The compiled manifest under evaluation. */
  manifest: Manifest;
  /** Capabilities this manifest references (resolved by the compiler). */
  capabilities: Record<string, Capability>;
  /** Slice of the user's intent profile relevant to this manifest. */
  intent: Pick<IntentProfile, 'user_id' | 'global_preferences'> & {
    /** Field paths the user has granted this app. Sourced from the vault. */
    granted_fields: string[];
  };
  /** Capability IDs that have rate limits declared. Set, not array. */
  rate_limited_capability_ids: ReadonlySet<string>;
  /** Field names considered PII for this app/tenant. */
  pii_fields: ReadonlySet<string>;
  /**
   * Optional brand kit. When supplied, the `respects_brand_kit` policy
   * checks layout props against the per-component variant whitelists and
   * flags inline raw colors / pixel values.
   */
  brand_kit?: BrandKit | undefined;
  /**
   * Optional map from custom component id to composition role. The
   * composition policies use this to treat host-registered custom bindings
   * as equivalent to the baseline component of the named role. Bindings
   * without an entry are unaffected. See `CompositionRole`.
   */
  composition_roles?: Readonly<Record<string, CompositionRole>> | undefined;
  /**
   * Phase 2 #4 — Resolver fallback contract.
   *
   * Set of component IDs whose bindings opt INTO the strict
   * empty/loading/error state-slot check. Bindings in this set continue to
   * raise an `error`-severity violation when the manifest omits a slot
   * (matching pre-Phase-2-#4 behavior). Bindings outside it raise an
   * `info`-severity hint instead — the renderer is expected to supply a
   * default `<EmptyState>` / `<Skeleton>` / `<Alert>` at runtime. Bindings
   * declare the opt-in via `ComponentBinding.requiresExplicitStateSlots`
   * (`@cir/runtime`); hosts thread the resulting set through here.
   */
  requires_explicit_state_slots?: ReadonlySet<string> | undefined;
}

/** A pure-function policy. */
export type Policy = (ctx: PolicyContext) => PolicyResult;

/**
 * A policy with descriptive metadata. The metadata fields mirror
 * `PolicySchema` in `@cir/schemas/src/policy.ts`.
 */
export interface NamedPolicy {
  id: string;
  description: string;
  applies_to: 'manifest' | 'action' | 'data';
  severity: PolicySeverity;
  evaluate: Policy;
}
