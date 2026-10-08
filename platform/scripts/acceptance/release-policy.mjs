// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { createPublicKey } from 'node:crypto';
import { sha256 } from './binding.mjs';

export const EXTERNAL_KINDS = [
  'live-provider-matrix', 'generation-workflow', 'deployment', 'independent-security',
];
export const WORKFLOW_STAGES = [
  'architect', 'generate', 'compile', 'browser-certify', 'visual-review',
  'human-approve', 'publish', 'host-mount', 'host-query', 'exact-confirmation',
  'host-action', 'replay-rejected', 'uncertain-outcome', 'revoke',
];
export const DEPLOYMENT_CHECKS = [
  'image-scan', 'tls-origin', 'certifier-isolation', 'restore', 'key-rotation',
  'worker-recovery', 'rollback', 'retention', 'monitoring', 'load', 'documentation-review',
];

export function ensure(condition, code, message) {
  if (!condition) {
    const error = new Error(`${code}: ${message}`);
    error.code = code;
    throw error;
  }
}
export const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
export const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
export const digest = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const imageDigest = (value) => typeof value === 'string' && /^[a-z0-9][a-z0-9./:_-]*@sha256:[a-f0-9]{64}$/.test(value);

export function uniqueBy(items, field, code) {
  ensure(Array.isArray(items) && items.length > 0, code, `A nonempty ${field} list is required`);
  const ids = items.map((item) => item?.[field]);
  ensure(ids.every(nonempty) && new Set(ids).size === ids.length, code, `${field} values must be nonempty and unique`);
}

export function validateProviderConfigurations(providers) {
  uniqueBy(providers, 'id', 'RELEASE_POLICY_PROVIDERS');
  ensure(providers.length <= 32, 'RELEASE_POLICY_PROVIDERS', 'Provider acceptance is bounded to 32 exact configurations');
  for (const provider of providers) {
    ensure(['openai', 'anthropic', 'gemini', 'openai-compatible', 'claude-cli', 'codex-cli'].includes(provider.kind) &&
      nonempty(provider.model) && !['account-default', 'offline-fixture'].includes(provider.model),
    'RELEASE_POLICY_PROVIDERS', 'Every provider needs a supported kind and exact live model');
    ensure(provider.kind === 'claude-cli' ? ['low', 'medium', 'high', 'xhigh', 'max'].includes(provider.effort) : provider.effort === null,
      'RELEASE_POLICY_PROVIDERS', 'Declare Claude CLI effort explicitly; other current adapters require effort:null');
  }
  ensure(providers.some((p) => !p.kind.endsWith('-cli')) &&
    providers.some((p) => p.kind === 'claude-cli') && providers.some((p) => p.kind === 'codex-cli'),
  'RELEASE_POLICY_PROVIDERS', 'At least one API, Claude CLI, and Codex CLI boundary must be qualified');
  return providers;
}

/** Operator-owned trust configuration is separate from evidence. An evidence
 * report cannot nominate its own reviewer or lower its release thresholds. */
export function validateReleasePolicy(policy) {
  ensure(object(policy) && policy.schemaVersion === 1, 'RELEASE_POLICY', 'Expected release policy schemaVersion 1');
  ensure(Number.isFinite(policy.maxAgeHours) && policy.maxAgeHours > 0 && policy.maxAgeHours <= 720,
    'RELEASE_POLICY', 'maxAgeHours must be greater than zero and at most 720');
  ensure(Number.isInteger(policy.maxClockSkewSeconds) && policy.maxClockSkewSeconds >= 0 && policy.maxClockSkewSeconds <= 300,
    'RELEASE_POLICY', 'maxClockSkewSeconds must be between zero and 300');
  validateProviderConfigurations(policy.providers);
  uniqueBy(policy.workflows, 'id', 'RELEASE_POLICY_WORKFLOWS');
  for (const workflow of policy.workflows) {
    ensure(object(workflow.providers), 'RELEASE_POLICY_WORKFLOWS', 'Workflow provider routing is required');
    for (const stage of ['architect', 'generate', 'visual-review'])
      ensure(policy.providers.some((p) => p.id === workflow.providers[stage]),
        'RELEASE_POLICY_WORKFLOWS', `Workflow ${workflow.id} has no approved provider for ${stage}`);
  }
  ensure(object(policy.target) && nonempty(policy.target.environment) && imageDigest(policy.target.serviceImage) && imageDigest(policy.target.certifierImage),
    'RELEASE_POLICY_TARGET', 'An exact target environment and registry image digests are required');
  ensure(object(policy.target.recovery) && ['maxRpoSeconds', 'maxRtoSeconds'].every((key) => Number.isFinite(policy.target.recovery[key]) && policy.target.recovery[key] >= 0),
    'RELEASE_POLICY_TARGET', 'Explicit nonnegative recovery objectives are required');
  const load = policy.target.load;
  ensure(object(load) && ['concurrentUsers', 'sustainedMinutes', 'maxP95Ms'].every((key) => Number.isFinite(load[key]) && load[key] > 0) &&
    Number.isFinite(load.maxErrorRate) && load.maxErrorRate >= 0 && load.maxErrorRate < 1,
  'RELEASE_POLICY_TARGET', 'Explicit workload and latency/error limits are required');
  uniqueBy(policy.signers, 'id', 'RELEASE_POLICY_SIGNERS');
  const fingerprints = new Map();
  const identities = new Map();
  for (const signer of policy.signers) {
    ensure(['executor', 'security-reviewer'].includes(signer.role) && nonempty(signer.identity) && nonempty(signer.publicKeyPem),
      'RELEASE_POLICY_SIGNERS', 'A signer needs its role, identity, and trusted public key');
    const key = createPublicKey(signer.publicKeyPem);
    ensure(key.asymmetricKeyType === 'ed25519', 'RELEASE_POLICY_SIGNERS', 'Only Ed25519 evidence signatures are accepted');
    const fingerprint = sha256(key.export({ type: 'spki', format: 'der' }));
    ensure(!fingerprints.has(fingerprint), 'RELEASE_POLICY_SIGNERS', 'Each trusted key must have one distinct identity and role');
    fingerprints.set(fingerprint, signer.role);
    const identity = signer.identity.trim().toLowerCase();
    ensure(!identities.has(identity) || identities.get(identity) === signer.role,
      'RELEASE_POLICY_SIGNERS', 'Execution and independent review must have distinct trusted identities');
    identities.set(identity, signer.role);
  }
  ensure(policy.signers.some((s) => s.role === 'executor') && policy.signers.some((s) => s.role === 'security-reviewer'),
    'RELEASE_POLICY_SIGNERS', 'Both a trusted execution signer and a separate independent reviewer are required');
  return policy;
}
