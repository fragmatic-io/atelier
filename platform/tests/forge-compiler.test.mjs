import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  AgentOrchestrator,
  JsonModelAdapter,
  deterministicBuildAgents,
  refineArtifactWithModel,
} from '../packages/agents/src/index.mjs';
import { ComponentForge, ForgeMemory } from '../packages/component-forge/src/index.mjs';
import {
  BASELINE_COMPONENTS,
  compileAdditiveExperience,
  sanitizeModelRefinement,
  sanitizeRuntimePatch,
} from '../packages/experience-compiler/src/index.mjs';
import { Evaluator } from '../packages/evaluator/src/index.mjs';
import { buildFixtureModel, tempFixture } from './helpers.mjs';

test('reuse-first resolver selects a project component before invention', async () => {
  const { model } = await buildFixtureModel();
  const forge = new ComponentForge({ reuseThreshold: 0.05 });
  const decision = forge.findReusable(
    {
      goal: 'Show customer summary risk status',
      requiredInformation: ['Customer.riskScore'],
      candidateActions: [],
    },
    model,
  );
  assert.equal(decision.kind, 'reuse');
  assert.ok(decision.componentIds.length === 1);
});

test('novel Component Forge emits project-native source, stories, tests and a rich contract', async () => {
  const { model } = await buildFixtureModel();
  const forge = new ComponentForge();
  const result = forge.generate(
    {
      goal: 'Coordinate a cross-functional renewal rescue ritual',
      requiredInformation: ['customer.get.riskScore', 'customer.get.nextBestAction'],
      candidateActions: ['intervention.create'],
    },
    model,
    model.designGenome,
    { name: 'RenewalRescueWorkbench', force: true },
  );
  assert.equal(result.kind, 'forged');
  assert.ok(
    result.files['src/atelier-generated/RenewalRescueWorkbench.tsx'].includes(
      'export function RenewalRescueWorkbench',
    ),
  );
  assert.ok(
    result.files['src/atelier-generated/RenewalRescueWorkbench.stories.tsx'].includes('Loading'),
  );
  assert.ok(
    result.contract.states.loading && result.contract.states.empty && result.contract.states.error,
  );
  assert.ok(result.contract.accessibilityContract.keyboard);
  assert.ok(result.artifactHash);
});

