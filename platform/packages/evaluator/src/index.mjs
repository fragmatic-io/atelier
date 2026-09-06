// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import {
  AtelierError,
  canonicalJson,
  isPiiField,
  sha256,
  validateScreenBundle,
} from '../../contracts/src/index.mjs';
import { BASELINE_COMPONENTS } from '../../experience-compiler/src/index.mjs';

const RAW_STYLE = /#[0-9a-f]{3,8}|rgba?\(|hsla?\(|\b\d+(?:\.\d+)?px\b/i;

function walk(node, visit, path = 'root') {
  if (!node) return;
  visit(node, path);
  for (let i = 0; i < (node.children ?? []).length; i += 1)
    walk(node.children[i], visit, `${path}.children[${i}]`);
  if (node.data?.states)
    for (const [state, child] of Object.entries(node.data.states))
      walk(child, visit, `${path}.states.${state}`);
}

function check(id, pass, weight, message, severity = 'error', details = {}) {
  return { id, pass: Boolean(pass), weight, message, severity, details };
}

export function simulateTask(bundle, task = bundle.taskSpec) {
  const dataSources = new Set();
  const actions = new Set();
  const text = [];
  walk(bundle.manifest.root, (node) => {
    if (node.data?.source) dataSources.add(node.data.source);
    for (const action of node.actions ?? []) actions.add(action);
    for (const value of Object.values(node.props ?? {}))
      if (typeof value === 'string') text.push(value.toLowerCase());
  });
  const missingInformation = task.requiredInformation.filter(
    (item) => !dataSources.has(item.capabilityId),
  );
  const missingActions = task.permittedActions.filter((action) => !actions.has(action));
  const goalTokens =
    String(task.goal)
      .toLowerCase()
      .match(/[a-z0-9]+/g) ?? [];
  const goalCoverage = goalTokens.length
    ? goalTokens.filter((token) => text.some((value) => value.includes(token))).length /
      goalTokens.length
    : 1;
  return {
    kind: 'static-plan-coverage-not-browser-simulation',
    completed: missingInformation.length === 0 && missingActions.length === 0,
    missingInformation,
    missingActions,
    goalCoverage: Number(goalCoverage.toFixed(3)),
    estimatedInteractions: Math.max(1, task.permittedActions.length),
    pageTransitions: 0,
  };
}

