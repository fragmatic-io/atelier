// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import {
  canonicalJson,
  deepClone,
  invariant,
  isPiiField,
  sha256,
  stableId,
  validateScreenBundle,
} from '../../contracts/src/index.mjs';
import { ComponentForge } from '../../component-forge/src/index.mjs';

export const BASELINE_COMPONENTS = Object.freeze([
  'Stack',
  'Grid',
  'Section',
  'Heading',
  'Text',
  'StatusBadge',
  'KeyValueList',
  'Timeline',
  'ActionBar',
  'Button',
  'Alert',
  'Spinner',
  'EmptyState',
  'ErrorState',
  'Table',
  'Drawer',
  'Tabs',
  'ConfirmDialog',
  'UndoToast',
]);

export function baselineComponentContracts() {
  return BASELINE_COMPONENTS.map((id) => ({
    id,
    framework: 'runtime',
    sourcePath: '@atelier/runtime',
    exportName: id,
    chunkId: `baseline:${id}`,
    contentHash: sha256(id),
    purpose: `Portable baseline ${id} component`,
    goodFor: [id.toLowerCase()],
    avoidFor: [],
    propsSchema: { type: 'object', additionalProperties: true },
    slots: [],
    events: [],
    acceptedDataShapes: [],
    allowedCapabilityKinds: ['query', 'command'],
    layoutRole: ['Stack', 'Grid', 'Section'].includes(id)
      ? 'container'
      : ['Table', 'Timeline'].includes(id)
        ? 'collection'
        : 'primitive',
    states: { loading: true, empty: true, error: true, disabled: true, readonly: true },
    responsiveBehavior: { strategy: 'intrinsic' },
    accessibilityContract: { semantic: true },
    tokensUsed: [],
    visualExamples: [],
    confidence: 1,
    evidence: [],
  }));
}

export function createTaskSpec({
  actor,
  context,
  goal,
  successCriteria = [],
  projectModel,
  slotId,
}) {
  const slot = projectModel.slots.find((x) => x.id === slotId);
  invariant(slot, 'SLOT_NOT_FOUND', `Slot ${slotId} is not registered`);
  const grantedPermissions = new Set(context?.permissions ?? []);
  const hasAccess = (capability) =>
    (capability.requiredPermissions ?? []).every((permission) =>
      grantedPermissions.has(permission),
    );
  const relevantCapabilities = projectModel.capabilities.filter(
    (capability) =>
      (slot.allowedCapabilityGroups.includes('*') ||
        slot.allowedCapabilityGroups.some((group) => capability.id.startsWith(group))) &&
      hasAccess(capability),
  );
  const queryCaps = relevantCapabilities.filter((x) => x.kind === 'query');
  const commandCaps = relevantCapabilities.filter(
    (x) => x.kind === 'command' && slot.allowWriteActions,
  );
  const requiredInformation = queryCaps.flatMap((capability) => {
    const props =
      capability.outputSchema?.properties ?? capability.outputSchema?.items?.properties ?? {};
    return Object.keys(props)
      .filter((field) => !isPiiField(field) || slot.allowedPiiFields.includes(field))
      .slice(0, 8)
      .map((field) => ({ capabilityId: capability.id, field }));
  });
  return {
    id: stableId('task', { actor, context, goal, slotId }),
    actor,
    context,
    goal,
    successCriteria: successCriteria.length
      ? successCriteria
      : [
          'Relevant context is visible without leaving the host screen.',
          'Only authorized actions are exposed.',
          'Loading, empty and error states are explicit.',
        ],
    requiredInformation,
    permittedActions: commandCaps.map((x) => x.id),
    constraints: [`slot:${slotId}`, `adaptation<=${slot.maxAdaptationLevel}`],
    riskLevel: commandCaps.some((x) => x.risk === 'destructive')
      ? 'destructive'
      : commandCaps.length
        ? 'sensitive'
        : 'read_only',
  };
}

