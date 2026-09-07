// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { isIP } from 'node:net';
import { isPiiField, sha256, stableId } from '../../contracts/src/index.mjs';
import { normalizeDataSchema } from '../../providers/src/data-schema.mjs';
import { assert, noPrototypeKeys, text } from '../../control-plane/src/util.mjs';

const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']);
const SECRET_FIELD =
  /password|secret|authorization|cookie|access.?token|refresh.?token|api.?key|cvv|ssn/i;
const PRIVATE_HOST = /(^localhost$|\.localhost$|\.local$|\.internal$)/i;
const PII_VALUE =
  /(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\+?\d[\d ()-]{8,}\d|\b\d{3}-\d{2}-\d{4}\b)/i;
const IDENTIFIER_VALUE = /^(?:[0-9a-f]{8}-[0-9a-f-]{27,}|[0-9a-f]{16,}|[A-Za-z0-9_-]{24,})$/i;

export function normalizeAllowedOrigin(value) {
  const raw = text(value, 'Allowed origin', { max: 240 });
  let url;
  try {
    url = new URL(raw);
  } catch {
    assert(false, 400, 'INVALID_ORIGIN', 'Use an exact http or https origin');
  }
  assert(['http:', 'https:'].includes(url.protocol), 400, 'INVALID_ORIGIN', 'Use http or https');
  assert(url.origin === raw.replace(/\/$/, ''), 400, 'INVALID_ORIGIN', 'Do not include a path');
  return url.origin;
}

export function assertPublicDocumentUrl(value) {
  let url;
  try {
    url = new URL(text(value, 'Specification URL', { max: 1000 }));
  } catch {
    assert(false, 400, 'INVALID_SPEC_URL', 'Specification URL is invalid');
  }
  assert(
    url.protocol === 'https:',
    400,
    'SPEC_HTTPS_REQUIRED',
    'Specification URLs must use HTTPS',
  );
  assert(
    !url.username && !url.password,
    400,
    'SPEC_URL_CREDENTIALS',
    'URL credentials are forbidden',
  );
  assert(
    !isIP(url.hostname),
    400,
    'SPEC_IP_DENIED',
    'Specification URL IP addresses are forbidden',
  );
  assert(!PRIVATE_HOST.test(url.hostname), 400, 'SPEC_HOST_DENIED', 'Private hosts are forbidden');
  assert(!url.hash, 400, 'SPEC_FRAGMENT_DENIED', 'Specification URL fragments are forbidden');
  return url;
}

function projectSchema(schema, depth = 0) {
  assert(depth <= 12, 400, 'SCHEMA_DEPTH', 'Observed schema exceeds 12 levels');
  const normalized = normalizeDataSchema(schema ?? {});
  if (normalized.type === 'array' && normalized.items)
    normalized.items = projectSchema(normalized.items, depth + 1);
  if (normalized.type === 'object' || normalized.properties) {
    const properties = {};
    for (const [key, value] of Object.entries(normalized.properties ?? {}).slice(0, 100)) {
      if (SECRET_FIELD.test(key)) continue;
      properties[key] = projectSchema(value, depth + 1);
    }
    normalized.properties = properties;
    if (Array.isArray(normalized.required))
      normalized.required = normalized.required.filter((key) => Object.hasOwn(properties, key));
    normalized.additionalProperties = false;
  }
  return normalized;
}

