import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  WorkflowRecorder,
  adaptationAllowed,
  mineWorkflowOpportunities,
} from '../packages/workflow/src/index.mjs';
import { renderStudio, writeStudio } from '../packages/studio/src/index.mjs';
import { buildFixtureModel, tempFixture, FIXTURE } from './helpers.mjs';

test('semantic recorder strips payload-like and PII metadata', () => {
  const recorder = new WorkflowRecorder();
  const event = recorder.record({
    type: 'route.opened',
    sessionId: 's',
    metadata: { filterName: 'risk', payload: { secret: 1 }, email: 'x@y.test', count: 3 },
  });
  assert.deepEqual(event.metadata, { filterName: 'risk', count: 3 });
});

test('workflow miner produces evidence-backed additive screen opportunities', async () => {
  const events = JSON.parse(await readFile(join(FIXTURE, 'atelier.events.json'), 'utf8'));
  const { model } = await buildFixtureModel();
  const opportunities = mineWorkflowOpportunities(events, {
    minSessions: 2,
    availableSlots: model.slots,
  });
  assert.equal(opportunities.length, 1);
  const opportunity = opportunities[0];
  assert.ok(opportunity.frictionEvidence.averageTransitions >= 3);
  assert.ok(opportunity.expectedImprovement.pageTransitionsReduced >= 1);
  assert.ok(opportunity.candidateInsertionPoints.includes('customer.detail.right-rail'));
  assert.ok(opportunity.evidenceHash);
});

test('adaptation ladder prevents runtime component and capability invention', () => {
  assert.equal(adaptationAllowed(0, 'prioritize'), true);
  assert.equal(adaptationAllowed(2, 'hide_module'), true);
  assert.equal(adaptationAllowed(2, 'compose_bundle'), false);
  assert.equal(adaptationAllowed(3, 'generate_component'), false);
  assert.equal(adaptationAllowed(5, 'add_capability'), true);
});

test('Studio renders escaped project review, design and opportunity views', async (t) => {
  const { model } = await buildFixtureModel();
  const html = renderStudio({
    model,
    opportunities: [
      {
        proposedGoal: '<unsafe>',
        observedWorkflow: 'a → b',
        confidence: 0.9,
        frictionEvidence: { sessionCount: 2 },
        candidateInsertionPoints: [],
      },
    ],
    bundles: [],
    evaluations: [],
  });
  assert.ok(html.includes('Capability review'));
  assert.ok(html.includes('Design genome'));
  assert.ok(html.includes('&lt;unsafe&gt;'));
  assert.equal(html.includes('<unsafe>'), false);
  const temp = await tempFixture('atelier-studio-');
  t.after(temp.cleanup);
  const out = await writeStudio(join(temp.dir, '.atelier/studio'), {
    model,
    opportunities: [],
    bundles: [],
    evaluations: [],
  });
  assert.ok((await readFile(out.html, 'utf8')).includes('ATELIER V2 STUDIO'));
  assert.ok(JSON.parse(await readFile(out.data, 'utf8')).model.projectId);
});

test('Studio source exposes the automatic API reference controls and operation count', async () => {
  const source = await readFile(join(FIXTURE, '../../apps/studio/web/app.mjs'), 'utf8');
  assert.match(source, /API reference/);
  assert.match(source, /Download OpenAPI/);
  assert.match(source, /operationCount/);
  assert.match(source, /\/openapi/);
});

test('Studio mounts an accessible OpenAPI picker for browser and keyboard clients', async () => {
  const source = await readFile(join(FIXTURE, '../../apps/studio/web/app.mjs'), 'utf8');
  assert.match(source, /aria-label', 'OpenAPI document'/);
  assert.match(source, /document\.body\.append\(picker\)/);
  assert.match(source, /picker\.addEventListener\('cancel', cleanup/);
  assert.match(source, /finally \{\s*cleanup\(\);\s*\}/);
});

test('Studio exposes bulk capability review separately from bulk agent access', async () => {
  const source = await readFile(join(FIXTURE, '../../apps/studio/web/app.mjs'), 'utf8');
  const catalog = await readFile(
    join(FIXTURE, '../../apps/studio/web/capability-catalog.mjs'),
    'utf8',
  );
  assert.match(catalog, /Approve all pending/);
  assert.match(catalog, /Bulk approval never exposes a capability to an agent/);
  assert.match(catalog, /Enable selected for agents/);
  assert.match(catalog, /Reopen selected/);
  assert.match(source, /capabilities\/bulk-review/);
  assert.match(source, /capabilities\/bulk-agent-access/);
  assert.match(source, /capabilities\/bulk-reopen/);
  assert.match(source, /projectVersion: state\.model\.projectVersion/);
});

test('hosted installer handoff includes the rich-component frame CSP directive', async () => {
  const source = await readFile(
    join(FIXTURE, '../../apps/studio/web/install-surface.mjs'),
    'utf8',
  );
  assert.match(source, /script-src, connect-src, style-src and frame-src/);
});
