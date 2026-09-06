// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { createHash, randomUUID } from 'node:crypto';

export class AtelierError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'AtelierError';
    this.code = code;
    this.details = details;
  }
}

export function invariant(condition, code, message, details = {}) {
  if (!condition) throw new AtelierError(code, message, details);
}

export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function canonicalize(value) {
  if (value === undefined) return null;
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value) {
  const input = typeof value === 'string' ? value : canonicalJson(value);
  return createHash('sha256').update(input).digest('hex');
}

export function stableId(prefix, value) {
  return `${prefix}_${sha256(value).slice(0, 20)}`;
}

export function eventId() {
  return `evt_${randomUUID()}`;
}

export function nowIso(clock = () => new Date()) {
  return clock().toISOString();
}

export function deepClone(value) {
  return structuredClone(value);
}

export function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

export function tokenize(text) {
  return (
    String(text ?? '')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .match(/[a-z0-9]+/g) ?? []
  );
}

export function similarity(a, b) {
  const A = new Set(tokenize(a));
  const B = new Set(tokenize(b));
  if (!A.size && !B.size) return 1;
  const intersection = [...A].filter((x) => B.has(x)).length;
  const union = new Set([...A, ...B]).size;
  return union ? intersection / union : 0;
}

export const EVIDENCE_STATUS = Object.freeze({
  VERIFIED: 'verified',
  OBSERVED: 'observed',
  INFERRED: 'inferred',
});

export function evidence({
  source,
  sourcePath = null,
  sourceHash = '',
  status = EVIDENCE_STATUS.INFERRED,
  confidence = 0.5,
  note = null,
  observedAt = nowIso(),
}) {
  invariant(source, 'EVIDENCE_SOURCE_REQUIRED', 'Evidence source is required');
  invariant(confidence >= 0 && confidence <= 1, 'INVALID_CONFIDENCE', 'Confidence must be 0..1');
  return {
    id: stableId('ev', { source, sourcePath, sourceHash, status, note }),
    source,
    sourcePath,
    sourceHash,
    status,
    confidence,
    note,
    observedAt,
  };
}

const HIGH_RISK_TERMS =
  /delete|purge|charge|pay|transfer|refund|publish|send|grant|revoke|permission|archive/i;
const PII_TERMS =
  /(^|_)(email|phone|ssn|dob|date_of_birth|address|postal|zip|card|cvv|password|secret|token|first_name|last_name|full_name|gender|race|ethnicity)($|_)/i;

export function inferRisk(id, method = 'GET') {
  const write = !['GET', 'HEAD', 'OPTIONS', 'QUERY'].includes(String(method).toUpperCase());
  if (!write) return 'read_only';
  if (HIGH_RISK_TERMS.test(id) || String(method).toUpperCase() === 'DELETE') return 'destructive';
  return 'sensitive';
}

export function isPiiField(field) {
  const normalized = String(field)
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')
    .replace(/[.\-\s]+/g, '_')
    .toLowerCase();
  return PII_TERMS.test(normalized);
}

export function assertJsonSchemaShape(schema, path = 'schema') {
  invariant(isPlainObject(schema), 'INVALID_JSON_SCHEMA', `${path} must be an object`);
  if (schema.type !== undefined) {
    const allowed = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null']);
    invariant(allowed.has(schema.type), 'INVALID_JSON_SCHEMA_TYPE', `${path}.type is unsupported`, {
      type: schema.type,
    });
  }
  return true;
}

export function validateSlotContract(slot) {
  invariant(isPlainObject(slot), 'INVALID_SLOT', 'Slot must be an object');
  invariant(
    typeof slot.id === 'string' && slot.id.length > 0,
    'INVALID_SLOT_ID',
    'Slot id is required',
  );
  invariant(
    ['inline', 'drawer', 'route', 'command', 'modal'].includes(slot.mode),
    'INVALID_SLOT_MODE',
    'Unsupported slot mode',
  );
  invariant(
    Array.isArray(slot.allowedCapabilityGroups),
    'INVALID_SLOT_CAPABILITIES',
    'Slot capability groups must be an array',
  );
  invariant(
    Number.isInteger(slot.maxAdaptationLevel) &&
      slot.maxAdaptationLevel >= 0 &&
      slot.maxAdaptationLevel <= 3,
    'INVALID_ADAPTATION_LEVEL',
    'Runtime adaptation level must be 0..3',
  );
  return slot;
}

