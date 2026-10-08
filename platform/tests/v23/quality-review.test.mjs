import test from 'node:test';
import assert from 'node:assert/strict';
import { qualitySummary, qualityEvidencePanel, sourceGenerationRequest } from '../../apps/studio/web/quality-review.mjs';

test('Studio preserves explicit actions and task intent in a documented production request upload', () => {
  const qualityContract = { profile: 'production', goal: 'Approve the selected proposal', scenarios: [] };
  const input = { goal: qualityContract.goal, actions: ['proposal.approve'], qualityContract };
  const result = sourceGenerationRequest({ profile: 'production', contract: input });
  assert.deepEqual(result, input);
  assert.notEqual(result.actions, input.actions);
  assert.deepEqual(sourceGenerationRequest({ profile: 'production', contract: { ...qualityContract, actionIds: ['proposal.approve'] } }).actions, ['proposal.approve']);
  assert.throws(() => sourceGenerationRequest({ goal: 'Preview', profile: 'production' }), /independent task contract/);
  assert.throws(() => sourceGenerationRequest({ profile: 'standard', contract: input }), /must match/);
  assert.throws(() => sourceGenerationRequest({ profile: 'production', contract: { ...input, actions: [42] } }), /capability IDs/);
});

const component = () => ({
  digest: 'source-a',
  compiled: { designContext: { hash: 'design-a' }, qualityContract: { hash: 'task-a', profile: 'production', scenarios: [{}] } },
  evidence: { digest: 'source-a', designContextHash: 'design-a', qualityContractHash: 'task-a', passed: true, checks: [{ passed: true }] },
  captures: [{ name: 'Mobile ready', sha256: 'image-a', dataUrl: 'data:image/jpeg;base64,AAAA' }],
});

test('quality review never displays stale or unbound certification as passing', () => {
  const current = component();
  assert.equal(qualitySummary(current).browser, 'Passed');
  assert.equal(qualitySummary(current).captureCount, 1);
  for (const field of ['digest', 'designContextHash', 'qualityContractHash']) {
    const stale = component();
    stale.evidence[field] = 'another-artifact';
    assert.equal(qualitySummary(stale).browser, 'Unverified for this artifact');
    assert.equal(qualitySummary(stale).captureCount, 0);
  }
  assert.equal(qualitySummary({}).profile, 'Standard smoke');
  assert.equal(qualitySummary({}).browser, 'Not run');
});

test('quality gallery only accepts bounded embedded PNG/JPEG captures and puts evidence in text nodes', () => {
  const nodes = [];
  const el = (tag, attrs = {}, ...children) => {
    const node = { tag, attrs, children, append(...items) { this.children.push(...items); } };
    nodes.push(node);
    return node;
  };
  const current = component();
  current.evidence.note = '<script>untrusted</script>';
  current.captures.push({ name: 'External', dataUrl: 'https://example.test/tracker.png' });
  current.captures.push({ name: 'SVG', dataUrl: 'data:image/svg+xml,<svg></svg>' });
  qualityEvidencePanel(el, current);
  assert.equal(nodes.filter((node) => node.tag === 'img').length, 1);
  assert.equal(nodes.find((node) => node.tag === 'img').attrs.alt, 'Mobile ready');
  assert.ok(nodes.some((node) => node.tag === 'pre' && node.attrs.text.includes('<script>untrusted</script>')));
  assert.ok(nodes.every((node) => !Object.hasOwn(node.attrs, 'innerHTML')));
});
