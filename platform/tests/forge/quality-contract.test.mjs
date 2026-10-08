import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeQualityContract, assertQualityContract } from '../../packages/source-forge/src/quality-contract.mjs';

const input = () => ({
  profile: 'production', goal: 'Create a support case after reviewing the subject', dataPolicy: 'synthetic',
  scenarios: [{
    id: 'create-case', name: 'Create one case with the reviewed subject', data: { subject: 'Synthetic example' },
    steps: [{ op: 'click', selector: '[data-testid="create"]' }],
    assertions: [{ kind: 'text', selector: '[role="status"]', text: 'Created case fixture-1' }],
    calls: [{ capabilityId: 'case.create', input: { subject: 'Synthetic example' }, outcome: 'success', result: { id: 'fixture-1' } }],
  }],
});

test('caller-supplied task oracle normalizes and binds exact outcomes before generation', () => {
  const raw = input();
  const contract = normalizeQualityContract(raw, { approvedActions: ['case.create'] });
  assert.equal(contract.profile, 'production');
  assert.equal(contract.visualReviewRequired, true);
  assert.deepEqual(assertQualityContract(contract), contract);
  raw.scenarios[0].calls[0].input.subject = 'Changed after queue';
  assert.equal(contract.scenarios[0].calls[0].input.subject, 'Synthetic example');
  const mutated = structuredClone(contract);
  mutated.scenarios[0].calls[0].input.subject = 'Changed oracle';
  assert.throws(() => assertQualityContract(mutated), { code: 'QUALITY_CONTRACT_CHANGED' });
});

test('an authoritative requested goal cannot retain a different old task oracle', () => {
  const value = { profile: 'standard', goal: ' Delivery board ' };
  const normalized = normalizeQualityContract(value, { goal: 'Delivery board' });
  assert.equal(normalized.goal, 'Delivery board');
  assert.deepEqual(assertQualityContract(normalized), normalized);
  assert.throws(() => normalizeQualityContract(value, { goal: 'Delivery board with export' }), { code: 'QUALITY_GOAL_MISMATCH' });
  assert.equal(normalizeQualityContract({}, { goal: ' New requested task ' }).goal, 'New requested task');
});

test('production cannot opt out of task, visual or action coverage requirements', () => {
  assert.throws(() => normalizeQualityContract({ profile: 'standard', goal: 'Local demo' }, { production: true }), { code: 'PRODUCTION_QUALITY_REQUIRED' });
  assert.throws(() => normalizeQualityContract({ ...input(), visualReviewRequired: false }, { approvedActions: ['case.create'] }), { code: 'PRODUCTION_VISUAL_REQUIRED' });
  assert.throws(() => normalizeQualityContract({ profile: 'production', goal: 'Create case', dataPolicy: 'synthetic' }), { code: 'QUALITY_CONTRACT' });
  assert.throws(() => normalizeQualityContract(input(), { approvedActions: [] }), { code: 'UNAPPROVED_ACTION' });
  assert.throws(() => normalizeQualityContract(input(), { approvedActions: ['case.create', 'case.delete'] }), { code: 'QUALITY_ACTION_COVERAGE' });
});

test('oracle rejects unbounded or ambiguous policy fields and unlabeled fixture data', () => {
  const raw = input();
  delete raw.dataPolicy;
  assert.throws(() => normalizeQualityContract(raw, { approvedActions: ['case.create'] }), { code: 'QUALITY_DATA_POLICY' });
  assert.throws(() => normalizeQualityContract({ ...input(), backendUrl: 'https://example.com' }), { code: 'QUALITY_CONTRACT' });
  assert.throws(() => normalizeQualityContract({ ...input(), maxRepairAttempts: 99 }, { approvedActions: ['case.create'] }), { code: 'QUALITY_REPAIR_BUDGET' });
  const duplicate = input();
  duplicate.scenarios.push(structuredClone(duplicate.scenarios[0]));
  assert.throws(() => normalizeQualityContract(duplicate, { approvedActions: ['case.create'] }), { code: 'QUALITY_SCENARIO_ID' });
});
