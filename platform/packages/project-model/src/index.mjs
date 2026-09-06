// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  EVIDENCE_STATUS,
  canonicalJson,
  deepClone,
  invariant,
  sha256,
  stableId,
  tokenize,
  validateCapability,
  validateComponentContract,
  validateSlotContract,
} from '../../contracts/src/index.mjs';

function uniqueBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    const prior = map.get(key);
    if (!prior || (item.confidence ?? 0) >= (prior.confidence ?? 0)) map.set(key, item);
  }
  return [...map.values()];
}

function normalizeEntity(entity) {
  return {
    id: entity.id,
    name: entity.name ?? entity.id,
    fields: uniqueBy(entity.fields ?? [], (field) => field.name),
    evidence: entity.evidence ?? [],
    confidence: entity.confidence ?? 0.5,
  };
}

export function applyCapabilityOverrides(capabilities, overrides = {}) {
  return capabilities.map((capability) => {
    const patch = overrides[capability.id];
    if (!patch) return capability;
    return {
      ...capability,
      ...deepClone(patch),
      evidence: [
        ...(capability.evidence ?? []),
        {
          id: stableId('ev', { capability: capability.id, override: patch }),
          source: 'developer_override',
          sourcePath: 'atelier.config.mjs',
          sourceHash: sha256(patch),
          status: EVIDENCE_STATUS.VERIFIED,
          confidence: 1,
          note: 'Developer-authoritative capability override',
          observedAt: new Date().toISOString(),
        },
      ],
      confidence: 1,
      verification: 'verified',
    };
  });
}

export function buildCapabilityGraph(capabilities, entities = []) {
  const nodes = [
    ...capabilities.map((c) => ({ id: c.id, type: 'capability', ref: c.id })),
    ...entities.map((e) => ({ id: `entity:${e.id}`, type: 'entity', ref: e.id })),
  ];
  const edges = [];
  for (const c of capabilities) {
    for (const entity of c.readsEntities ?? [])
      edges.push({ from: c.id, to: `entity:${entity}`, type: 'reads' });
    for (const entity of c.createsEntities ?? [])
      edges.push({ from: c.id, to: `entity:${entity}`, type: 'creates' });
    for (const entity of c.updatesEntities ?? [])
      edges.push({ from: c.id, to: `entity:${entity}`, type: 'updates' });
    for (const entity of c.deletesEntities ?? [])
      edges.push({ from: c.id, to: `entity:${entity}`, type: 'deletes' });
    for (const pre of c.mustFollow ?? []) edges.push({ from: pre, to: c.id, type: 'must_follow' });
    if (c.rollbackCapabilityId)
      edges.push({ from: c.id, to: c.rollbackCapabilityId, type: 'rolls_back_with' });
  }
  return { nodes, edges, version: sha256({ nodes, edges }).slice(0, 16) };
}

function indexDocument(kind, id, value) {
  const text = canonicalJson(value);
  return {
    id: `${kind}:${id}`,
    kind,
    ref: id,
    tokens: [...new Set(tokenize(text))],
    text,
  };
}

export function buildSearchIndex(model) {
  const documents = [
    ...(model.routes ?? []).map((x) => indexDocument('route', x.id ?? x.path, x)),
    ...(model.entities ?? []).map((x) => indexDocument('entity', x.id, x)),
    ...(model.capabilities ?? []).map((x) => indexDocument('capability', x.id, x)),
    ...(model.components ?? []).map((x) => indexDocument('component', x.id, x)),
    ...(model.slots ?? []).map((x) => indexDocument('slot', x.id, x)),
    ...(model.designGenome?.rules ?? []).map((x, i) => indexDocument('design-rule', String(i), x)),
  ];
  return {
    version: sha256(documents).slice(0, 16),
    documents,
  };
}

export function searchProjectModel(model, query, { limit = 20, kinds = null } = {}) {
  const terms = new Set(tokenize(query));
  const docs = model.searchIndex?.documents ?? buildSearchIndex(model).documents;
  return docs
    .filter((doc) => !kinds || kinds.includes(doc.kind))
    .map((doc) => {
      const matches = doc.tokens.filter((token) => terms.has(token)).length;
      const prefix = doc.tokens.some((token) => [...terms].some((term) => token.startsWith(term)))
        ? 0.25
        : 0;
      return { ...doc, score: terms.size ? matches / terms.size + prefix : 0 };
    })
    .filter((doc) => doc.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limit);
}

export function buildProjectModel(
  scan,
  {
    projectId = scan.projectId ?? 'project',
    capabilityOverrides = {},
    designGenome = scan.designGenome ?? null,
  } = {},
) {
  const routes = uniqueBy(scan.routes ?? [], (x) => x.path);
  const entities = uniqueBy((scan.entities ?? []).map(normalizeEntity), (x) => x.id);
  const rawCapabilities = uniqueBy(scan.capabilities ?? [], (x) => x.id);
  const capabilities = applyCapabilityOverrides(rawCapabilities, capabilityOverrides).map(
    validateCapability,
  );
  const components = uniqueBy(scan.components ?? [], (x) => x.id).map(validateComponentContract);
  const slots = uniqueBy(scan.slots ?? [], (x) => x.id).map(validateSlotContract);
  const graph = buildCapabilityGraph(capabilities, entities);
  const base = {
    schemaVersion: 2,
    projectId,
    rootHash: scan.rootHash,
    generatedAt: scan.generatedAt ?? new Date().toISOString(),
    routes,
    entities,
    capabilities,
    components,
    slots,
    permissions: uniqueBy(scan.permissions ?? [], (x) => x.id ?? x),
    observations: scan.observations ?? [],
    designGenome,
    capabilityGraph: graph,
    sourceSummary: scan.sourceSummary ?? {},
    adapters: scan.adapters ?? [],
  };
  const model = {
    ...base,
    projectVersion: sha256(base).slice(0, 20),
  };
  model.searchIndex = buildSearchIndex(model);
  return model;
}

export function validateProjectModel(model) {
  invariant(
    model.schemaVersion === 2,
    'INVALID_PROJECT_MODEL_VERSION',
    'Project model schemaVersion must be 2',
  );
  invariant(typeof model.projectId === 'string', 'INVALID_PROJECT_ID', 'Project id is required');
  invariant(
    Array.isArray(model.capabilities),
    'INVALID_PROJECT_CAPABILITIES',
    'Capabilities are required',
  );
  for (const capability of model.capabilities) validateCapability(capability);
  for (const component of model.components ?? []) validateComponentContract(component);
  for (const slot of model.slots ?? []) validateSlotContract(slot);
  return model;
}

export async function saveProjectModel(file, model) {
  validateProjectModel(model);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(model, null, 2)}\n`, 'utf8');
  return file;
}

export async function loadProjectModel(file) {
  const model = JSON.parse(await readFile(file, 'utf8'));
  return validateProjectModel(model);
}

export function modelSummary(model) {
  return {
    projectId: model.projectId,
    projectVersion: model.projectVersion,
    routes: model.routes.length,
    entities: model.entities.length,
    capabilities: model.capabilities.length,
    components: model.components.length,
    slots: model.slots.length,
    verifiedCapabilities: model.capabilities.filter((x) => x.verification === 'verified').length,
    inferredCapabilities: model.capabilities.filter((x) => x.verification !== 'verified').length,
  };
}
