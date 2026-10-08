import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha256 } from '../../scripts/acceptance/binding.mjs';
import { verifyReleaseEvidence } from '../../scripts/acceptance/evidence.mjs';
import { validateReleasePolicy } from '../../scripts/acceptance/release-policy.mjs';
import { evidenceFixture } from './evidence-fixtures.mjs';

const gate = (result, name) => result.gates.find((item) => item.name === name);

test('all four exact signed reports and their artifacts satisfy external gates', async (t) => {
  const fixture = await evidenceFixture(t);
  const result = await verifyReleaseEvidence(fixture.options());
  assert.equal(result.passed, true);
  assert.equal(result.gates.length, 4);
  assert(result.gates.every((item) => item.status === 'passed' && item.artifactCount === 1));
  assert.equal(gate(result, 'independent-security').signerId, 'reviewer');
});

test('missing external configuration is explicit blockage, never readiness', async () => {
  const result = await verifyReleaseEvidence({ binding: {}, now: Date.now() });
  assert.equal(result.passed, false);
  assert.equal(result.gates.length, 4);
  assert(result.gates.every((item) => item.status === 'blocked'));
});

test('a provider marker cannot replace the required generation workflow', async (t) => {
  const fixture = await evidenceFixture(t);
  delete fixture.manifest.reports['generation-workflow'];
  await fixture.saveManifest();
  const result = await verifyReleaseEvidence(fixture.options());
  assert.equal(result.passed, false);
  assert.equal(gate(result, 'generation-workflow').status, 'blocked');
  assert.equal(gate(result, 'live-provider-matrix').status, 'passed');
});

test('only the separately trusted reviewer role may attest independent security', async (t) => {
  const fixture = await evidenceFixture(t);
  fixture.manifest.reports['independent-security'].signerId = 'executor';
  await fixture.saveManifest();
  const result = await verifyReleaseEvidence(fixture.options());
  assert.equal(gate(result, 'independent-security').code, 'EVIDENCE_SIGNER');
  assert.equal(result.passed, false);
});

test('a key cannot simultaneously act as execution authority and independent reviewer', async (t) => {
  const fixture = await evidenceFixture(t);
  fixture.policy.signers[1].publicKeyPem = fixture.policy.signers[0].publicKeyPem;
  assert.throws(() => validateReleasePolicy(fixture.policy), /one distinct identity and role/);
});

test('unknown reviewer identity and open high findings fail despite valid signatures', async (t) => {
  const fixture = await evidenceFixture(t);
  const report = fixture.reports['independent-security'];
  report.reviewer = 'An untrusted self-selected reviewer';
  await fixture.saveReport('independent-security');
  assert.equal(gate(await verifyReleaseEvidence(fixture.options()), 'independent-security').code, 'SECURITY_REVIEWER');
  report.reviewer = fixture.policy.signers[1].identity;
  report.openHigh = 1;
  await fixture.saveReport('independent-security');
  assert.equal(gate(await verifyReleaseEvidence(fixture.options()), 'independent-security').code, 'SECURITY_FINDINGS');
});

test('tampered report bytes and detached signatures are independently rejected', async (t) => {
  const fixture = await evidenceFixture(t);
  const descriptor = fixture.manifest.reports.deployment;
  const changed = Buffer.concat([await readFile(join(fixture.root, descriptor.path)), Buffer.from(' ')]);
  await writeFile(join(fixture.root, descriptor.path), changed);
  assert.equal(gate(await verifyReleaseEvidence(fixture.options()), 'deployment').code, 'EVIDENCE_DIGEST');
  descriptor.sha256 = sha256(changed);
  await fixture.saveManifest();
  assert.equal(gate(await verifyReleaseEvidence(fixture.options()), 'deployment').code, 'EVIDENCE_SIGNATURE');
});

test('stale and future dated evidence cannot be reused', async (t) => {
  const fixture = await evidenceFixture(t);
  const report = fixture.reports.deployment;
  report.generatedAt = new Date(fixture.now - 25 * 3_600_000).toISOString();
  await fixture.saveReport('deployment');
  assert.equal(gate(await verifyReleaseEvidence(fixture.options()), 'deployment').code, 'EVIDENCE_STALE');
  report.generatedAt = new Date(fixture.now + 61_000).toISOString();
  await fixture.saveReport('deployment');
  assert.equal(gate(await verifyReleaseEvidence(fixture.options()), 'deployment').code, 'EVIDENCE_FUTURE');
});

test('commit, source, lock, and toolchain mismatches reject otherwise signed reports', async (t) => {
  const fixture = await evidenceFixture(t);
  const report = fixture.reports['generation-workflow'];
  for (const key of ['gitCommit', 'sourceTreeSha256', 'packageLockSha256']) {
    report.binding = structuredClone(fixture.binding);
    report.binding[key] = 'f'.repeat(fixture.binding[key].length);
    await fixture.saveReport('generation-workflow');
    assert.equal(gate(await verifyReleaseEvidence(fixture.options()), 'generation-workflow').code, 'EVIDENCE_BINDING');
  }
  report.binding = structuredClone(fixture.binding);
  report.binding.toolchain.packages.react = 'unqualified-react';
  await fixture.saveReport('generation-workflow');
  assert.equal(gate(await verifyReleaseEvidence(fixture.options()), 'generation-workflow').code, 'EVIDENCE_BINDING');
});

