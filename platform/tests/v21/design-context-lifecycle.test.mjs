import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, scanned, generated, runJob } from './helpers.mjs';
import { approvedDesign } from './design-fixtures.mjs';
import { projectAccess } from '../../packages/control-plane/src/access.mjs';

function provider(f, model = 'design-lifecycle-fixture') {
  const connection = f.service.createConnection(f.who, f.tenant.id, {
    name: model, kind: 'openai', apiKey: 'test-only-key', model, projectId: f.project.id,
  });
  const project = f.service.project(f.who, f.tenant.id, f.project.id);
  f.service.updateProject(f.who, f.tenant.id, f.project.id, {
    revision: project.revision, providerId: connection.id, model,
  });
}

function designResponse(req) {
  if (req.schema.properties.workflow) return {
    goal: 'Understand context', workflow: ['Review'], successCriteria: ['Identify the correct record'], avoid: ['Unverified actions'],
    queryCapabilityIds: req.input.capabilities.filter((item) => item.kind === 'query').slice(0, 8).map((item) => item.id),
    actionCapabilityIds: req.input.capabilities.filter((item) => item.kind === 'command').slice(0, 4).map((item) => item.id),
  };
  if (req.schema.properties.sections) return {
    title: 'Customer context', description: 'Reviewed information', layout: 'focus', rationale: 'Preserve host design and required context',
    sections: req.input.requiredCoverage.information.map((item) => ({ source: item.capabilityId, title: 'Context', fields: item.fields, variant: 'facts' })),
    actions: req.input.requiredCoverage.actions.map((capabilityId) => ({ capabilityId, label: capabilityId })),
  };
  return { approved: true, issues: [], strengths: [] };
}

test('design changes without a new model invalidate approval, publication, promotion and rollback', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  await scanned(f);
  const design = approvedDesign(f);
  const modelId = f.service.project(f.who, f.tenant.id, f.project.id).modelId;
  const scope = projectAccess(f.db, f.who, f.tenant.id, f.project.id);
  const before = f.service.currentDesignContext(scope);
  const [first, second, draft] = (await generated(f, { variants: 3 })).releaseIds;
  for (const [release, revision] of [[first, 0], [second, 1]]) {
    f.service.approve(f.who, f.tenant.id, f.project.id, release, { approved: true, previewReviewed: true });
    f.service.publish(f.who, f.tenant.id, f.project.id, release, { revision });
  }
  const pending = (await generated(f, { variants: 1 })).releaseIds[0];
  f.service.approve(f.who, f.tenant.id, f.project.id, pending, { approved: true, previewReviewed: true });
  const production = f.service.promote(f.who, f.tenant.id, f.project.id, second);
  design.approve({ roles: { root: { fontSize: '19px' } } });
  assert.equal(f.service.project(f.who, f.tenant.id, f.project.id).modelId, modelId);
  assert.notEqual(f.service.currentDesignContext(scope).hash, before.hash, 'even a scope created before approval must read current evidence');
  assert.equal(f.service.release(f.who, f.tenant.id, f.project.id, draft).artifact.bundle.provenance.designContextHash, before.hash);
  const attempts = [
    () => f.service.approve(f.who, f.tenant.id, f.project.id, draft, { approved: true, previewReviewed: true }),
    () => f.service.approve(f.who, f.tenant.id, f.project.id, production.id, { approved: true, previewReviewed: true }),
    () => f.service.publish(f.who, f.tenant.id, f.project.id, pending, { revision: 2 }),
    () => f.service.promote(f.who, f.tenant.id, f.project.id, second),
    () => f.service.rollback(f.who, f.tenant.id, f.project.id, { slotId: 'customer.detail.right-rail', environment: 'staging', revision: 2 }),
  ];
  for (const attempt of attempts) assert.throws(attempt, { code: 'DESIGN_CONTEXT_CHANGED' });
  assert.equal(f.service.release(f.who, f.tenant.id, f.project.id, draft).status, 'draft');
  assert.equal(f.service.release(f.who, f.tenant.id, f.project.id, production.id).status, 'draft');
  assert.equal(f.service.release(f.who, f.tenant.id, f.project.id, pending).status, 'approved');
  const deployment = f.db.get('SELECT release_id,revision FROM deployments WHERE tenant_id=? AND project_id=? AND environment=?', f.tenant.id, f.project.id, 'staging');
  assert.equal(deployment.release_id, second);
  assert.equal(deployment.revision, 2);
  assert.equal(f.service.releases(f.who, f.tenant.id, f.project.id).length, 5);
});

