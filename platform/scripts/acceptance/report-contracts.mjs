// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { sameBinding } from './binding.mjs';
import { DEPLOYMENT_CHECKS, WORKFLOW_STAGES, ensure, nonempty, object, uniqueBy } from './release-policy.mjs';

export function validateBinding(binding) {
  ensure(object(binding) && binding.schemaVersion === 1 && binding.clean === true,
    'EVIDENCE_SOURCE', 'Release evidence requires a clean committed source binding');
  ensure(/^[a-f0-9]{40,64}$/.test(binding.gitCommit) && /^[a-f0-9]{40,64}$/.test(binding.gitTree) &&
    /^[a-f0-9]{64}$/.test(binding.sourceTreeSha256) && /^[a-f0-9]{64}$/.test(binding.packageLockSha256),
  'EVIDENCE_SOURCE', 'Commit, Git tree, source digest, and lock digest are required');
  const toolchain = binding.toolchain;
  ensure(object(toolchain) && ['node', 'npm', 'platform', 'arch', 'python', 'playwright'].every((key) => nonempty(toolchain[key])) &&
    object(toolchain.packages) && ['typescript', 'esbuild', 'react', 'ajv', 'axe-core'].every((key) => nonempty(toolchain.packages[key])),
  'EVIDENCE_TOOLCHAIN', 'Exact Node/npm/browser/compiler toolchain versions are required');
}

export function validateTimestamp(generatedAt, policy, now) {
  const timestamp = typeof generatedAt === 'string' ? Date.parse(generatedAt) : NaN;
  ensure(Number.isFinite(timestamp) && /^\d{4}-\d\d-\d\dT/.test(generatedAt), 'EVIDENCE_TIME', 'An ISO generation time is required');
  ensure(timestamp <= now + policy.maxClockSkewSeconds * 1000, 'EVIDENCE_FUTURE', 'Evidence is dated in the future');
  ensure(now - timestamp <= policy.maxAgeHours * 3_600_000, 'EVIDENCE_STALE', 'Evidence has exceeded the operator freshness limit');
}

function checks(items, required, artifactPaths, code) {
  uniqueBy(items, 'id', code);
  for (const id of required) {
    const item = items.find((candidate) => candidate.id === id);
    ensure(item?.status === 'passed', code, `Missing or unsuccessful check: ${id}`);
    ensure(Array.isArray(item.artifactPaths) && item.artifactPaths.length > 0 &&
      item.artifactPaths.every((path) => artifactPaths.has(path)), code, `Check ${id} needs hash-verified evidence artifacts`);
  }
  ensure(items.every((item) => item.status === 'passed'), code, 'Failed, skipped, blocked, or incomplete checks cannot be promoted');
}