export function createExperiencePlan(task, projectModel, { insertionStrategy = null } = {}) {
  const slot = projectModel.slots.find(
    (x) => x.id === task.constraints.find((x) => x.startsWith('slot:'))?.slice(5),
  );
  const queryGroups = new Map();
  for (const item of task.requiredInformation) {
    const list = queryGroups.get(item.capabilityId) ?? [];
    list.push(item.field);
    queryGroups.set(item.capabilityId, list);
  }
  const queries = [...queryGroups.entries()].map(([capabilityId, fields]) => ({
    capabilityId,
    fields: [...new Set(fields)],
    cache: 'host-data-cache',
  }));
  const actions = task.permittedActions.map((capabilityId) => {
    const cap = projectModel.capabilities.find((x) => x.id === capabilityId);
    return {
      capabilityId,
      confirmation: cap.confirmation,
      risk: cap.risk,
      reversible: cap.reversible === true,
      rollbackCapabilityId: cap.rollbackCapabilityId,
    };
  });
  return {
    id: stableId('plan', { task, projectVersion: projectModel.projectVersion }),
    taskId: task.id,
    regions: [
      { id: 'summary', purpose: 'Orient the user and show salient status', priority: 1 },
      { id: 'evidence', purpose: 'Show task-relevant facts and history', priority: 2 },
      ...(actions.length
        ? [{ id: 'actions', purpose: 'Expose valid next actions', priority: 3 }]
        : []),
    ],
    informationHierarchy: ['summary', 'evidence', ...(actions.length ? ['actions'] : [])],
    queryPlan: queries,
    actionPlan: actions,
    stateMachine: {
      initial: 'loading',
      states: ['loading', 'ready', 'empty', 'error', 'confirming', 'submitting', 'success'],
      transitions: [
        ['loading', 'ready'],
        ['loading', 'empty'],
        ['loading', 'error'],
        ['ready', 'confirming'],
        ['confirming', 'submitting'],
        ['submitting', 'success'],
        ['submitting', 'error'],
      ],
    },
    responsiveStrategy:
      slot?.mode === 'inline' ? 'single-column-contained' : 'progressive-disclosure',
    insertionStrategy: insertionStrategy ?? slot?.mode ?? 'inline',
  };
}

function componentRegistry(projectModel) {
  return [...baselineComponentContracts(), ...(projectModel.components ?? [])];
}

export function resolveComponents(plan, task, projectModel, { forge = new ComponentForge() } = {}) {
  const components = componentRegistry(projectModel);
  const hostModel = { ...projectModel, components };
  const brief = {
    goal: task.goal,
    requiredInformation: task.requiredInformation.map((x) => `${x.capabilityId}.${x.field}`),
    candidateActions: task.permittedActions,
  };
  const decision = forge.findReusable(brief, hostModel);
  const regionMap = {};
  for (const region of plan.regions) {
    if (region.id === 'summary')
      regionMap[region.id] = components.some((x) => x.id === 'StatusBadge')
        ? 'StatusBadge'
        : 'Text';
    else if (region.id === 'evidence')
      regionMap[region.id] = decision.kind === 'reuse' ? decision.componentIds[0] : 'KeyValueList';
    else if (region.id === 'actions') regionMap[region.id] = 'ActionBar';
  }
  return {
    decision,
    regionMap,
    forgeRequired: decision.kind === 'forge',
    availableComponentIds: components.map((x) => x.id),
  };
}

function titleFromGoal(goal) {
  const clean = String(goal)
    .trim()
    .replace(/[.!?]+$/, '');
  return clean.length > 70 ? `${clean.slice(0, 67)}…` : clean;
}

function buildManifest(task, plan, resolution, projectModel) {
  const children = [
    { component: 'Heading', props: { level: 2, text: titleFromGoal(task.goal) } },
    { component: 'Text', props: { text: task.successCriteria[0], tone: 'muted' } },
  ];
  for (const query of plan.queryPlan) {
    const pii = new Set(
      projectModel.capabilities.find((x) => x.id === query.capabilityId)?.piiFields ?? [],
    );
    children.push({
      component: resolution.regionMap.evidence ?? 'KeyValueList',
      props: {
        title: 'Relevant information',
        fields: query.fields.filter((field) => !pii.has(field)),
      },
      data: {
        source: query.capabilityId,
        select: query.fields,
        states: {
          loading: { component: 'Spinner', props: { label: 'Loading context' } },
          empty: { component: 'EmptyState', props: { title: 'No relevant information' } },
          error: { component: 'ErrorState', props: { title: 'Context could not be loaded' } },
        },
      },
    });
  }
  if (plan.actionPlan.length) {
    const actionChildren = plan.actionPlan.map((action) => ({
      component: 'Button',
      props: {
        label: action.capabilityId.split('.').at(-1).replace(/_/g, ' '),
        variant: action.risk === 'destructive' ? 'destructive' : 'default',
      },
      actions: [action.capabilityId],
      confirmation: action.confirmation,
    }));
    children.push({ component: 'ActionBar', children: actionChildren });
    if (plan.actionPlan.some((x) => x.reversible))
      children.push({ component: 'UndoToast', props: { enabled: true } });
  }
  return {
    version: 2,
    root: {
      component: 'Section',
      props: { density: projectModel.designGenome?.grammar?.density ?? 'balanced' },
      children,
    },
  };
}