export function evaluateBundle(
  bundle,
  projectModel,
  { visualCritic = null, threshold = 0.86 } = {},
) {
  const checks = [];
  const componentIds = new Set([
    ...BASELINE_COMPONENTS,
    ...projectModel.components.map((x) => x.id),
  ]);
  const capabilityIds = new Set(projectModel.capabilities.map((x) => x.id));
  try {
    validateScreenBundle(bundle, {
      components: [...componentIds],
      capabilities: [...capabilityIds],
    });
    checks.push(
      check(
        'schema-and-registry',
        true,
        15,
        'Bundle validates against registered components and capabilities.',
      ),
    );
  } catch (error) {
    checks.push(
      check('schema-and-registry', false, 15, error.message, 'blocker', { code: error.code }),
    );
  }

  const nodes = [];
  walk(bundle.manifest.root, (node, path) => nodes.push({ node, path }));
  const dataNodes = nodes.filter(({ node }) => node.data?.source);
  const actionNodes = nodes.filter(({ node }) => node.actions?.length);
  checks.push(
    check(
      'state-completeness',
      dataNodes.every(({ node }) =>
        ['loading', 'empty', 'error'].every((state) => node.data.states?.[state]),
      ),
      10,
      'Every data binding has loading, empty and error states.',
    ),
  );
  checks.push(
    check(
      'nonempty-containers',
      nodes
        .filter(({ node }) => ['Section', 'Stack', 'Grid', 'ActionBar'].includes(node.component))
        .every(({ node }) => (node.children ?? []).length > 0),
      7,
      'Containers are not empty.',
    ),
  );
  checks.push(
    check(
      'accessible-buttons',
      actionNodes.every(
        ({ node }) => typeof node.props?.label === 'string' && node.props.label.trim(),
      ),
      8,
      'Every action has an accessible label.',
    ),
  );
  checks.push(
    check(
      'heading-present',
      nodes.some(({ node }) => node.component === 'Heading'),
      6,
      'The extension contains an explicit heading.',
    ),
  );
  checks.push(
    check(
      'raw-style-free',
      nodes.every(({ node }) => !RAW_STYLE.test(canonicalJson(node.props ?? {}))),
      8,
      'Manifest props do not contain raw colors or pixels.',
    ),
  );

  const destructive = projectModel.capabilities
    .filter((cap) => cap.risk === 'destructive')
    .map((x) => x.id);
  checks.push(
    check(
      'destructive-confirmation',
      actionNodes.every(({ node }) =>
        (node.actions ?? [])
          .filter((id) => destructive.includes(id))
          .every(() => ['modal', 'verbal_required'].includes(node.confirmation)),
      ),
      12,
      'Destructive actions require modal or verbal confirmation.',
      'blocker',
    ),
  );

  const slot = projectModel.slots.find((x) => x.id === bundle.slotId);
  const piiExposures = dataNodes.flatMap(({ node, path }) =>
    (node.data.select ?? [])
      .filter((field) => isPiiField(field) && !slot?.allowedPiiFields?.includes(field))
      .map((field) => ({ path, field })),
  );
  checks.push(
    check(
      'pii-policy',
      piiExposures.length === 0,
      14,
      'Unapproved PII fields are not projected.',
      'blocker',
      { exposures: piiExposures },
    ),
  );
  checks.push(
    check(
      'policy-proof',
      bundle.policyProof?.passed === true,
      10,
      'Compiler policy proof passed.',
      'blocker',
    ),
  );

  const simulation = simulateTask(bundle);
  checks.push(
    check(
      'task-completion',
      simulation.completed,
      10,
      'The generated surface covers required information and actions.',
      'blocker',
      simulation,
    ),
  );
  const projectTokens = new Set(Object.keys(projectModel.designGenome?.hardTokens?.all ?? {}));
  const generatedComponents = projectModel.components.filter((x) => x.provenance?.generatedBy);
  checks.push(
    check(
      'design-native-components',
      generatedComponents.every(
        (component) =>
          !component.tokensUsed?.length ||
          component.tokensUsed.some((token) => projectTokens.has(token)),
      ),
      5,
      'Generated components reference host design tokens.',
    ),
  );

  let visual = {
    available: false,
    score: null,
    status: 'not-run',
    notes: ['No screenshot critic ran. Visual quality requires separate review.'],
  };
  if (visualCritic) visual = visualCritic({ bundle, projectModel });
  checks.push(
    check(
      'visual-critic',
      visual.available && visual.score >= 0.8,
      visual.available ? 5 : 0,
      'Visual critic meets threshold.',
      'warning',
      visual,
    ),
  );

  const max = checks.reduce((sum, item) => sum + item.weight, 0);
  const earned = checks.reduce((sum, item) => sum + (item.pass ? item.weight : 0), 0);
  const score = Number((earned / max).toFixed(3));
  const blockers = checks.filter((item) => !item.pass && item.severity === 'blocker');
  return {
    bundleId: bundle.bundleId,
    score,
    threshold,
    approved: score >= threshold && blockers.length === 0,
    checks,
    blockers,
    simulation,
    visual,
    reportHash: sha256({ bundleId: bundle.bundleId, checks, simulation, visual }),
    evaluatedAt: new Date().toISOString(),
  };
}

export class Evaluator {
  constructor(options = {}) {
    this.options = options;
  }
  evaluateBundle(bundle, projectModel) {
    return evaluateBundle(bundle, projectModel, this.options);
  }
  evaluateBuildArtifact({ brief, artifact, projectModel }) {
    const blockers = [];
    const warnings = [];
    if (artifact.kind === 'forged') {
      if (
        !artifact.contract?.states?.loading ||
        !artifact.contract?.states?.empty ||
        !artifact.contract?.states?.error
      )
        blockers.push('Generated component lacks complete runtime states.');
      if (!artifact.contract?.accessibilityContract?.keyboard)
        blockers.push('Generated component lacks a keyboard accessibility contract.');
      if ((artifact.nativeFit?.total ?? 0) < 0.75)
        warnings.push('Generated component has weak host-native fit.');
      const source =
        Object.values(artifact.files ?? {}).find(
          (value) => typeof value === 'string' && value.includes('export function'),
        ) ?? '';
      if (RAW_STYLE.test(source))
        blockers.push('Generated component source contains raw design values.');
    }
    return {
      approved: blockers.length === 0,
      blockers,
      warnings,
      briefHash: sha256(brief),
      artifactHash: sha256(artifact),
      projectVersion: projectModel.projectVersion,
    };
  }
}
