import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { expectedCases, verifyBrowserEvidence } from '../../packages/source-forge/src/certifier.mjs';
import { normalizeQualityContract } from '../../packages/source-forge/src/quality-contract.mjs';
import { reviewSourceScreenshots } from '../../packages/source-forge/src/quality-review.mjs';

// Explicit protocol unit fixture. These bytes are never browser/production evidence.
const bytes = Buffer.from([255, 216, 255, 217]);
const byteHash = createHash('sha256').update(bytes).digest('hex');
function fixture(qualityContract = null) {
  const compiled = { digest: 'fixture-source-digest', kit: { tasks: [{}] }, designContext: { hash: 'fixture-design' }, qualityContract };
  const cases = expectedCases(qualityContract);
  const report = {
    protocol: 2, runner: 'chromium-sandboxed-react-v2', runnerHash: 'fixture-runner',
    digest: compiled.digest, designContextHash: compiled.designContext.hash,
    qualityContractHash: qualityContract?.hash ?? null, profile: qualityContract?.profile ?? 'standard',
    axeHash: qualityContract?.profile === 'production' ? 'fixture-axe' : null,
    passed: true,
    checks: cases.map((item) => ({
      name: item.name, passed: true, tasks: item.scenario ? 1 : item.state === 'ready' ? 1 : 0,
      independentScenario: !!item.scenario,
      ...(item.scenario ? { assertions: item.scenario.assertions.length, verifiedCalls: item.scenario.calls.length } : {}),
      accessibility: { engine: 'axe-core', violations: [], phases: (item.state === 'ready' ? ['initial', 'complete'] : ['initial']).map((phase) => ({ phase, engine: 'axe-core', violations: [], incomplete: [] })) },
    })),
    captures: cases.flatMap((item) => (qualityContract?.profile === 'production' && item.state === 'ready' ? ['initial', 'complete'] : ['initial']).map((phase) => ({
      name: item.name, phase, width: item.width, height: 850,
      theme: item.theme, state: item.state, direction: item.direction, capture: 'viewport',
      sha256: byteHash, bytes: bytes.length, dataUrl: `data:image/jpeg;base64,${bytes.toString('base64')}`,
    }))),
  };
  return { compiled, report };
}

test('trusted evidence protocol binds source, design, task, cases and retained pixels', () => {
  const { compiled, report } = fixture();
  assert.equal(expectedCases().length, 17);
  assert.equal(verifyBrowserEvidence(report, compiled, { runnerHash: 'fixture-runner' }), report);
  assert.throws(() => verifyBrowserEvidence({ ...report, designContextHash: 'other' }, compiled), { code: 'CERTIFIER_BINDING' });
  assert.throws(() => verifyBrowserEvidence(report, compiled, { runnerHash: 'new-container-runner' }), { code: 'CERTIFIER_RUNNER_CHANGED' });
  const mutated = structuredClone(report);
  mutated.captures[0].dataUrl = 'data:image/jpeg;base64,/9gAAA==';
  assert.throws(() => verifyBrowserEvidence(mutated, compiled), { code: 'CAPTURE_HASH_MISMATCH' });
  const omitted = structuredClone(report);
  omitted.captures.pop();
  assert.throws(() => verifyBrowserEvidence(omitted, compiled), { code: 'CAPTURE_EVIDENCE_REQUIRED' });
  const duplicated = structuredClone(report);
  duplicated.checks[1] = duplicated.checks[0];
  assert.throws(() => verifyBrowserEvidence(duplicated, compiled), { code: 'EVIDENCE_INVALID' });
});

