import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ready, kit, useProvider } from '../v23/helpers.mjs';
import { SourceRegistry } from '../../packages/source-forge/src/registry.mjs';
import { projectAccess } from '../../packages/control-plane/src/access.mjs';
import { expectedCases } from '../../packages/source-forge/src/certifier.mjs';
import { hash } from '../../packages/conversation/src/common.mjs';

// Privileged, explicit unit doubles exercise the control-plane lifecycle only.
// They cannot be used as real browser, visual-provider or production evidence.
const bytes = Buffer.from([255, 216, 255, 217]);
const imageHash = createHash('sha256').update(bytes).digest('hex');
async function setup(t) {
  const f = await ready();
  t.after(() => f.db.close());
  useProvider(f);
  f.components = new SourceRegistry(f.service, {
    compiler: async (source, options) => {
      const body = { kit: source, ...options, javascript: '/* explicit nonexecutable lifecycle unit fixture */', executionContractHash: 'unit-fixture' };
      return { ...body, digest: hash(body) };
    },
    certifier: async (compiled) => {
      const cases = expectedCases(compiled.qualityContract);
      return {
        protocol: 2, runner: 'chromium-sandboxed-react-v2', runnerHash: 'unit-fixture', isolation: 'local',
        digest: compiled.digest, designContextHash: compiled.designContext.hash,
        qualityContractHash: compiled.qualityContract.hash, profile: compiled.qualityContract.profile,
        axeHash: null, passed: true, fixtureOnly: true,
        checks: cases.map((item) => ({ name: item.name, passed: true, tasks: item.state === 'ready' ? compiled.kit.tasks.length : 0 })),
        captures: cases.map((item) => ({
          name: item.name, phase: 'initial', width: item.width, height: 850,
          theme: item.theme, state: item.state, direction: item.direction, capture: 'viewport',
          sha256: imageHash, bytes: bytes.length, dataUrl: `data:image/jpeg;base64,${bytes.toString('base64')}`,
        })),
      };
    },
  });
  f.originalKit = await kit();
  f.goal = 'Help the operator organize the delivery board';
  return f;
}

function queue(f) {
  const queued = f.components.propose(f.who, f.tenant.id, f.project.id, {
    goal: f.goal, actions: [], qualityContract: { goal: f.goal, dataPolicy: 'synthetic', visualReviewRequired: true, maxRepairAttempts: 2 },
  });
  const job = f.db.get('SELECT * FROM jobs WHERE id=?', queued.id);
  const scope = projectAccess(f.db, f.who, f.tenant.id, f.project.id);
  return { job, scope, input: JSON.parse(job.input_json) };
}

function author(f, request, attempt) {
  if (request.stage === 'architect')
    return { layout: 'Use the approved host layout', interaction: 'Organize records', hierarchy: ['Records', 'Current state'], risks: [] };
  if (request.stage === 'critic') return { acceptable: true, issues: [] };
  if (request.stage === 'component') {
    const { modules, dataSchema, sampleData, ...rest } = f.originalKit;
    return { ...rest, source: `${rest.source}\n/* unit candidate ${attempt} */`, modulesJson: JSON.stringify(modules), dataSchemaJson: JSON.stringify(dataSchema), sampleDataJson: JSON.stringify(sampleData) };
  }
  throw new Error('Unexpected fixture model stage');
}

test('source vision rejection feeds exact evidence into a new candidate without changing its oracle', async (t) => {
  const f = await setup(t), task = queue(f);
  const frozen = f.service.store.getArtifact(task.scope, task.input.qualityArtifactId, 'source-quality-contract').content;
  assert.equal(frozen.origin, 'caller-supplied-before-generation');
  let attempts = 0;
  const componentRequests = [];
  const gateway = { generate: async (request) => {
    let value;
    if (request.stage === 'component') { attempts++; componentRequests.push(request); }
    if (request.stage === 'visual') value = {
      acceptable: attempts > 1,
      issues: attempts > 1 ? [] : [{ severity: 'major', criterion: 'hierarchy', captureName: request.input.captures[0].captureName, message: 'Fixture hierarchy requires repair', repair: 'Clarify the primary record hierarchy' }],
      strengths: [],
    };
    else value = author(f, request, attempts);
    return { value, provider: 'explicit-unit-fixture', model: 'not-a-live-model' };
  } };
  const result = await f.components.execute(task.scope, task.job, task.input, { gateway, checkpoint() {} });
  assert.equal(result.next, 'review');
  assert.equal(result.passed, true);
  assert.equal(attempts, 2);
  assert.ok(componentRequests[1].input.repairs[0].priorSourceDigest);
  assert.ok(componentRequests[1].input.repairs[0].findings.some((item) => item.kind === 'visual'));
  assert.equal(componentRequests[0].input.taskContract.hash, frozen.qualityContract.hash);
  assert.equal(componentRequests[1].input.taskContract.hash, frozen.qualityContract.hash);
  const components = f.components.list(f.who, f.tenant.id, f.project.id);
  assert.equal(components.length, 2);
  assert.ok(components.every((item) => item.status === 'draft'));
  const rejected = components.find((item) => item.id !== result.id);
  assert.equal(f.components.get(f.who, f.tenant.id, f.project.id, rejected.id).evidence.passed, false);
  const completed = f.components.get(f.who, f.tenant.id, f.project.id, result.id);
  assert.equal(completed.compiled.qualityContract.hash, frozen.qualityContract.hash);
  assert.equal(completed.evidence.designContextHash, completed.compiled.designContext.hash);
  assert.equal(completed.captures.length, 17);
});

