// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { createPublicKey, verify } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { sameBinding, sha256, stableJson } from './binding.mjs';
import { EXTERNAL_KINDS, digest, ensure, nonempty, object, validateReleasePolicy } from './release-policy.mjs';
import { validateBinding, validateReportContract, validateTimestamp } from './report-contracts.mjs';

const MAX_JSON_BYTES = 4 * 1024 * 1024;

function safeJson(bytes) {
  return JSON.parse(bytes.toString('utf8'), (key, value) => {
    ensure(!['__proto__', 'constructor', 'prototype'].includes(key), 'EVIDENCE_JSON', 'Unsafe object key in evidence');
    return value;
  });
}

export async function readEvidenceJson(path) {
  const stat = await lstat(path);
  ensure(stat.isFile() && stat.size > 0 && stat.size <= MAX_JSON_BYTES, 'EVIDENCE_FILE', 'Evidence JSON must be a bounded regular file');
  return safeJson(await readFile(path));
}

async function readRelative(base, path, maxBytes) {
  ensure(nonempty(path) && !isAbsolute(path) && !path.split(/[\\/]/).includes('..'),
    'EVIDENCE_PATH', 'Evidence paths must be relative and cannot traverse directories');
  const baseReal = await realpath(base);
  const file = resolve(baseReal, path);
  const actual = await realpath(file);
  const relation = relative(baseReal, actual);
  ensure(relation && !relation.startsWith(`..${sep}`) && relation !== '..' && !isAbsolute(relation),
    'EVIDENCE_PATH', 'Evidence must remain inside its manifest directory');
  const stat = await lstat(file);
  ensure(stat.isFile() && stat.size > 0 && stat.size <= maxBytes,
    'EVIDENCE_FILE', 'An evidence file is missing, empty, oversized, or not a regular file');
  const bytes = await readFile(file);
  ensure(bytes.length > 0 && bytes.length <= maxBytes, 'EVIDENCE_FILE', 'Evidence changed size during read');
  return bytes;
}

export async function loadEvidenceConfiguration({ policyPath, manifestPath, binding, now = Date.now() }) {
  ensure(nonempty(policyPath) && nonempty(manifestPath), 'EXTERNAL_EVIDENCE_BLOCKED',
    'Set ATELIER_RELEASE_POLICY and ATELIER_RELEASE_EVIDENCE to operator-owned policy and signed evidence');
  validateBinding(binding);
  const policy = validateReleasePolicy(await readEvidenceJson(resolve(policyPath)));
  const manifest = await readEvidenceJson(resolve(manifestPath));
  ensure(object(manifest) && manifest.schemaVersion === 1 && manifest.kind === 'atelier-release-evidence' && object(manifest.reports),
    'EVIDENCE_MANIFEST', 'Expected an Atelier release evidence manifest');
  ensure(sameBinding(manifest.binding, binding), 'EVIDENCE_BINDING', 'The manifest is for different source or toolchain');
  validateTimestamp(manifest.generatedAt, policy, now);
  ensure(Object.keys(manifest.reports).every((kind) => EXTERNAL_KINDS.includes(kind)),
    'EVIDENCE_MANIFEST', 'Unknown release evidence kind');
  return { policy, manifest, base: dirname(resolve(manifestPath)), binding, now };
}

export async function verifySignedReport(kind, configuration) {
  const { policy, manifest, base, binding, now } = configuration;
  ensure(EXTERNAL_KINDS.includes(kind), 'EVIDENCE_KIND', 'Unsupported external release gate');
  const descriptor = manifest.reports[kind];
  ensure(object(descriptor), 'EXTERNAL_EVIDENCE_BLOCKED', `No ${kind} report was supplied`);
  ensure(digest(descriptor.sha256) && nonempty(descriptor.signerId), 'EVIDENCE_DESCRIPTOR', 'A report digest and trusted signer ID are required');
  const signer = policy.signers.find((candidate) => candidate.id === descriptor.signerId);
  const role = kind === 'independent-security' ? 'security-reviewer' : 'executor';
  ensure(signer?.role === role, 'EVIDENCE_SIGNER', `${kind} requires a trusted ${role} signer`);
  const bytes = await readRelative(base, descriptor.path, MAX_JSON_BYTES);
  ensure(sha256(bytes) === descriptor.sha256, 'EVIDENCE_DIGEST', 'The external report digest does not match');
  const signature = await readRelative(base, descriptor.signaturePath, 128);
  ensure(signature.length === 64 && verify(null, bytes, createPublicKey(signer.publicKeyPem), signature),
    'EVIDENCE_SIGNATURE', 'The detached Ed25519 signature is invalid');
  const report = safeJson(bytes);
  validateReportContract(report, { kind, binding, policy, signer, now });
  let artifactBytes = 0;
  for (const artifact of report.artifacts) {
    ensure(digest(artifact.sha256), 'EVIDENCE_ARTIFACTS', 'Every evidence artifact needs a SHA-256 digest');
    const contents = await readRelative(base, artifact.path, 64 * 1024 * 1024);
    artifactBytes += contents.length;
    ensure(artifactBytes <= 256 * 1024 * 1024, 'EVIDENCE_ARTIFACTS', 'Report artifacts exceed 256 MiB');
    ensure(sha256(contents) === artifact.sha256, 'EVIDENCE_ARTIFACT_DIGEST', 'An evidence artifact has changed or is incomplete');
  }
  return {
    name: kind,
    status: 'passed',
    reportSha256: descriptor.sha256,
    signerId: signer.id,
    signerIdentity: signer.identity,
    signerKeySha256: sha256(createPublicKey(signer.publicKeyPem).export({ type: 'spki', format: 'der' })),
    generatedAt: report.generatedAt,
    artifactCount: report.artifacts.length,
    provenance: report.provenance,
  };
}

function rejectedGate(name, error) {
  const blocked = ['EXTERNAL_EVIDENCE_BLOCKED', 'EVIDENCE_SOURCE', 'ENOENT'].includes(error.code);
  return { name, status: blocked ? 'blocked' : 'failed', code: error.code ?? 'EVIDENCE_INVALID', reason: error.message };
}

/** Verify external authority; never call models, invent evidence, rewrite the
 * requirements ledger, or accept a report's self-selected trust key. */
export async function verifyReleaseEvidence(options) {
  let configuration;
  try {
    configuration = await loadEvidenceConfiguration(options);
  } catch (error) {
    return { passed: false, gates: EXTERNAL_KINDS.map((kind) => rejectedGate(kind, error)) };
  }
  const gates = [];
  for (const kind of EXTERNAL_KINDS) {
    try { gates.push(await verifySignedReport(kind, configuration)); }
    catch (error) { gates.push(rejectedGate(kind, error)); }
  }
  return {
    passed: gates.every((gate) => gate.status === 'passed'), gates,
    policySha256: sha256(stableJson(configuration.policy)),
    manifestSha256: sha256(stableJson(configuration.manifest)),
  };
}