test('production matrix requires independent tasks and real accessibility engine evidence', () => {
  const quality = normalizeQualityContract({
    profile: 'production', goal: 'Filter the supplied records', dataPolicy: 'synthetic',
    scenarios: [{ id: 'filter', name: 'Filter records', data: { items: [] }, steps: [{ op: 'fill', selector: 'input', value: 'ready' }], assertions: [{ kind: 'count', selector: 'li', count: 0 }], calls: [] }],
  });
  const { compiled, report } = fixture(quality);
  assert.equal(expectedCases(quality).length, 25);
  verifyBrowserEvidence(report, compiled, { axeHash: report.axeHash });
  const changed = structuredClone(report);
  changed.checks.find((item) => item.independentScenario).verifiedCalls = 99;
  assert.throws(() => verifyBrowserEvidence(changed, compiled, { axeHash: report.axeHash }), { code: 'EVIDENCE_ORACLE' });
  const noAxe = structuredClone(report);
  noAxe.checks[0].accessibility.engine = 'native-smoke';
  assert.throws(() => verifyBrowserEvidence(noAxe, compiled, { axeHash: report.axeHash }), { code: 'ACCESSIBILITY_EVIDENCE_REQUIRED' });
  const missingInitial = structuredClone(report);
  missingInitial.checks.find((item) => item.name.startsWith('ready')).accessibility.phases.shift();
  assert.throws(() => verifyBrowserEvidence(missingInitial, compiled, { axeHash: report.axeHash }), { code: 'ACCESSIBILITY_EVIDENCE_REQUIRED' });
  const hiddenInitialFailure = structuredClone(report);
  hiddenInitialFailure.checks.find((item) => item.name.startsWith('ready')).accessibility.phases[0].violations = [{ id: 'label' }];
  assert.throws(() => verifyBrowserEvidence(hiddenInitialFailure, compiled, { axeHash: report.axeHash }), { code: 'ACCESSIBILITY_EVIDENCE_REQUIRED' });
});

test('vision receives actual captured bytes in bounded batches and records exact reviewed hashes', async () => {
  const quality = normalizeQualityContract({ goal: 'Review the records', dataPolicy: 'synthetic', visualReviewRequired: true });
  const { compiled, report } = fixture(quality);
  const requests = [];
  const review = await reviewSourceScreenshots({ generate: async (request) => {
    requests.push(request);
    assert.equal(request.stage, 'visual');
    assert.ok(request.images.length > 0 && request.images.length <= 4);
    assert.equal(request.images[0].dataUrl, report.captures[0].dataUrl);
    assert.equal(request.input.sourceDigest, compiled.digest);
    return { value: { acceptable: true, issues: [], strengths: ['Explicit unit fixture'] }, provider: 'fixture', model: 'fixture' };
  } }, compiled, report);
  assert.equal(requests.length, 2);
  assert.equal(review.passed, true);
  assert.equal(review.reviewedCaptureHashes.length, 6);
  assert.equal(review.totalRetainedCaptures, report.captures.length);
});

test('vision cannot cite unseen screenshots or turn a major issue into passing evidence', async () => {
  const quality = normalizeQualityContract({ goal: 'Review records', dataPolicy: 'synthetic', visualReviewRequired: true });
  const { compiled, report } = fixture(quality);
  await assert.rejects(reviewSourceScreenshots({ generate: async () => ({ value: {
    acceptable: true, issues: [{ severity: 'major', criterion: 'spacing', captureName: 'invented-image', message: 'Overlap', repair: 'Repair overlap' }], strengths: [],
  } }) }, compiled, report));
  const failed = await reviewSourceScreenshots({ generate: async (request) => ({ value: {
    acceptable: true, issues: [{ severity: 'major', criterion: 'spacing', captureName: request.input.captures[0].captureName, message: 'Overlap', repair: 'Repair overlap' }], strengths: [],
  }, provider: 'fixture', model: 'fixture' }) }, compiled, report);
  assert.equal(failed.passed, false);
  await assert.rejects(reviewSourceScreenshots({ generate: async () => { throw Object.assign(new Error('Unavailable fixture provider'), { code: 'PROVIDER_UNAVAILABLE' }); } }, compiled, report), { code: 'PROVIDER_UNAVAILABLE' });
});