export function validateReportContract(report, { kind, binding, policy, signer, now }) {
  ensure(object(report) && report.schemaVersion === 1 && report.kind === kind, 'EVIDENCE_SCHEMA', 'The signed report kind/version does not match its manifest entry');
  validateBinding(report.binding);
  ensure(sameBinding(report.binding, binding), 'EVIDENCE_BINDING', 'Evidence does not match the current commit, source, lock, or toolchain');
  validateTimestamp(report.generatedAt, policy, now);
  ensure(report.passed === true && report.provenance?.execution === 'live' && report.provenance?.fixture === false,
    'EVIDENCE_PROVENANCE', 'Only successful live execution evidence without fixture substitution is eligible');
  uniqueBy(report.artifacts, 'path', 'EVIDENCE_ARTIFACTS');
  const artifactPaths = new Set(report.artifacts.map((item) => item.path));
  if (kind === 'live-provider-matrix') {
    uniqueBy(report.results, 'id', 'LIVE_PROVIDER_MATRIX');
    ensure(report.results.length === policy.providers.length, 'LIVE_PROVIDER_MATRIX', 'Provider evidence must match the exact configured matrix');
    for (const provider of policy.providers) {
      const result = report.results.find((item) => item.id === provider.id);
      ensure(result && ['kind', 'model', 'effort'].every((key) => result[key] === provider[key]) &&
        result.passed === true && result.fixture === false && result.provider === provider.kind &&
        Number.isFinite(result.durationMs) && result.durationMs >= 0,
      'LIVE_PROVIDER_MATRIX', `Provider configuration ${provider.id} is missing, changed, failed, or substituted`);
    }
  } else if (kind === 'generation-workflow') {
    uniqueBy(report.cases, 'id', 'WORKFLOW_CASES');
    ensure(report.cases.length === policy.workflows.length, 'WORKFLOW_CASES', 'Workflow cases must match the operator-required corpus');
    const coverage = [];
    for (const workflow of policy.workflows) {
      const result = report.cases.find((item) => item.id === workflow.id);
      ensure(result?.passed === true, 'WORKFLOW_CASES', `Workflow case ${workflow.id} did not pass`);
      checks(result.stages, ['architect', 'generate', 'compile', 'browser-certify', 'visual-review', 'human-approve', 'publish', 'host-mount', 'host-query'], artifactPaths, 'WORKFLOW_STAGES');
      for (const stage of ['architect', 'generate', 'visual-review'])
        ensure(result.stages.find((item) => item.id === stage)?.providerId === workflow.providers[stage],
          'WORKFLOW_ROUTING', `Workflow ${workflow.id} used an unapproved provider for ${stage}`);
      coverage.push(...result.stages);
    }
    // The corpus may contain read-only cases, but the supported product's write,
    // recovery, and revocation boundaries must be exercised somewhere in it.
    checks(WORKFLOW_STAGES.map((id) => coverage.find((item) => item.id === id)).filter(Boolean),
      WORKFLOW_STAGES, artifactPaths, 'WORKFLOW_COVERAGE');
  } else if (kind === 'deployment') {
    ensure(object(report.target) && ['environment', 'serviceImage', 'certifierImage'].every((key) => report.target[key] === policy.target[key]),
      'DEPLOYMENT_TARGET', 'Deployment evidence targets different infrastructure or images');
    checks(report.checks, DEPLOYMENT_CHECKS, artifactPaths, 'DEPLOYMENT_CHECKS');
    ensure(object(report.runtime) && ['os', 'kernel', 'node'].every((key) => nonempty(report.runtime[key])),
      'DEPLOYMENT_RUNTIME', 'The actual target OS, kernel, and Node versions must be recorded');
    ensure(report.scan?.openCritical === 0 && report.scan?.openHigh === 0,
      'DEPLOYMENT_SCAN', 'Promoted service and certifier images must have zero open critical/high findings');
    for (const [actual, maximum] of [['rpoSeconds', 'maxRpoSeconds'], ['rtoSeconds', 'maxRtoSeconds']])
      ensure(Number.isFinite(report.recovery?.[actual]) && report.recovery[actual] >= 0 && report.recovery[actual] <= policy.target.recovery[maximum],
        'DEPLOYMENT_RECOVERY', `Measured ${actual} exceeds the release objective`);
    const actual = report.load, expected = policy.target.load;
    ensure(object(actual) && Number.isFinite(actual.concurrentUsers) && actual.concurrentUsers >= expected.concurrentUsers &&
      Number.isFinite(actual.sustainedMinutes) && actual.sustainedMinutes >= expected.sustainedMinutes &&
      Number.isFinite(actual.p95Ms) && actual.p95Ms >= 0 && actual.p95Ms <= expected.maxP95Ms &&
      Number.isFinite(actual.errorRate) && actual.errorRate >= 0 && actual.errorRate <= expected.maxErrorRate,
    'DEPLOYMENT_LOAD', 'Measured workload, duration, latency, or error rate fails the production profile');
  } else if (kind === 'independent-security') {
    ensure(signer.role === 'security-reviewer' && report.reviewer === signer.identity && report.independent === true,
      'SECURITY_REVIEWER', 'The report must be signed by the configured independent reviewer');
    ensure(report.openCritical === 0 && report.openHigh === 0, 'SECURITY_FINDINGS', 'Independent review has open critical/high findings');
    checks(report.checks, ['penetration', 'dependencies', 'multi-tenant'], artifactPaths, 'SECURITY_COVERAGE');
  }
}
