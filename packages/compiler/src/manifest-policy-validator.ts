// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Baseline manifest validator factory.
 *
 * Production hosts should not have to hand-roll the same
 * `validateManifest({ manifest, capabilities, intent, ... })` bridge in every
 * route. This helper turns host policy context into the `ManifestValidator`
 * shape `ServerManifestResolver` and `ToolUsingCompiler` already consume.
 */

import type { AuditEvent, BrandKit, Capability, IntentProfile, Manifest } from '@atelier/schemas';
import {
  BASELINE_POLICIES,
  validateManifest,
  type AmbientPolicySatisfier,
  type CompositionRole,
  type NamedPolicy,
} from '@atelier/policies';
import type { CompileInput } from './types.js';
import type { ManifestValidator, ManifestValidationResult } from './server-resolver.js';

type MaybeFactory<T> = T | ((input: CompileInput, manifest: Manifest) => T);

function valueOf<T>(value: MaybeFactory<T>, input: CompileInput, manifest: Manifest): T {
  return typeof value === 'function'
    ? (value as (input: CompileInput, manifest: Manifest) => T)(input, manifest)
    : value;
}

function defaultIntent(input: CompileInput): Pick<IntentProfile, 'user_id' | 'global_preferences'> {
  return {
    user_id: input.intent?.user_id ?? input.user_id,
    global_preferences: input.intent?.global_preferences ?? {},
  };
}

function defaultRateLimitedCapabilities(
  capabilities: Record<string, Capability>,
): ReadonlySet<string> {
  const ids = Object.entries(capabilities)
    .filter(([, capability]) => Boolean(capability.rate_limit))
    .map(([id]) => id);
  return new Set(ids);
}

function evaluationsFor(
  policies: readonly NamedPolicy[],
  violations: readonly { policy_id: string; message: string }[],
): AuditEvent['policy_evaluations'] {
  return policies.map((policy) => {
    const messages = violations
      .filter((violation) => violation.policy_id === policy.id)
      .map((violation) => violation.message);
    return messages.length === 0
      ? { policy_id: policy.id, passed: true }
      : { policy_id: policy.id, passed: false, detail: messages.join('; ') };
  });
}

export interface BaselineManifestValidatorOptions {
  /**
   * Fields this app is allowed to expose for the current user. Required
   * because data grants live in the user's vault and cannot be inferred from
   * the framework-level compile input.
   */
  grantedFields: MaybeFactory<readonly string[]>;
  /** Fields considered PII for this app/tenant. Defaults to none. */
  piiFields?: MaybeFactory<ReadonlySet<string> | readonly string[]>;
  /** Override capability lookup. Defaults to `input.capabilities`. */
  capabilities?: MaybeFactory<Record<string, Capability>>;
  /** Override the policy intent slice. Defaults to input intent/user id. */
  intent?: MaybeFactory<Pick<IntentProfile, 'user_id' | 'global_preferences'>>;
  /** Override rate-limited capability ids. Defaults to capabilities with `rate_limit`. */
  rateLimitedCapabilityIds?: MaybeFactory<ReadonlySet<string> | readonly string[]>;
  /** Brand kit to enforce. Defaults to `input.brandKit`. */
  brandKit?: MaybeFactory<BrandKit | undefined>;
  /** Baseline + any custom policies. Defaults to `BASELINE_POLICIES`. */
  policies?: readonly NamedPolicy[];
  /** Treat warnings as validation failures. Defaults to false. */
  strict?: boolean;
  compositionRoles?: MaybeFactory<Readonly<Record<string, CompositionRole>> | undefined>;
  requiresExplicitStateSlots?: MaybeFactory<ReadonlySet<string> | readonly string[] | undefined>;
  actionSlots?: MaybeFactory<Readonly<Record<string, readonly string[]>> | undefined>;
  ambientPolicySatisfiers?: MaybeFactory<readonly AmbientPolicySatisfier[] | undefined>;
}

function toSet(value: ReadonlySet<string> | readonly string[] | undefined): ReadonlySet<string> {
  return value instanceof Set ? value : new Set(value ?? []);
}

export function createBaselineManifestValidator(
  options: BaselineManifestValidatorOptions,
): ManifestValidator {
  const policies = options.policies ?? BASELINE_POLICIES;

  return (manifest: Manifest, input: CompileInput): ManifestValidationResult => {
    const capabilities = options.capabilities
      ? valueOf(options.capabilities, input, manifest)
      : input.capabilities;
    const result = validateManifest(
      {
        manifest,
        capabilities,
        intent: {
          ...(options.intent ? valueOf(options.intent, input, manifest) : defaultIntent(input)),
          granted_fields: [...valueOf(options.grantedFields, input, manifest)],
        },
        rate_limited_capability_ids: toSet(
          options.rateLimitedCapabilityIds
            ? valueOf(options.rateLimitedCapabilityIds, input, manifest)
            : defaultRateLimitedCapabilities(capabilities),
        ),
        pii_fields: toSet(
          options.piiFields ? valueOf(options.piiFields, input, manifest) : undefined,
        ),
        brand_kit: options.brandKit ? valueOf(options.brandKit, input, manifest) : input.brandKit,
        composition_roles: options.compositionRoles
          ? valueOf(options.compositionRoles, input, manifest)
          : undefined,
        requires_explicit_state_slots: toSet(
          options.requiresExplicitStateSlots
            ? valueOf(options.requiresExplicitStateSlots, input, manifest)
            : undefined,
        ),
        action_slots: options.actionSlots
          ? valueOf(options.actionSlots, input, manifest)
          : undefined,
        ambient_policy_satisfiers: options.ambientPolicySatisfiers
          ? valueOf(options.ambientPolicySatisfiers, input, manifest)
          : undefined,
      },
      {
        policies,
        ...(options.strict !== undefined ? { strict: options.strict } : {}),
      },
    );

    return {
      ok: result.ok,
      reasons: result.violations.map((violation) => violation.message),
      policy_evaluations: evaluationsFor(policies, result.violations),
    };
  };
}