test('Component Forge writes ordinary editable source into a host project', async (t) => {
  const temp = await tempFixture('atelier-forge-');
  t.after(temp.cleanup);
  const { model } = await buildFixtureModel(temp.dir);
  const forge = new ComponentForge();
  const result = forge.generate(
    {
      goal: 'Create an unusual intervention evidence matrix',
      requiredInformation: ['a', 'b'],
      candidateActions: [],
    },
    model,
    model.designGenome,
    { name: 'EvidenceMatrix', force: true },
  );
  const written = await forge.write(temp.dir, result);
  assert.equal(written.length, 4);
  const source = await readFile(join(temp.dir, 'src/atelier-generated/EvidenceMatrix.tsx'), 'utf8');
  assert.ok(source.includes('host-panel'));
  assert.equal(/#[0-9a-f]{3,8}/i.test(source), false);
});

test('specialist build agents execute as a typed dependency DAG', async () => {
  const { model } = await buildFixtureModel();
  const forge = new ComponentForge({ reuseThreshold: 1, compositionThreshold: 1 });
  const evaluator = new Evaluator();
  const slot = model.slots.find((x) => x.id === 'customer.detail.right-rail');
  const agents = deterministicBuildAgents({ forge, evaluator });
  const result = await new AgentOrchestrator({ agents, concurrency: 3 }).run({
    projectModel: model,
    slot,
    goal: 'Create a highly specific customer intervention evidence cockpit',
  });
  assert.equal(result.artifacts.publishDecision.approved, true);
  assert.equal(result.trace.length, agents.length);
  assert.ok(result.trace.every((entry) => entry.inputHash && entry.outputHash));
});

test('semantic compiler exposes only capabilities permitted by the current identity', async () => {
  const { model } = await buildFixtureModel();
  const limited = compileAdditiveExperience({
    actor: 'viewer',
    context: { role: 'viewer', permissions: ['customer.read'] },
    goal: 'Understand this customer',
    projectModel: model,
    slotId: 'customer.detail.right-rail',
    contextClass: { role: 'viewer', taskCluster: 'review', entityType: 'Customer' },
  });
  assert.deepEqual(limited.task.permittedActions, []);
  assert.ok(limited.task.requiredInformation.length > 0);
  const actions = [];
  const visit = (node) => {
    actions.push(...(node.actions ?? []));
    for (const child of node.children ?? []) visit(child);
  };
  visit(limited.bundle.manifest.root);
  assert.deepEqual(actions, []);
});

test('semantic compiler builds a complete additive bundle for an authorized operator', async () => {
  const { model } = await buildFixtureModel();
  const result = compileAdditiveExperience({
    actor: 'support_manager',
    context: {
      role: 'support_manager',
      permissions: ['customer.read', 'customer.intervene', 'customer.archive'],
    },
    goal: 'Understand this customer escalation and choose the next intervention',
    projectModel: model,
    slotId: 'customer.detail.right-rail',
    contextClass: {
      role: 'support_manager',
      taskCluster: 'understand-and-act',
      entityType: 'Customer',
      locale: 'en',
    },
  });
  assert.ok(result.task.requiredInformation.length > 0);
  assert.ok(result.task.permittedActions.includes('intervention.create'));
  assert.ok(result.task.permittedActions.includes('customer.archive'));
  assert.equal(result.bundle.policyProof.passed, true);
  assert.ok(result.bundle.manifest.root.children.some((node) => node.data?.states?.loading));
  const report = new Evaluator().evaluateBundle(result.bundle, model);
  assert.equal(report.approved, true);
  assert.ok(report.score >= 0.95);
});

test('model refinement cannot introduce code, components, actions or PII', async () => {
  const { model } = await buildFixtureModel();
  const compiled = compileAdditiveExperience({
    actor: 'support_manager',
    context: { permissions: ['customer.read', 'customer.intervene'] },
    goal: 'Review customer risk',
    projectModel: model,
    slotId: 'customer.detail.right-rail',
    contextClass: { role: 'support_manager', taskCluster: 'review', entityType: 'Customer' },
  });
  const proposal = {
    javascript: 'fetch("https://evil.invalid")',
    manifest: {
      root: {
        component: 'InventedSuperPanel',
        actions: ['root.destroy_everything'],
        data: { source: 'customer.get', select: ['email', 'riskScore'] },
        children: [],
      },
    },
  };
  const clean = sanitizeModelRefinement(proposal, {
    task: compiled.task,
    bundle: compiled.bundle,
    projectModel: model,
  });
  assert.equal(clean.javascript, undefined);
  assert.equal(clean.manifest.root.component, 'Alert');
  assert.deepEqual(clean.manifest.root.actions ?? [], []);
  assert.deepEqual(clean.manifest.root.data.select, ['riskScore']);
  assert.ok(clean.modelProvenance.proposalHash);
  const sources = [];
  const visit = (node) => {
    if (node.data?.source) sources.push(node.data.source);
    for (const child of node.children ?? []) visit(child);
  };
  visit(clean.manifest.root);
  for (const item of compiled.task.requiredInformation)
    assert.ok(sources.includes(item.capabilityId));
});

test('runtime patch sanitizer enforces the autonomy ladder', async () => {
  const { model } = await buildFixtureModel();
  const compiled = compileAdditiveExperience({
    actor: 'viewer',
    context: { permissions: ['customer.read'] },
    goal: 'Review customer',
    projectModel: model,
    slotId: 'customer.detail.right-rail',
    contextClass: { role: 'viewer' },
  });
  const patch = sanitizeRuntimePatch(
    {
      density: 'compact',
      hiddenModules: ['evidence', 'imaginary'],
      rawCss: 'body{}',
      suggestedActions: ['customer.archive', 'evil.action'],
    },
    { bundle: compiled.bundle, projectModel: model, maxAdaptationLevel: 1 },
  );
  assert.equal(patch.density, 'compact');
  assert.equal(patch.hiddenModules, undefined);
  assert.equal(patch.rawCss, undefined);
  assert.deepEqual(patch.suggestedActions, ['customer.archive']);
});

test('Forge memory learns from accepted and rejected project-native patterns', () => {
  const memory = new ForgeMemory();
  const brief = { goal: 'customer renewal rescue', requiredInformation: ['risk'] };
  memory.accepted(brief, 'RenewalPanel', 'Used successfully');
  assert.ok(memory.adjustment(brief, 'RenewalPanel') > 0);
  memory.rejected(brief, 'RenewalPanel', 'Too dense');
  assert.ok(memory.export().length === 2);
});

test('model adapter refinement is sanitized before it becomes an artifact', async () => {
  const model = new JsonModelAdapter({
    id: 'test-specialist',
    complete: async () => ({
      javascript: 'evil()',
      density: 'compact',
      actions: ['known', 'evil'],
    }),
  });
  const result = await refineArtifactWithModel({
    model,
    system: 'Improve this bounded artifact.',
    artifact: { density: 'balanced', actions: [] },
    context: { allowedActions: ['known'] },
    sanitize: (proposal, { context }) => ({
      density: proposal.density,
      actions: proposal.actions.filter((x) => context.allowedActions.includes(x)),
    }),
  });
  assert.equal(result.usedModel, true);
  assert.deepEqual(result.artifact, { density: 'compact', actions: ['known'] });
  assert.ok(result.provenance.proposalHash);
});
