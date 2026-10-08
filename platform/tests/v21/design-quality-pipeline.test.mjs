import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, scanned, generated } from './helpers.mjs';
import { hash } from '../../packages/control-plane/src/util.mjs';
import { critiqueRepairIssues } from '../../packages/control-plane/src/design-repair.mjs';

test('critic rejection reaches the next designer with the exact candidate and survives scoped cache replay', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  await scanned(f);
  const connection = f.service.createConnection(f.who, f.tenant.id, {
    name: 'Critique repair fixture', kind: 'openai', apiKey: 'test-only-key',
    model: 'fixture-model', projectId: f.project.id,
  });
  const project = f.service.project(f.who, f.tenant.id, f.project.id);
  f.service.updateProject(f.who, f.tenant.id, f.project.id, {
    revision: project.revision, providerId: connection.id, model: 'fixture-model',
  });
  let designerCalls = 0;
  let criticCalls = 0;
  let previous;
  let coverage;
  const issue = 'Put the customer identity before the signals so the operator can identify the correct record.';
  const apiFactory = () => ({
    async generate(req) {
      let value;
      if (req.schema.properties.workflow) {
        value = {
          goal: 'Understand context', workflow: ['Review', 'Act'],
          successCriteria: ['Identify the correct record before acting'], avoid: ['Unverified actions'],
          queryCapabilityIds: req.input.capabilities.filter((c) => c.kind === 'query').slice(0, 8).map((c) => c.id),
          actionCapabilityIds: req.input.capabilities.filter((c) => c.kind === 'command').slice(0, 4).map((c) => c.id),
        };
      } else if (req.schema.properties.sections) {
        designerCalls++;
        if (designerCalls === 1) {
          assert.deepEqual(req.input.repair, []);
          assert.equal(req.input.previousDesign, null);
          coverage = structuredClone(req.input.requiredCoverage);
        } else {
          assert.deepEqual(req.input.repair, [{ code: 'CRITIC_REJECTED', message: issue, details: null }]);
          assert.deepEqual(req.input.previousDesign, previous);
          assert.equal(req.input.previousDesignHash, hash(previous));
          assert.deepEqual(req.input.requiredCoverage, coverage);
        }
        value = {
          title: designerCalls === 1 ? 'Signals' : 'Customer context and signals',
          description: 'Approved information', layout: 'focus',
          rationale: designerCalls === 1 ? 'Lead with signals' : 'Identify the record before reviewing signals',
          sections: req.input.requiredCoverage.information.map((q) => ({
            source: q.capabilityId, title: 'Customer context', fields: q.fields, variant: 'facts',
          })),
          actions: req.input.requiredCoverage.actions.map((capabilityId) => ({ capabilityId, label: capabilityId })),
        };
        if (designerCalls === 1) previous = structuredClone(value);
      } else {
        criticCalls++;
        const approved = req.input.design.title !== 'Signals';
        value = { approved, issues: approved ? [] : [issue], strengths: [] };
      }
      return { value, model: 'fixture-model', provider: 'critique-fixture', usage: { inputTokens: 20, outputTokens: 10 } };
    },
  });
  const first = await generated(f, { mode: 'model', variants: 1, apiFactory });
  assert.equal(designerCalls, 2);
  assert.equal(criticCalls, 2);
  const release = f.service.release(f.who, f.tenant.id, f.project.id, first.releaseIds[0]);
  assert.equal(release.artifact.bundle.presentation.title, 'Customer context and signals');
  const attempts = release.artifact.bundle.provenance.stages.filter((stage) => stage.stage === 'designer');
  assert.equal(attempts.length, 2);
  assert.notEqual(attempts[0].designHash, attempts[1].designHash);
  await generated(f, { mode: 'model', variants: 1, apiFactory });
  assert.equal(designerCalls, 2, 'both deliberate attempts may be cached without replaying the rejected request as its repair');
  assert.equal(criticCalls, 2);
});

test('empty critic rejection still produces bounded, explicit repair feedback', () => {
  const issues = critiqueRepairIssues({ approved: false, issues: [] });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].code, 'CRITIC_REJECTED');
  assert.ok(issues[0].message.includes('without a specific issue'));
  assert.equal(critiqueRepairIssues({ issues: Array(30).fill('x'.repeat(600)) }).length, 10);
  assert.equal(critiqueRepairIssues({ issues: ['x'.repeat(600)] })[0].message.length, 400);
});