test('a contract changed during an awaited provider call prevents draft persistence', { timeout: 30000 }, async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  await scanned(f);
  const design = approvedDesign(f);
  provider(f);
  const modelId = f.service.project(f.who, f.tenant.id, f.project.id).modelId;
  let started;
  let resume;
  const entered = new Promise((resolve) => { started = resolve; });
  const pause = new Promise((resolve) => { resume = resolve; });
  t.after(() => resume());
  const apiFactory = () => ({
    async generate(req) {
      if (req.schema.properties.workflow) {
        started();
        await pause;
      }
      return { value: designResponse(req), model: 'design-lifecycle-fixture', provider: 'fixture', usage: { inputTokens: 10, outputTokens: 10 } };
    },
  });
  const rejected = assert.rejects(generated(f, { mode: 'model', variants: 1, apiFactory }), { code: 'DESIGN_CONTEXT_CHANGED' });
  await entered;
  design.approve({ roles: { button: { paddingInline: '20px' } } });
  assert.equal(f.service.project(f.who, f.tenant.id, f.project.id).modelId, modelId);
  resume();
  await rejected;
  assert.deepEqual(f.service.releases(f.who, f.tenant.id, f.project.id), []);
  assert.equal(f.db.get("SELECT count(*) n FROM artifacts WHERE tenant_id=? AND project_id=? AND kind='experience'", f.tenant.id, f.project.id).n, 0);
});

test('new approved synthesis invalidates a release even when contract and model are unchanged', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  await scanned(f);
  const { discovery } = approvedDesign(f);
  const scope = projectAccess(f.db, f.who, f.tenant.id, f.project.id);
  const synthesize = async (summary, model) => {
    provider(f, model);
    discovery.synthesizeDesign(f.who, f.tenant.id, f.project.id);
    await runJob(f, { apiFactory: () => ({ async generate() { return {
      value: { summary, density: 'compact', hierarchy: 'sectioned', interactionTone: 'direct',
        patterns: [{ name: 'Host controls', guidance: 'Retain approved control dimensions.', confidence: 1, evidence: [{ role: 'button', property: 'height', value: '36px' }] }], avoid: [] },
      model, provider: 'fixture', usage: { inputTokens: 10, outputTokens: 10 },
    }; } }) });
    const draft = discovery.design(f.who, f.tenant.id, f.project.id).syntheses.find((item) => item.status === 'draft');
    assert.ok(draft);
    discovery.reviewDesignSynthesis(f.who, f.tenant.id, f.project.id, draft.id, { approved: true });
  };
  const before = f.service.currentDesignContext(scope);
  assert.equal(before.guidance, null);
  const releaseId = (await generated(f, { variants: 1 })).releaseIds[0];
  await synthesize('Group controls by their review step.', 'synthesis-b');
  const after = f.service.currentDesignContext(scope);
  assert.equal(after.projectVersion, before.projectVersion);
  assert.equal(after.contractFingerprint, before.contractFingerprint);
  assert.notEqual(after.hash, before.hash);
  assert.throws(() => f.service.approve(f.who, f.tenant.id, f.project.id, releaseId, { approved: true, previewReviewed: true }), { code: 'DESIGN_CONTEXT_CHANGED' });
});

test('legacy design compatibility is explicit and cannot enter production or a reviewed design project', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  await scanned(f);
  const releaseId = (await generated(f, { variants: 1 })).releaseIds[0];
  const release = f.service.release(f.who, f.tenant.id, f.project.id, releaseId);
  const scope = projectAccess(f.db, f.who, f.tenant.id, f.project.id);
  const legacy = structuredClone(release);
  delete legacy.artifact.bundle.provenance.designContextHash;
  delete legacy.artifact.bundle.provenance.designContractFingerprint;
  assert.equal(f.service.validateRelease(scope, legacy), legacy.artifact);
  assert.throws(() => f.service.validateRelease(scope, legacy, { environment: 'production' }), { code: 'DESIGN_CONTEXT_CHANGED' });
  assert.throws(() => f.service.validateRelease(scope, release, { environment: 'production' }), { code: 'DESIGN_REVIEW_REQUIRED' });
  const malformed = structuredClone(legacy);
  malformed.artifact.bundle.provenance.designContextHash = null;
  assert.throws(() => f.service.validateRelease(scope, malformed), { code: 'DESIGN_CONTEXT_CHANGED' });
  approvedDesign(f);
  assert.throws(() => f.service.validateRelease(scope, legacy), { code: 'DESIGN_CONTEXT_CHANGED' });
  assert.throws(() => f.service.currentDesignContext({ ...scope }), { code: 'SCOPE_REQUIRED' });
});
