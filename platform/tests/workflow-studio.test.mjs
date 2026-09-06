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
