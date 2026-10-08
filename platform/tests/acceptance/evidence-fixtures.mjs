// Synthetic unit-test attestations only. No provider, infrastructure, or security
// assessment is performed here. Ephemeral trust keys and invented source hashes
// deliberately cannot bind these fixtures to the real release checkout.
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha256 } from '../../scripts/acceptance/binding.mjs';
import { DEPLOYMENT_CHECKS, EXTERNAL_KINDS, WORKFLOW_STAGES } from '../../scripts/acceptance/release-policy.mjs';

export const TEST_TOOLCHAIN = {
  node: 'v24.0.0', npm: '11.0.0', platform: 'linux', arch: 'x64',
  python: '3.12.0', playwright: '1.62.0',
  packages: { typescript: '5.8.3', esbuild: '0.28.2', react: '19.2.8', ajv: '8.20.0', 'axe-core': '4.14.0' },
};

export async function evidenceFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'atelier-evidence-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const now = Date.parse('2026-10-08T12:00:00.000Z');
  const generatedAt = new Date(now).toISOString();
  const binding = {
    schemaVersion: 1, gitCommit: '1'.repeat(40), gitTree: '2'.repeat(40),
    sourceTreeSha256: '3'.repeat(64), packageLockSha256: '4'.repeat(64),
    clean: true, toolchain: structuredClone(TEST_TOOLCHAIN),
  };
  const keys = { executor: generateKeyPairSync('ed25519'), reviewer: generateKeyPairSync('ed25519') };
  const providers = [
    { id: 'api', kind: 'openai', model: 'synthetic-model-api', effort: null },
    { id: 'claude', kind: 'claude-cli', model: 'synthetic-model-claude', effort: 'high' },
    { id: 'codex', kind: 'codex-cli', model: 'synthetic-model-codex', effort: null },
  ];
  const target = {
    environment: 'synthetic-test-target',
    serviceImage: `registry.example/atelier@sha256:${'5'.repeat(64)}`,
    certifierImage: `registry.example/certifier@sha256:${'6'.repeat(64)}`,
    recovery: { maxRpoSeconds: 900, maxRtoSeconds: 3600 },
    load: { concurrentUsers: 20, sustainedMinutes: 30, maxP95Ms: 500, maxErrorRate: 0.01 },
  };
  const policy = {
    schemaVersion: 1, maxAgeHours: 24, maxClockSkewSeconds: 60, providers,
    workflows: [{ id: 'synthetic-end-to-end', providers: { architect: 'api', generate: 'claude', 'visual-review': 'codex' } }],
    target,
    signers: [
      { id: 'executor', role: 'executor', identity: 'Synthetic execution verifier', publicKeyPem: keys.executor.publicKey.export({ type: 'spki', format: 'pem' }) },
      { id: 'reviewer', role: 'security-reviewer', identity: 'Synthetic independent reviewer', publicKeyPem: keys.reviewer.publicKey.export({ type: 'spki', format: 'pem' }) },
    ],
  };
  const artifact = Buffer.from('Synthetic verifier unit test: no live provider, deployment, or review was executed.\n');
  await writeFile(join(root, 'execution.log'), artifact);
  const artifacts = [{ path: 'execution.log', sha256: sha256(artifact) }];
  const check = (id) => ({ id, status: 'passed', artifactPaths: ['execution.log'] });
  const reports = Object.fromEntries(EXTERNAL_KINDS.map((kind) => [kind, {
    schemaVersion: 1, kind, generatedAt, binding: structuredClone(binding),
    provenance: { execution: 'live', fixture: false }, passed: true, artifacts: structuredClone(artifacts),
  }]));
  reports['live-provider-matrix'].results = providers.map((provider) => ({
    ...provider, provider: provider.kind, passed: true, fixture: false, durationMs: 25,
  }));
  reports['generation-workflow'].cases = [{
    id: 'synthetic-end-to-end', passed: true,
    stages: WORKFLOW_STAGES.map((id) => ({
      ...check(id), ...(['architect', 'generate', 'visual-review'].includes(id) ? { providerId: policy.workflows[0].providers[id] } : {}),
    })),
  }];
  Object.assign(reports.deployment, {
    target: { environment: target.environment, serviceImage: target.serviceImage, certifierImage: target.certifierImage },
    checks: DEPLOYMENT_CHECKS.map(check),
    runtime: { os: 'synthetic-linux', kernel: 'synthetic-kernel', node: 'v24.0.0' },
    scan: { openCritical: 0, openHigh: 0 },
    recovery: { rpoSeconds: 600, rtoSeconds: 1800 },
    load: { concurrentUsers: 20, sustainedMinutes: 30, p95Ms: 250, errorRate: 0 },
  });
  Object.assign(reports['independent-security'], {
    reviewer: policy.signers[1].identity, independent: true, openCritical: 0, openHigh: 0,
    checks: ['penetration', 'dependencies', 'multi-tenant'].map(check),
  });
  const manifest = { schemaVersion: 1, kind: 'atelier-release-evidence', generatedAt, binding: structuredClone(binding), reports: {} };
  const manifestPath = join(root, 'manifest.json'), policyPath = join(root, 'policy.json');
  const saveManifest = () => writeFile(manifestPath, JSON.stringify(manifest));
  const savePolicy = () => writeFile(policyPath, JSON.stringify(policy));
  const saveReport = async (kind) => {
    const signerId = kind === 'independent-security' ? 'reviewer' : 'executor';
    const bytes = Buffer.from(JSON.stringify(reports[kind]));
    const path = `${kind}.json`, signaturePath = `${kind}.sig`;
    await writeFile(join(root, path), bytes);
    await writeFile(join(root, signaturePath), sign(null, bytes, keys[signerId].privateKey));
    manifest.reports[kind] = { path, sha256: sha256(bytes), signaturePath, signerId };
    await saveManifest();
  };
  await savePolicy();
  for (const kind of EXTERNAL_KINDS) await saveReport(kind);
  return { root, now, binding, policy, keys, reports, manifest, savePolicy, saveManifest, saveReport,
    options: () => ({ binding, now, policyPath, manifestPath }) };
}