function collectPii(schema, prefix = '', out = []) {
  for (const [key, value] of Object.entries(schema?.properties ?? {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isPiiField(key)) out.push(path);
    collectPii(value, path, out);
  }
  if (schema?.items) collectPii(schema.items, prefix, out);
  return [...new Set(out)];
}

export function sanitizeSemanticSample(value, { safeValueFields = [] } = {}, path = '', depth = 0) {
  if (depth > 8) return '<redacted:depth>';
  if (value === null) return null;
  if (Array.isArray(value))
    return value.length
      ? [sanitizeSemanticSample(value[0], { safeValueFields }, path, depth + 1)]
      : [];
  if (value && typeof value === 'object') {
    const output = {};
    for (const [key, child] of Object.entries(value).slice(0, 100)) {
      if (SECRET_FIELD.test(key)) continue;
      const childPath = path ? `${path}.${key}` : key;
      output[key] = isPiiField(key)
        ? '<redacted:pii>'
        : sanitizeSemanticSample(child, { safeValueFields }, childPath, depth + 1);
    }
    return output;
  }
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '<number>';
    const size = Math.abs(value);
    return `<number:${size < 10 ? '0-10' : size < 100 ? '10-100' : size < 1000 ? '100-1000' : '1000+'}>`;
  }
  const string = String(value);
  if (PII_VALUE.test(string)) return '<redacted:pii>';
  if (IDENTIFIER_VALUE.test(string)) return '<redacted:id>';
  const field = path.split('.').at(-1)?.toLowerCase();
  if (
    safeValueFields.map((item) => item.toLowerCase()).includes(field) &&
    string.length <= 40 &&
    /^[A-Za-z0-9 _.-]+$/.test(string)
  )
    return string;
  return `<string:${string.length < 16 ? 'short' : string.length < 80 ? 'medium' : 'long'}>`;
}

export function normalizeRouteTemplate(value) {
  const path = text(value, 'Route template', { max: 240 });
  assert(
    path.startsWith('/') &&
      !path.startsWith('//') &&
      !/[?#\\@]/.test(path) &&
      !/%[a-f0-9]{2}/i.test(path),
    400,
    'OBSERVATION_PATH',
    'Use a normalized route path without identifiers, query strings or credentials',
  );
  assert(
    !path.split('/').some((part) => /\b\d{4,}\b/.test(part) || part.length > 100),
    400,
    'OBSERVATION_IDENTIFIER',
    'Route contains an identifier that was not redacted',
  );
  return path;
}

export function operationKey(method, path) {
  return `${method.toUpperCase()}:${path}`;
}

export function normalizeDiscoveryEvent(input, { safeValueFields = [] } = {}) {
  noPrototypeKeys(input);
  const method = String(input.method ?? '').toUpperCase();
  assert(METHODS.has(method), 400, 'OBSERVATION_METHOD', 'Unsupported HTTP method');
  const path = normalizeRouteTemplate(input.path);
  const inputSchema = projectSchema(input.inputSchema ?? { type: 'object', properties: {} });
  const outputSchema = projectSchema(input.outputSchema ?? {});
  const environment = text(input.environment ?? 'production', 'Environment', { max: 40 });
  const userRole = input.userRole ? text(input.userRole, 'User role', { max: 80 }) : null;
  assert(
    !userRole || /^[a-z][a-z0-9_.:-]{0,79}$/i.test(userRole),
    400,
    'OBSERVATION_ROLE',
    'User role must be a non-personal cohort label',
  );
  const pagePath = input.pagePath ? normalizeRouteTemplate(input.pagePath) : null;
  const contract = { method, path, inputSchema, outputSchema };
  const fingerprint = sha256(contract);
  if (input.fingerprint)
    assert(
      input.fingerprint === fingerprint,
      400,
      'FINGERPRINT_MISMATCH',
      'Contract fingerprint is invalid',
    );
  return {
    ...contract,
    capabilityKey: operationKey(method, path),
    fingerprint,
    ...(input.sample ? { sample: sanitizeSemanticSample(input.sample, { safeValueFields }) } : {}),
    metadata: {
      environment,
      ...(userRole ? { userRole } : {}),
      ...(pagePath ? { pagePath } : {}),
      status: Number.isInteger(input.status) ? Math.floor(input.status / 100) * 100 : null,
      valuesCaptured: false,
    },
  };
}

function capabilityId(method, path) {
  const readable = path
    .split('/')
    .filter(Boolean)
    .map((part) => part.replace(/[{}]/g, '').replace(/[^a-zA-Z0-9]+/g, '_'))
    .filter(Boolean)
    .join('.');
  return `http.${method.toLowerCase()}.${readable || 'root'}`;
}

function operationLanguage(method, path, outputSchema) {
  const segments = path
    .split('/')
    .filter(Boolean)
    .filter((part) => !part.startsWith('{'))
    .map((part) => part.replace(/[-_]+/g, ' '));
  const resource = segments.at(-1) ?? 'resource';
  const item = /\{[^}]+\}$/.test(path);
  const verb =
    method === 'GET' || method === 'HEAD'
      ? item
        ? 'Read'
        : 'List'
      : method === 'POST'
        ? 'Create'
        : method === 'DELETE'
          ? 'Delete'
          : 'Update';
  const fields = Object.keys(outputSchema?.properties ?? {})
    .filter((name) => !isPiiField(name))
    .slice(0, 3)
    .map((name) => name.replace(/[-_]+/g, ' '));
  const context = fields.length ? ` Its response shape includes ${fields.join(', ')}.` : '';
  return {
    title: `${verb} ${resource}`,
    description: `${verb} the ${resource} resource through ${method} ${path}.${context}`,
  };
}