export function validateCapability(capability) {
  invariant(isPlainObject(capability), 'INVALID_CAPABILITY', 'Capability must be an object');
  invariant(
    typeof capability.id === 'string' && capability.id.length > 0,
    'INVALID_CAPABILITY_ID',
    'Capability id is required',
  );
  invariant(
    ['query', 'command', 'stream'].includes(capability.kind),
    'INVALID_CAPABILITY_KIND',
    'Capability kind is invalid',
  );
  invariant(
    ['read_only', 'low', 'sensitive', 'destructive'].includes(capability.risk),
    'INVALID_CAPABILITY_RISK',
    'Capability risk is invalid',
  );
  invariant(
    Array.isArray(capability.requiredPermissions),
    'INVALID_CAPABILITY_PERMISSIONS',
    'requiredPermissions must be an array',
  );
  assertJsonSchemaShape(
    capability.inputSchema ?? { type: 'object' },
    `${capability.id}.inputSchema`,
  );
  assertJsonSchemaShape(
    capability.outputSchema ?? { type: 'object' },
    `${capability.id}.outputSchema`,
  );
  return capability;
}

export function validateComponentContract(component) {
  invariant(isPlainObject(component), 'INVALID_COMPONENT', 'Component contract must be an object');
  invariant(
    typeof component.id === 'string' && component.id.length > 0,
    'INVALID_COMPONENT_ID',
    'Component id is required',
  );
  invariant(
    typeof component.purpose === 'string',
    'INVALID_COMPONENT_PURPOSE',
    'Component purpose is required',
  );
  invariant(
    isPlainObject(component.propsSchema),
    'INVALID_COMPONENT_PROPS',
    'Component propsSchema must be an object',
  );
  invariant(
    Array.isArray(component.tokensUsed),
    'INVALID_COMPONENT_TOKENS',
    'tokensUsed must be an array',
  );
  return component;
}

function walkNodes(node, visit, path = 'root') {
  invariant(isPlainObject(node), 'INVALID_NODE', `Manifest node ${path} must be an object`);
  invariant(
    typeof node.component === 'string',
    'INVALID_NODE_COMPONENT',
    `Manifest node ${path} needs a component`,
  );
  visit(node, path);
  for (let i = 0; i < (node.children ?? []).length; i += 1) {
    walkNodes(node.children[i], visit, `${path}.children[${i}]`);
  }
}

export function validateScreenBundle(bundle, registries = {}) {
  invariant(isPlainObject(bundle), 'INVALID_BUNDLE', 'Screen bundle must be an object');
  invariant(typeof bundle.bundleId === 'string', 'INVALID_BUNDLE_ID', 'bundleId is required');
  invariant(typeof bundle.slotId === 'string', 'INVALID_BUNDLE_SLOT', 'slotId is required');
  invariant(isPlainObject(bundle.manifest), 'INVALID_MANIFEST', 'manifest is required');
  invariant(
    isPlainObject(bundle.manifest.root),
    'INVALID_MANIFEST_ROOT',
    'manifest.root is required',
  );
  const componentIds = registries.components ? new Set(registries.components) : null;
  const capabilityIds = registries.capabilities ? new Set(registries.capabilities) : null;
  walkNodes(bundle.manifest.root, (node, path) => {
    if (componentIds)
      invariant(
        componentIds.has(node.component),
        'UNREGISTERED_COMPONENT',
        `Unregistered component at ${path}`,
        { component: node.component },
      );
    for (const action of node.actions ?? []) {
      if (capabilityIds)
        invariant(
          capabilityIds.has(action),
          'UNREGISTERED_ACTION',
          `Unregistered action at ${path}`,
          { action },
        );
    }
    if (node.data?.source && capabilityIds) {
      invariant(
        capabilityIds.has(node.data.source),
        'UNREGISTERED_DATA_SOURCE',
        `Unregistered data source at ${path}`,
        { source: node.data.source },
      );
    }
  });
  return bundle;
}

export function stripSignature(bundle) {
  const copy = deepClone(bundle);
  delete copy.signature;
  return copy;
}

export function compileArtifact(type, payload, provenance = {}) {
  const body = { type, version: 1, payload, provenance };
  return {
    ...body,
    artifactId: stableId(type, body),
    contentHash: sha256(body),
  };
}