test('vision provider failure retains non-approvable evidence and never falls back to fixture success', async (t) => {
  const f = await setup(t), task = queue(f);
  const gateway = { generate: async (request) => {
    if (request.stage === 'visual') throw Object.assign(new Error('Explicit unavailable provider fixture'), { code: 'PROVIDER_UNAVAILABLE' });
    return { value: author(f, request, 1), provider: 'explicit-unit-fixture', model: 'not-a-live-model' };
  } };
  await assert.rejects(f.components.execute(task.scope, task.job, task.input, { gateway, checkpoint() {} }), { code: 'PROVIDER_UNAVAILABLE' });
  const rows = f.components.list(f.who, f.tenant.id, f.project.id);
  assert.equal(rows.length, 1);
  const failed = f.components.get(f.who, f.tenant.id, f.project.id, rows[0].id);
  assert.equal(failed.evidence.passed, false);
  assert.equal(failed.evidence.browserPassed, true);
  assert.equal(failed.evidence.visual.status, 'unavailable');
  assert.equal(failed.captures.length, 17);
  assert.throws(() => f.components.approve(f.who, f.tenant.id, f.project.id, rows[0].id, {
    digest: rows[0].digest, previewReviewed: true, tasksReviewed: true, note: 'This evidence cannot pass',
  }), { code: 'EVIDENCE_REQUIRED' });
});

test('an imported explicit task goal remains distinct from copy and cannot be reused for an expanded request', async (t) => {
  const f = await setup(t);
  const source = { ...f.originalKit, name: 'Delivery board', description: 'Descriptive copy for the source module' };
  const qualityContract = { profile: 'standard', goal: 'Delivery board' };
  const imported = await f.components.import(f.who, f.tenant.id, f.project.id, { kit: source, qualityContract });
  const scope = projectAccess(f.db, f.who, f.tenant.id, f.project.id);
  const compiled = f.components.get(f.who, f.tenant.id, f.project.id, imported.id).compiled;
  assert.equal(compiled.qualityContract.goal, 'Delivery board');
  assert.equal(compiled.kit.description, 'Descriptive copy for the source module');
  await f.components.certifyComponent(scope, f.components.row(scope, imported.id), { checkpoint() {}, job: {} });
  f.components.approve(f.who, f.tenant.id, f.project.id, imported.id, {
    digest: imported.digest, previewReviewed: true, tasksReviewed: true, note: 'Explicit lifecycle fixture review only',
  });
  f.components.publish(f.who, f.tenant.id, f.project.id, imported.id);
  const same = f.components.propose(f.who, f.tenant.id, f.project.id, { goal: ' Delivery board ', actions: [], qualityContract });
  assert.equal(same.reused, true);
  assert.equal(same.component.id, imported.id);
  const before = f.service.store.listArtifacts(scope, 'source-quality-contract').length;
  assert.throws(() => f.components.propose(f.who, f.tenant.id, f.project.id, {
    goal: 'Delivery board with export', actions: [], qualityContract,
  }), { code: 'QUALITY_GOAL_MISMATCH' });
  assert.equal(f.service.store.listArtifacts(scope, 'source-quality-contract').length, before);
});

test('tightened project visual policy blocks old source at approval, publication and runtime', async (t) => {
  const f = await setup(t);
  const scope = projectAccess(f.db, f.who, f.tenant.id, f.project.id);
  const create = async (suffix, state) => {
    const imported = await f.components.import(f.who, f.tenant.id, f.project.id, {
      kit: { ...f.originalKit, source: `${f.originalKit.source}\n/* policy fixture ${suffix} */` },
      qualityContract: { profile: 'standard', goal: 'Delivery board' },
    });
    await f.components.certifyComponent(scope, f.components.row(scope, imported.id), { checkpoint() {}, job: {} });
    if (state !== 'draft')
      f.components.approve(f.who, f.tenant.id, f.project.id, imported.id, {
        digest: imported.digest, previewReviewed: true, tasksReviewed: true, note: 'Explicit policy lifecycle fixture',
      });
    if (state === 'published') f.components.publish(f.who, f.tenant.id, f.project.id, imported.id);
    return imported;
  };
  const draft = await create('draft', 'draft');
  const approved = await create('approved', 'approved');
  const published = await create('published', 'published');
  const project = f.service.project(f.who, f.tenant.id, f.project.id);
  f.service.updateProject(f.who, f.tenant.id, f.project.id, {
    revision: project.revision, settings: { visualReviewRequired: true },
  });
  assert.throws(() => f.components.approve(f.who, f.tenant.id, f.project.id, draft.id, {
    digest: draft.digest, previewReviewed: true, tasksReviewed: true, note: 'Old evidence cannot bypass the new policy',
  }), { code: 'SOURCE_QUALITY_POLICY_CHANGED' });
  assert.throws(() => f.components.publish(f.who, f.tenant.id, f.project.id, approved.id), { code: 'SOURCE_QUALITY_POLICY_CHANGED' });
  assert.throws(() => f.components.published(scope, published.id), { code: 'SOURCE_QUALITY_POLICY_CHANGED' });
  assert.throws(() => f.components.queueCertification(f.who, f.tenant.id, f.project.id, draft.id), { code: 'SOURCE_QUALITY_POLICY_CHANGED' });
});