function policyProofFor(bundle, projectModel) {
  const checks = [];
  const actions = bundle.experiencePlan.actionPlan;
  checks.push({
    id: 'registered-slot',
    pass: projectModel.slots.some((x) => x.id === bundle.slotId),
  });
  checks.push({
    id: 'registered-actions',
    pass: actions.every((x) => projectModel.capabilities.some((c) => c.id === x.capabilityId)),
  });
  checks.push({
    id: 'destructive-confirmation',
    pass: actions
      .filter((x) => x.risk === 'destructive')
      .every((x) => ['modal', 'verbal_required'].includes(x.confirmation)),
  });
  checks.push({
    id: 'reversibility-surfaced',
    pass: actions
      .filter((x) => x.reversible)
      .every(
        (x) =>
          x.rollbackCapabilityId ||
          bundle.manifest.root.children.some((n) => n.component === 'UndoToast'),
      ),
  });
  checks.push({
    id: 'states-complete',
    pass: bundle.experiencePlan.queryPlan.every((query) => {
      const node = bundle.manifest.root.children.find((n) => n.data?.source === query.capabilityId);
      return ['loading', 'empty', 'error'].every((state) => node?.data?.states?.[state]);
    }),
  });
  return { checks, passed: checks.every((x) => x.pass), hash: sha256(checks) };
}

export function compileScreenBundle({
  task,
  experiencePlan,
  componentResolution,
  projectModel,
  slotId,
  contextClass = {},
  compiler = 'deterministic-v2',
}) {
  const body = {
    schemaVersion: 2,
    projectId: projectModel.projectId,
    projectVersion: projectModel.projectVersion,
    slotId,
    activation: { ...contextClass, slotId },
    taskSpec: task,
    experiencePlan,
    manifest: buildManifest(task, experiencePlan, componentResolution, projectModel),
    components: [
      ...new Set(Object.values(componentResolution.regionMap).concat(BASELINE_COMPONENTS)),
    ],
    cachePolicy: {
      ttlMs: 86_400_000,
      staleWhileRevalidateMs: 604_800_000,
      cohortFields: ['slotId', 'role', 'taskCluster', 'entityType', 'locale', 'density'],
    },
    fallback: 'host_ui',
    provenance: {
      compiler,
      projectVersion: projectModel.projectVersion,
      capabilityGraphVersion: projectModel.capabilityGraph.version,
      designGenomeVersion: projectModel.designGenome?.genomeVersion,
      compiledAt: new Date().toISOString(),
    },
  };
  const bundle = { ...body, bundleId: stableId('bundle', body) };
  bundle.policyProof = policyProofFor(bundle, projectModel);
  validateScreenBundle(bundle, {
    components: componentRegistry(projectModel).map((x) => x.id),
    capabilities: projectModel.capabilities.map((x) => x.id),
  });
  invariant(
    bundle.policyProof.passed,
    'POLICY_PROOF_FAILED',
    'Compiled bundle failed policy proof',
    { checks: bundle.policyProof.checks },
  );
  return bundle;
}

const PATCH_FIELDS = new Set([
  'moduleOrder',
  'hiddenModules',
  'density',
  'defaultFilters',
  'defaultGrouping',
  'suggestedActions',
  'copy',
  'expandedModules',
]);

export function sanitizeRuntimePatch(patch, { bundle, projectModel, maxAdaptationLevel = 2 } = {}) {
  const clean = {};
  for (const [key, value] of Object.entries(patch ?? {})) {
    if (!PATCH_FIELDS.has(key)) continue;
    if (key === 'suggestedActions') {
      clean[key] = (Array.isArray(value) ? value : []).filter((id) =>
        projectModel.capabilities.some((c) => c.id === id),
      );
    } else if (key === 'moduleOrder' || key === 'hiddenModules' || key === 'expandedModules') {
      const allowed = new Set(bundle.experiencePlan.regions.map((x) => x.id));
      clean[key] = (Array.isArray(value) ? value : []).filter((id) => allowed.has(id));
    } else if (key === 'density') {
      clean[key] = ['compact', 'balanced', 'spacious'].includes(value) ? value : undefined;
    } else clean[key] = deepClone(value);
  }
  if (maxAdaptationLevel < 2) delete clean.hiddenModules;
  if (maxAdaptationLevel < 1) {
    delete clean.moduleOrder;
    delete clean.density;
    delete clean.defaultFilters;
    delete clean.defaultGrouping;
  }
  return Object.fromEntries(Object.entries(clean).filter(([, value]) => value !== undefined));
}

