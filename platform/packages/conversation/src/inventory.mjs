// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { assert, hash, noPrototypeKeys, text } from './common.mjs';
import { normalizeDataSchema } from '../../providers/src/data-schema.mjs';
const secret =
  /password|secret|authorization|cookie|access.?token|refresh.?token|api.?key|cvv|ssn/i;
const pii = /email|phone|birth|street|address|postal|card.?number/i;
export function projectSchema(
  schema,
  { piiFields = [], allowedPiiFields = [] } = {},
  path = '',
  depth = 0,
) {
  assert(depth < 30, 400, 'SCHEMA_DEPTH', 'Schema is too deep');
  if (typeof schema === 'boolean') return schema;
  const s = structuredClone(schema ?? {});
  if (s.type === 'array') {
    s.items = projectSchema(s.items, { piiFields, allowedPiiFields }, path, depth + 1);
    return s;
  }
  if (s.type === 'object' || s.properties) {
    const properties = {};
    for (const [k, v] of Object.entries(s.properties ?? {})) {
      const field = path ? path + '.' + k : k;
      if (secret.test(k)) continue;
      const sensitive =
        pii.test(k) || piiFields.some((x) => x === field || field.startsWith(x + '.'));
      if (sensitive && !allowedPiiFields.some((x) => x === field || field.startsWith(x + '.')))
        continue;
      properties[k] = projectSchema(v, { piiFields, allowedPiiFields }, field, depth + 1);
    }
    s.properties = properties;
    s.required = (s.required ?? []).filter((k) => Object.hasOwn(properties, k));
    s.additionalProperties = false;
  }
  return s;
}
export function projectResult(value, schema, depth = 0) {
  noPrototypeKeys(value);
  assert(depth < 30, 400, 'RESULT_DEPTH', 'Tool result is too deep');
  if (Array.isArray(value)) {
    assert(
      value.length <= 10000,
      413,
      'RESULT_ROWS',
      'Paginate or aggregate more than 10,000 rows',
    );
    return value.map((x) => projectResult(x, schema?.items, depth + 1));
  }
  if (value && typeof value === 'object') {
    assert(
      schema?.properties,
      400,
      'UNBOUNDED_RESULT',
      'Tool objects require explicitly declared fields',
    );
    return Object.fromEntries(
      Object.entries(schema.properties)
        .filter(([k]) => Object.hasOwn(value, k))
        .map(([k, s]) => [k, projectResult(value[k], s, depth + 1)]),
    );
  }
  return value;
}
export function extractVoice(
  snapshot,
  { name = 'Project assistant', locale = 'en', tone = 'Clear, calm and precise' } = {},
) {
  const examples = [],
    evidence = [];
  for (const f of snapshot?.files ?? []) {
    if (!/(?:locales|translations|i18n|copy|content)\//.test(f.path) && !f.path.endsWith('.tsx'))
      continue;
    evidence.push({ path: f.path, hash: hash(f.content) });
    if (f.path.endsWith('.json')) {
      try {
        const visit = (v, d = 0) => {
          if (d > 8 || examples.length > 80) return;
          if (typeof v === 'string' && v.length > 4 && v.length < 180) examples.push(v);
          else if (v && typeof v === 'object') Object.values(v).forEach((x) => visit(x, d + 1));
        };
        visit(JSON.parse(f.content));
      } catch {}
    } else
      for (const m of f.content.matchAll(/>\s*([A-Z][^<>{}\n]{4,160})\s*</g))
        examples.push(m[1].trim());
  }
  return {
    name,
    locale,
    tone,
    examples: [...new Set(examples)]
      .filter((x) => !/@|https?:|\b(?:secret|password|token)\b|\d{6,}/i.test(x))
      .slice(0, 16),
    terminology: [],
    status: 'draft',
    evidence: evidence.slice(0, 50),
  };
}
export function assembleProfile(
  model,
  {
    voice,
    toolIds,
    clientTools = [],
    componentIds = [],
    allowedPiiFields = [],
    retentionDays = 30,
  } = {},
) {
  const tools = model.capabilities
    .filter((c) => c.securityReviewed === true && (!toolIds || toolIds.includes(c.id)))
    .map((c) => {
      const inputSchema = normalizeDataSchema(c.inputSchema),
        outputSchema = projectSchema(normalizeDataSchema(c.outputSchema), {
          piiFields: c.piiFields ?? [],
          allowedPiiFields,
        });
      return {
        id: c.id,
        kind: c.kind,
        execution: clientTools.includes(c.id) ? 'client' : 'server',
        description: String(c.description ?? c.summary ?? c.id).slice(0, 600),
        inputSchema,
        outputSchema,
        requiredPermissions: c.requiredPermissions ?? [],
        confirmation:
          c.kind === 'query' ? 'none' : c.confirmation === 'none' ? 'modal' : c.confirmation,
        risk: c.risk,
        securityReviewed: true,
        contractHash: hash({
          inputSchema,
          outputSchema,
          permissions: c.requiredPermissions,
          risk: c.risk,
          review: c.reviewedSchemaHash,
        }),
      };
    });
  const p = {
    version: 1,
    projectVersion: model.projectVersion,
    name: voice?.name ?? 'Project assistant',
    voice,
    tools,
    componentIds,
    maxToolRounds: 6,
    maxMessages: 200,
    retentionDays,
    runtimeCodeGeneration: false,
  };
  return { ...p, digest: hash(p) };
}
export function normalizeObservation(input) {
  noPrototypeKeys(input);
  const method = String(input.method ?? 'GET').toUpperCase(),
    path = text(input.path, 'Route template', { max: 240 });
  assert(
    ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method),
    400,
    'OBSERVATION_METHOD',
    'Unsupported method',
  );
  assert(
    path.startsWith('/') &&
      !path.startsWith('//') &&
      !/[?#\\@]/.test(path) &&
      !/%[a-f0-9]{2}/i.test(path) &&
      !/\b\d{4,}\b/.test(path),
    400,
    'OBSERVATION_PATH',
    'Use a redacted route template, not query strings or identifiers',
  );
  return {
    method,
    path,
    inputSchema: normalizeDataSchema(
      input.inputSchema ?? { type: 'object', properties: {}, additionalProperties: false },
    ),
    outputSchema: normalizeDataSchema(input.outputSchema ?? {}),
    securityReviewed: false,
    status: 'observed',
    authorization: 'unknown',
    source: 'explicit-development-observation',
  };
}
