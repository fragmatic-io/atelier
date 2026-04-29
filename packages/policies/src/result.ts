// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
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

/** Severity of a policy violation. `error` blocks; `warn` records but permits. */
export type PolicySeverity = 'error' | 'warn';

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
