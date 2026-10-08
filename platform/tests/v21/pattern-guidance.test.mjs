import test from 'node:test';
import assert from 'node:assert/strict';
import { PATTERN_CATALOG, PATTERN_CATALOG_HASH, selectPatternGuidance } from '../../packages/design-genome/src/pattern-guidance.mjs';

const query = { id: 'work.list', kind: 'query', outputSchema: { type: 'array', items: { type: 'object', properties: { count: { type: 'number' } } } } };
const context = (goal, actions = []) => ({
  task: { goal, requiredInformation: [{ capabilityId: query.id, field: 'count' }], permittedActions: actions },
  model: { capabilities: [query] }, designContext: { hash: 'host-context' },
});

test('task guidance is bounded, reproducible and identifies its unmeasured provenance', () => {
  assert.equal(PATTERN_CATALOG.patterns.length, 12);
  assert.equal(new Set(PATTERN_CATALOG.patterns.map((p) => p.family)).size, 6);
  assert.ok(Object.isFrozen(PATTERN_CATALOG.patterns[0].guidance));
  const result = selectPatternGuidance(context('Triage the queue and backlog'));
  assert.equal(result.candidates[0].id, 'queue-scan');
  assert.equal(result.catalogHash, PATTERN_CATALOG_HASH);
  assert.equal(result.designContextHash, 'host-context');
  assert.deepEqual(result, selectPatternGuidance(context('Triage the queue and backlog')));
  assert.ok(result.candidates.length <= 3);
  assert.ok(PATTERN_CATALOG.validation.includes('Not a measured'));
  assert.throws(() => selectPatternGuidance({ ...context('queue'), limit: 30 }), /1–3/);
});

test('guidance cannot turn unavailable writes or unauthorized collection schemas into candidate controls', () => {
  const readonly = selectPatternGuidance(context('approve create edit configure triage'));
  assert.ok(readonly.candidates.every((p) => !p.needs.includes('action')));
  const unauthorized = context('compare queue analytics');
  unauthorized.task.requiredInformation = [];
  const result = selectPatternGuidance(unauthorized);
  assert.deepEqual(result.candidates.map((p) => p.id), ['entity-context']);
  const writable = selectPatternGuidance(context('approve', ['review.approve']));
  assert.equal(writable.candidates[0].id, 'review-approval');
});

test('task shapes select different compositions and returned guidance cannot mutate the catalog', () => {
  const compare = selectPatternGuidance(context('compare options'));
  assert.equal(compare.candidates[0].layout, 'comparison');
  compare.candidates[0].guidance[0] = 'mutated';
  assert.notEqual(selectPatternGuidance(context('compare options')).candidates[0].guidance[0], 'mutated');
  const numeric = selectPatternGuidance(context('monitor capacity'));
  assert.equal(numeric.candidates[0].id, 'monitor-summary');
  const unknown = selectPatternGuidance(context('Help me understand this'));
  assert.equal(unknown.candidates[0].id, 'analysis-records');
});