export function capabilityFromObservation(event, source) {
  const query = ['GET', 'HEAD'].includes(event.method);
  const language = operationLanguage(event.method, event.path, event.outputSchema);
  const piiFields = collectPii(event.inputSchema).concat(collectPii(event.outputSchema));
  const reasons = query
    ? [
        'Observed read operation; confirm authorization and tenant checks before approval.',
        ...(piiFields.length ? ['PII-shaped fields require an explicit projection policy.'] : []),
      ]
    : ['Observed write operation; verify side effects, permissions and confirmation behavior.'];
  return {
    id: capabilityId(event.method, event.path),
    title: language.title,
    description: language.description,
    kind: query ? 'query' : 'command',
    operation: { protocol: 'http', method: event.method, path: event.path },
    inputSchema: event.inputSchema,
    outputSchema: event.outputSchema,
    errorSchemas: [],
    readsEntities: [],
    createsEntities: [],
    updatesEntities: [],
    deletesEntities: [],
    preconditions: [],
    sideEffects: query ? [] : [`mutates:${event.path}`],
    requiredPermissions: [],
    idempotent: query,
    reversible: query ? true : 'unknown',
    risk: query ? 'read_only' : 'sensitive',
    confirmation: query ? 'none' : 'modal',
    piiFields: [...new Set(piiFields)],
    examples: [],
    redactedSamples: event.sample
      ? [
          {
            input: event.sample.input ?? null,
            output: event.sample.output ?? null,
            valuesCaptured: false,
          },
        ]
      : [],
    observedContexts: event.observedContexts ?? [event.metadata].filter(Boolean),
    mustFollow: [],
    confidence: 0.85,
    verification: 'observed',
    securityReviewed: false,
    agentEnabled: false,
    recommendation: {
      review: query && !piiFields.length ? 'approve_after_auth_check' : 'manual_review',
      agentExposure: query && !piiFields.length ? 'consider' : 'do_not_expose',
      reasons,
    },
    evidence: [
      {
        id: stableId('ev', { source: source.id, fingerprint: event.fingerprint }),
        source: source.kind === 'browser' ? 'browser_observation' : 'server_observation',
        sourcePath: event.metadata.pagePath ?? null,
        sourceHash: event.fingerprint,
        status: 'observed',
        confidence: 0.85,
        note: `${source.name}; values and credentials were not captured`,
        observedAt: new Date(event.observedAt ?? Date.now()).toISOString(),
      },
    ],
  };
}

export function recommendCapability(capability) {
  const query = capability.kind === 'query';
  const pii = (capability.piiFields ?? []).length > 0;
  const declared = (capability.evidence ?? []).some((item) => item.source === 'openapi');
  const reasons = [];
  if (declared) reasons.push('Declared by the supplied OpenAPI contract.');
  else reasons.push('Observed at runtime; verify authorization and incomplete optional fields.');
  if (!query)
    reasons.push('Write operation; confirm permissions, side effects and confirmation behavior.');
  if (pii) reasons.push('PII-shaped fields require an explicit projection policy.');
  return {
    review: query && !pii ? 'approve_after_auth_check' : 'manual_review',
    agentExposure: query && !pii ? 'consider' : 'do_not_expose',
    reasons,
  };
}

export function operationIdentity(capability) {
  const operation = capability.operation;
  return operation?.protocol === 'http'
    ? operationKey(operation.method, operation.path)
    : capability.id;
}