export function applyRuntimePatch(bundle, patch, context) {
  const copy = deepClone(bundle);
  const clean = sanitizeRuntimePatch(patch, context);
  const children = copy.manifest.root.children;
  if (clean.density) copy.manifest.root.props.density = clean.density;
  if (clean.hiddenModules?.length) {
    const regionComponents = {
      summary: ['Heading', 'Text', 'StatusBadge'],
      evidence: ['KeyValueList', 'Table', 'Timeline'],
      actions: ['ActionBar'],
    };
    copy.manifest.root.children = children.filter(
      (node) =>
        !clean.hiddenModules.some((region) => regionComponents[region]?.includes(node.component)),
    );
  }
  copy.runtimePatch = {
    ...clean,
    appliedAt: new Date().toISOString(),
    originalBundleId: bundle.bundleId,
  };
  copy.bundleId = stableId('bundle', { base: bundle.bundleId, patch: clean });
  delete copy.signature;
  return copy;
}

export function sanitizeModelRefinement(proposal, { task, bundle, projectModel }) {
  const allowedComponents = new Set([
    ...BASELINE_COMPONENTS,
    ...projectModel.components.map((x) => x.id),
  ]);
  const allowedCapabilities = new Set(projectModel.capabilities.map((x) => x.id));
  const clone = deepClone(proposal ?? {});
  for (const forbidden of [
    'javascript',
    'code',
    'css',
    'rawCss',
    'routes',
    'permissions',
    'capabilities',
    'executors',
  ])
    delete clone[forbidden];
  function cleanNode(node) {
    if (!node || typeof node !== 'object') return null;
    const component = allowedComponents.has(node.component) ? node.component : 'Alert';
    const actions = (node.actions ?? []).filter((id) => allowedCapabilities.has(id));
    const data =
      node.data && allowedCapabilities.has(node.data.source)
        ? {
            ...node.data,
            select: (node.data.select ?? []).filter((field) => !isPiiField(field)),
          }
        : undefined;
    return {
      component,
      ...(node.props && typeof node.props === 'object' ? { props: node.props } : {}),
      ...(actions.length ? { actions } : {}),
      ...(data ? { data } : {}),
      ...(Array.isArray(node.children)
        ? { children: node.children.map(cleanNode).filter(Boolean) }
        : {}),
    };
  }
  if (clone.manifest?.root) clone.manifest.root = cleanNode(clone.manifest.root);
  const requiredSources = new Set(task.requiredInformation.map((x) => x.capabilityId));
  const present = new Set();
  const visit = (node) => {
    if (node?.data?.source) present.add(node.data.source);
    for (const child of node?.children ?? []) visit(child);
  };
  visit(clone.manifest?.root);
  clone.manifest ??= deepClone(bundle.manifest);
  clone.manifest.root ??= deepClone(bundle.manifest.root);
  for (const source of requiredSources) {
    if (!present.has(source)) {
      clone.manifest.root.children ??= [];
      clone.manifest.root.children.push(
        deepClone(
          bundle.manifest.root.children.find((node) => node.data?.source === source) ?? {
            component: 'Alert',
            props: { text: `Required source ${source} was restored.` },
          },
        ),
      );
    }
  }
  clone.modelProvenance = { proposalHash: sha256(proposal), sanitizedAt: new Date().toISOString() };
  return clone;
}

export function compileAdditiveExperience({
  actor,
  context,
  goal,
  successCriteria,
  projectModel,
  slotId,
  contextClass,
  forge,
}) {
  const task = createTaskSpec({ actor, context, goal, successCriteria, projectModel, slotId });
  const plan = createExperiencePlan(task, projectModel);
  const resolution = resolveComponents(plan, task, projectModel, { forge });
  const bundle = compileScreenBundle({
    task,
    experiencePlan: plan,
    componentResolution: resolution,
    projectModel,
    slotId,
    contextClass,
  });
  return { task, plan, resolution, bundle };
}