test('dirty current source cannot authorize external release evidence', async (t) => {
  const fixture = await evidenceFixture(t);
  fixture.binding.clean = false;
  const result = await verifyReleaseEvidence(fixture.options());
  assert.equal(result.passed, false);
  assert(result.gates.every((item) => item.status === 'blocked' && item.code === 'EVIDENCE_SOURCE'));
});

test('fixture provenance is rejected in both report and provider result', async (t) => {
  const fixture = await evidenceFixture(t);
  fixture.reports['generation-workflow'].provenance.fixture = true;
  await fixture.saveReport('generation-workflow');
  assert.equal(gate(await verifyReleaseEvidence(fixture.options()), 'generation-workflow').code, 'EVIDENCE_PROVENANCE');
  fixture.reports['live-provider-matrix'].results[0].fixture = true;
  await fixture.saveReport('live-provider-matrix');
  assert.equal(gate(await verifyReleaseEvidence(fixture.options()), 'live-provider-matrix').code, 'LIVE_PROVIDER_MATRIX');
});

test('the exact provider matrix rejects missing configurations and fallback models', async (t) => {
  const fixture = await evidenceFixture(t);
  const report = fixture.reports['live-provider-matrix'];
  const original = structuredClone(report.results);
  report.results.pop();
  await fixture.saveReport('live-provider-matrix');
  assert.equal(gate(await verifyReleaseEvidence(fixture.options()), 'live-provider-matrix').code, 'LIVE_PROVIDER_MATRIX');
  report.results = original;
  report.results[0].model = 'another-model';
  await fixture.saveReport('live-provider-matrix');
  assert.equal(gate(await verifyReleaseEvidence(fixture.options()), 'live-provider-matrix').code, 'LIVE_PROVIDER_MATRIX');
});

test('workflow certification requires browser tasks, exact routing, and action recovery coverage', async (t) => {
  const fixture = await evidenceFixture(t);
  const result = fixture.reports['generation-workflow'].cases[0];
  const original = structuredClone(result.stages);
  result.stages.find((item) => item.id === 'browser-certify').status = 'skipped';
  await fixture.saveReport('generation-workflow');
  assert.equal(gate(await verifyReleaseEvidence(fixture.options()), 'generation-workflow').code, 'WORKFLOW_STAGES');
  result.stages = structuredClone(original);
  result.stages.find((item) => item.id === 'generate').providerId = 'api';
  await fixture.saveReport('generation-workflow');
  assert.equal(gate(await verifyReleaseEvidence(fixture.options()), 'generation-workflow').code, 'WORKFLOW_ROUTING');
  result.stages = original.filter((item) => item.id !== 'uncertain-outcome');
  await fixture.saveReport('generation-workflow');
  assert.equal(gate(await verifyReleaseEvidence(fixture.options()), 'generation-workflow').code, 'WORKFLOW_COVERAGE');
});

test('target image and measured recovery/load limits are mandatory release evidence', async (t) => {
  const fixture = await evidenceFixture(t);
  const report = fixture.reports.deployment;
  report.target.serviceImage = 'registry.example/atelier:mutable';
  await fixture.saveReport('deployment');
  assert.equal(gate(await verifyReleaseEvidence(fixture.options()), 'deployment').code, 'DEPLOYMENT_TARGET');
  report.target.serviceImage = fixture.policy.target.serviceImage;
  report.recovery.rtoSeconds = 3601;
  await fixture.saveReport('deployment');
  assert.equal(gate(await verifyReleaseEvidence(fixture.options()), 'deployment').code, 'DEPLOYMENT_RECOVERY');
  report.recovery.rtoSeconds = 1800;
  report.load.concurrentUsers = '20';
  await fixture.saveReport('deployment');
  assert.equal(gate(await verifyReleaseEvidence(fixture.options()), 'deployment').code, 'DEPLOYMENT_LOAD');
});

test('artifact hashes prevent replacement of reports\' underlying logs or screenshots', async (t) => {
  const fixture = await evidenceFixture(t);
  await writeFile(join(fixture.root, 'execution.log'), 'Changed artifact');
  const result = await verifyReleaseEvidence(fixture.options());
  assert.equal(result.passed, false);
  assert(result.gates.every((item) => item.code === 'EVIDENCE_ARTIFACT_DIGEST'));
});

test('signed artifact paths cannot read outside the evidence directory', async (t) => {
  const fixture = await evidenceFixture(t);
  const report = fixture.reports['live-provider-matrix'];
  report.artifacts[0].path = '../outside.log';
  await fixture.saveReport('live-provider-matrix');
  assert.equal(gate(await verifyReleaseEvidence(fixture.options()), 'live-provider-matrix').code, 'EVIDENCE_PATH');
  const outside = await mkdtemp(join(tmpdir(), 'atelier-evidence-outside-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await writeFile(join(outside, 'external.log'), 'Out-of-scope synthetic test evidence\n');
  await symlink(join(outside, 'external.log'), join(fixture.root, 'outside-link'));
  report.artifacts[0].path = 'outside-link';
  await fixture.saveReport('live-provider-matrix');
  assert.equal(gate(await verifyReleaseEvidence(fixture.options()), 'live-provider-matrix').code, 'EVIDENCE_PATH');
});
