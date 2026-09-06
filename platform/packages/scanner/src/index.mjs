// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { access, readFile, readdir, stat } from 'node:fs/promises';
import { basename, extname, join, relative, resolve, sep } from 'node:path';
import {
  EVIDENCE_STATUS,
  evidence,
  inferRisk,
  isPiiField,
  sha256,
  stableId,
  tokenize,
} from '../../contracts/src/index.mjs';
import { buildDesignGenome } from '../../design-genome/src/index.mjs';

const DEFAULT_EXCLUDES = new Set([
  '.git',
  'node_modules',
  '.next',
  'dist',
  'build',
  'coverage',
  '.atelier',
]);
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx']);
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function walkProject(root, { excludes = DEFAULT_EXCLUDES } = {}) {
  const files = [];
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name.startsWith('.') && !['.storybook'].includes(entry.name)) {
        if (excludes.has(entry.name)) continue;
      }
      if (excludes.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) files.push(full);
    }
  }
  await walk(resolve(root));
  return files;
}

function sourceEvidence(
  source,
  path,
  content,
  status = EVIDENCE_STATUS.OBSERVED,
  confidence = 0.8,
  note = null,
) {
  return evidence({
    source,
    sourcePath: path,
    sourceHash: sha256(content),
    status,
    confidence,
    note,
  });
}

function routeFromPath(relativePath) {
  const normalized = relativePath.split(sep).join('/');
  let match = normalized.match(/(?:^|\/)app\/(.+?)\/(?:page|route)\.(?:t|j)sx?$/);
  if (match) {
    let route = `/${match[1]}`
      .replace(/\(.*?\)\//g, '')
      .replace(/\[\.\.\.(.+?)\]/g, ':$1*')
      .replace(/\[(.+?)\]/g, ':$1');
    return route === '/index' ? '/' : route;
  }
  if (/(?:^|\/)app\/(?:page|route)\.(?:t|j)sx?$/.test(normalized)) return '/';
  match = normalized.match(/(?:^|\/)pages\/(.+?)\.(?:t|j)sx?$/);
  if (match && !match[1].startsWith('api/')) {
    const route = `/${match[1]}`
      .replace(/\/index$/, '')
      .replace(/\[\.\.\.(.+?)\]/g, ':$1*')
      .replace(/\[(.+?)\]/g, ':$1');
    return route || '/';
  }
  return null;
}

function apiRouteFromPath(relativePath) {
  const normalized = relativePath.split(sep).join('/');
  let match = normalized.match(/(?:^|\/)app\/api\/(.+?)\/route\.(?:t|j)s$/);
  if (match) return `/api/${match[1]}`.replace(/\[(.+?)\]/g, ':$1');
  match = normalized.match(/(?:^|\/)pages\/api\/(.+?)\.(?:t|j)s$/);
  if (match) return `/api/${match[1]}`.replace(/\[(.+?)\]/g, ':$1');
  return null;
}

function parsePropsFields(content, componentName) {
  const candidates = [`${componentName}Props`, 'Props'];
  for (const name of candidates) {
    const re = new RegExp(`(?:interface|type)\\s+${name}\\s*(?:=)?\\s*\\{([\\s\\S]*?)\\}`, 'm');
    const match = content.match(re);
    if (!match) continue;
    const properties = {};
    const required = [];
    for (const line of match[1].split(/\n|;/)) {
      const field = line.trim().match(/^([A-Za-z_$][\w$]*)(\?)?\s*:\s*([^;]+)/);
      if (!field) continue;
      const [, key, optional, type] = field;
      properties[key] = tsTypeToSchema(type.trim());
      if (!optional) required.push(key);
    }
    return { type: 'object', properties, required, additionalProperties: false };
  }
  return { type: 'object', properties: {}, additionalProperties: true };
}

function tsTypeToSchema(type) {
  const clean = type.replace(/readonly\s+/g, '').trim();
  if (/^string$/.test(clean)) return { type: 'string' };
  if (/^number$/.test(clean)) return { type: 'number' };
  if (/^boolean$/.test(clean)) return { type: 'boolean' };
  if (/\[\]$/.test(clean) || /^Array</.test(clean)) return { type: 'array', items: {} };
  const literals = [...clean.matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);
  if (literals.length >= 2) return { type: 'string', enum: literals };
  return { type: 'object', 'x-typescript': clean };
}

function extractComponents(content, rel, hash) {
  const found = [];
  const names = new Set();
  for (const re of [
    /export\s+(?:default\s+)?function\s+([A-Z][\w$]*)/g,
    /export\s+(?:const|let)\s+([A-Z][\w$]*)\s*(?::[^=]+)?=/g,
    /export\s*\{[^}]*\b([A-Z][\w$]*)\b[^}]*\}/g,
  ]) {
    for (const match of content.matchAll(re)) names.add(match[1]);
  }
  for (const name of names) {
    const lower = name.toLowerCase();
    const role = /table/.test(lower)
      ? 'collection'
      : /list|queue|grid/.test(lower)
        ? 'collection'
        : /form|wizard/.test(lower)
          ? 'form'
          : /nav|sidebar|header/.test(lower)
            ? 'navigation'
            : /dialog|modal|drawer/.test(lower)
              ? 'feedback'
              : /button|input|select|badge|text|heading/.test(lower)
                ? 'primitive'
                : /detail|panel|summary|card/.test(lower)
                  ? 'detail'
                  : 'unknown';
    const classes = [...content.matchAll(/className\s*=\s*["'`]([^"'`]+)["'`]/g)].flatMap((m) =>
      m[1].split(/\s+/),
    );
    const tokenRefs = [...content.matchAll(/var\(\s*--([\w-]+)/g)].map((m) => m[1]);
    found.push({
      id: name,
      framework: 'react',
      sourcePath: rel,
      exportName: name,
      chunkId: stableId('chunk', { rel, name }),
      contentHash: hash,
      purpose: `Host component ${name} discovered in ${rel}`,
      goodFor: tokenize(name),
      avoidFor: [],
      propsSchema: parsePropsFields(content, name),
      slots: [],
      events: [],
      acceptedDataShapes: [],
      allowedCapabilityKinds: ['query', 'command'],
      layoutRole: role,
      states: {
        loading: /loading|skeleton|spinner/i.test(content),
        empty: /empty|no results|no data/i.test(content),
        error: /error|failed/i.test(content),
        disabled: /disabled/i.test(content),
        readonly: /readOnly|readonly/i.test(content),
      },
      responsiveBehavior: { classes: classes.filter((x) => /^(sm|md|lg|xl|2xl):/.test(x)) },
      accessibilityContract: {
        semanticElements: [
          ...new Set(
            [...content.matchAll(/<(button|nav|main|aside|dialog|label|table|h[1-6])\b/g)].map(
              (m) => m[1],
            ),
          ),
        ],
        hasAria: /aria-[\w-]+/.test(content),
      },
      tokensUsed: [...new Set(tokenRefs)],
      visualExamples: [],
      confidence: 0.78,
      evidence: [sourceEvidence('typescript_source', rel, content, EVIDENCE_STATUS.OBSERVED, 0.78)],
    });
  }
  return found;
}

function extractSlots(content, rel) {
  const slots = [];
  for (const match of content.matchAll(
    /<Atelier(?:Slot|Route|DrawerSlot|ModalSlot)\b([\s\S]*?)\/?\s*>/g,
  )) {
    const attrs = match[1];
    const id = attrs.match(/\bid\s*=\s*["']([^"']+)["']/)?.[1];
    if (!id) continue;
    const tag = match[0].match(/^<([\w]+)/)?.[1] ?? 'AtelierSlot';
    const mode = tag.includes('Drawer')
      ? 'drawer'
      : tag.includes('Modal')
        ? 'modal'
        : tag.includes('Route')
          ? 'route'
          : 'inline';
    slots.push({
      id,
      mode,
      contextSchema: { type: 'object', additionalProperties: true },
      allowedCapabilityGroups: ['*'],
      allowWriteActions: mode !== 'inline' || /allowWriteActions/.test(attrs),
      allowedPiiFields: [],
      maxAdaptationLevel: Number(attrs.match(/maxAdaptationLevel\s*=\s*\{(\d)\}/)?.[1] ?? 2),
      fallback: 'host_ui',
      evidence: [sourceEvidence('slot_annotation', rel, content, EVIDENCE_STATUS.VERIFIED, 1)],
    });
  }
  return slots;
}

function extractPermissions(content, rel) {
  const values = new Set();
  for (const re of [
    /(?:hasPermission|requirePermission|can)\s*\(\s*["']([^"']+)["']/g,
    /permissions?\s*[:=]\s*\[([^\]]+)\]/g,
  ]) {
    for (const match of content.matchAll(re)) {
      const text = match[1];
      for (const literal of text.matchAll(/["']([^"']+)["']/g)) values.add(literal[1]);
      if (!text.includes("'") && !text.includes('"')) values.add(text.trim());
    }
  }
  return [...values].filter(Boolean).map((id) => ({
    id,
    evidence: [sourceEvidence('permission_check', rel, content, EVIDENCE_STATUS.OBSERVED, 0.85)],
  }));
}

function schemaFromObjectLiteral(body) {
  const properties = {};
  const keys = [...body.matchAll(/(?:^|[,\n])\s*([A-Za-z_$][\w$]*)\s*:/g)].map((m) => m[1]);
  for (const key of keys) properties[key] = { type: 'unknown' };
  return { type: 'object', properties, additionalProperties: true };
}

function extractSourceCapabilities(content, rel) {
  const capabilities = [];
  const apiRoute = apiRouteFromPath(rel);
  if (apiRoute) {
    for (const method of HTTP_METHODS) {
      const re = new RegExp(
        `export\\s+(?:async\\s+)?function\\s+${method.toUpperCase()}\\b|export\\s+const\\s+${method.toUpperCase()}\\s*=`,
        'm',
      );
      if (!re.test(content)) continue;
      const id = `${apiRoute.replace(/^\/api\//, '').replace(/[/:]+/g, '.')}.${method}`;
      capabilities.push(
        makeCapability({
          id,
          method,
          path: apiRoute,
          rel,
          content,
          source: 'route_handler',
          confidence: 0.88,
        }),
      );
    }
  }
  for (const match of content.matchAll(
    /fetch\s*\(\s*(["'`])([^"'`]+)\1\s*(?:,\s*\{([\s\S]*?)\})?\s*\)/g,
  )) {
    const path = match[2];
    if (!path.startsWith('/') && !/^https?:/.test(path)) continue;
    const options = match[3] ?? '';
    const method = options.match(/method\s*:\s*["']([A-Z]+)["']/)?.[1] ?? 'GET';
    const id = `${path
      .replace(/^https?:\/\/[^/]+/, '')
      .replace(/^\/api\//, '')
      .replace(/[/:${}]+/g, '.')
      .replace(/^\.|\.$/g, '')}.${method.toLowerCase()}`;
    capabilities.push(
      makeCapability({ id, method, path, rel, content, source: 'client_call', confidence: 0.7 }),
    );
  }
  if (/^["']use server["'];?/m.test(content)) {
    for (const match of content.matchAll(
      /export\s+(?:async\s+)?function\s+([a-zA-Z_$][\w$]*)\s*\(([^)]*)\)/g,
    )) {
      const id = `server.${match[1]}`;
      capabilities.push(
        makeCapability({
          id,
          method: 'POST',
          path: rel,
          rel,
          content,
          source: 'server_action',
          confidence: 0.82,
        }),
      );
    }
  }
  return capabilities;
}

function makeCapability({ id, method, path, rel, content, source, confidence }) {
  const risk = inferRisk(id, method);
  return {
    id,
    kind: ['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase()) ? 'query' : 'command',
    operation: { protocol: 'http', method: method.toUpperCase(), path },
    inputSchema: { type: 'object', properties: {}, additionalProperties: true },
    outputSchema: { type: 'object', properties: {}, additionalProperties: true },
    errorSchemas: [],
    readsEntities: [],
    createsEntities: [],
    updatesEntities: [],
    deletesEntities: [],
    preconditions: [],
    sideEffects: risk === 'read_only' ? [] : [`mutates:${path}`],
    requiredPermissions: [],
    idempotent: ['GET', 'PUT', 'DELETE'].includes(method.toUpperCase()),
    reversible: risk === 'read_only' ? true : 'unknown',
    risk,
    confirmation: risk === 'destructive' ? 'modal' : risk === 'sensitive' ? 'inline' : 'none',
    piiFields: [],
    examples: [],
    mustFollow: [],
    confidence,
    verification: source === 'route_handler' ? 'observed' : 'inferred',
    evidence: [
      sourceEvidence(
        source,
        rel,
        content,
        source === 'route_handler' ? EVIDENCE_STATUS.OBSERVED : EVIDENCE_STATUS.INFERRED,
        confidence,
      ),
    ],
  };
}

function extractDomainEntities(content, rel) {
  const entities = [];
  for (const match of content.matchAll(
    /(?:export\s+)?(?:interface|type)\s+([A-Z][\w$]*)\s*(?:=)?\s*\{([\s\S]*?)\}/g,
  )) {
    const [, name, body] = match;
    if (/Props$/.test(name) || ['Request', 'Response', 'Error'].includes(name)) continue;
    const fields = [];
    for (const line of body.split(/\n|;/)) {
      const field = line.trim().match(/^([A-Za-z_$][\w$]*)(\?)?\s*:\s*([^;]+)/);
      if (!field) continue;
      fields.push({
        name: field[1],
        schema: tsTypeToSchema(field[3].trim()),
        required: !field[2],
        pii: isPiiField(field[1]),
      });
    }
    if (fields.length < 2) continue;
    entities.push({
      id: name,
      name,
      fields,
      confidence: 0.72,
      evidence: [
        sourceEvidence('typescript_domain_type', rel, content, EVIDENCE_STATUS.OBSERVED, 0.72),
      ],
    });
  }
  for (const match of content.matchAll(
    /(?:export\s+)?const\s+([A-Z][\w$]*?)(?:Schema)?\s*=\s*z\.object\s*\(\s*\{([\s\S]*?)\}\s*\)/g,
  )) {
    const [, rawName, body] = match;
    const name = rawName.replace(/Schema$/, '');
    const fields = [];
    for (const field of body.matchAll(
      /([A-Za-z_$][\w$]*)\s*:\s*z\.(string|number|boolean|date|array|object)\s*\(/g,
    )) {
      const type = {
        string: 'string',
        number: 'number',
        boolean: 'boolean',
        date: 'string',
        array: 'array',
        object: 'object',
      }[field[2]];
      fields.push({
        name: field[1],
        schema: { type, ...(field[2] === 'date' ? { format: 'date-time' } : {}) },
        pii: isPiiField(field[1]),
      });
    }
    if (fields.length)
      entities.push({
        id: name,
        name,
        fields,
        confidence: 0.8,
        evidence: [sourceEvidence('zod_schema', rel, content, EVIDENCE_STATUS.OBSERVED, 0.8)],
      });
  }
  return entities;
}

function extractTrpcCapabilities(content, rel) {
  const capabilities = [];
  for (const match of content.matchAll(
    /([A-Za-z_$][\w$]*)\s*:\s*(?:publicProcedure|protectedProcedure|procedure)[\s\S]{0,1600}?\.(query|mutation|subscription)\s*\(/g,
  )) {
    const name = match[1];
    const operation = match[2];
    const kind =
      operation === 'query' ? 'query' : operation === 'subscription' ? 'stream' : 'command';
    const id = `trpc.${name}`;
    const risk = inferRisk(id, kind === 'query' ? 'QUERY' : 'POST');
    capabilities.push({
      id,
      title: name,
      kind,
      operation: { protocol: 'trpc', procedure: name, operation },
      inputSchema: { type: 'object', properties: {}, additionalProperties: true },
      outputSchema: { type: 'object', properties: {}, additionalProperties: true },
      errorSchemas: [],
      readsEntities: [],
      createsEntities: [],
      updatesEntities: [],
      deletesEntities: [],
      preconditions: [],
      sideEffects: kind === 'query' ? [] : [`trpc:${name}`],
      requiredPermissions: [],
      idempotent: kind === 'query',
      reversible: kind === 'query' ? true : 'unknown',
      risk,
      confirmation: risk === 'destructive' ? 'modal' : risk === 'sensitive' ? 'inline' : 'none',
      piiFields: [],
      examples: [],
      mustFollow: [],
      confidence: 0.68,
      verification: 'inferred',
      evidence: [sourceEvidence('trpc_source', rel, content, EVIDENCE_STATUS.INFERRED, 0.68)],
    });
  }
  return capabilities;
}

function parsePrismaSchema(content, rel) {
  const entities = [];
  for (const match of content.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\}/g)) {
    const [, name, body] = match;
    const fields = [];
    for (const line of body.split('\n')) {
      const field = line.trim().match(/^(\w+)\s+([\w\[\]?]+)/);
      if (!field || field[1].startsWith('@@')) continue;
      const raw = field[2].replace(/[?\[\]]/g, '');
      const type =
        {
          String: 'string',
          Int: 'integer',
          Float: 'number',
          Boolean: 'boolean',
          DateTime: 'string',
          Json: 'object',
        }[raw] ?? 'object';
      fields.push({
        name: field[1],
        schema: { type, ...(raw === 'DateTime' ? { format: 'date-time' } : {}) },
        pii: isPiiField(field[1]),
      });
    }
    entities.push({
      id: name,
      name,
      fields,
      confidence: 0.9,
      evidence: [sourceEvidence('prisma_schema', rel, content, EVIDENCE_STATUS.VERIFIED, 0.9)],
    });
  }
  return entities;
}

function extractW3cDesignTokens(value, rel, content) {
  const tokens = [];
  function visit(node, parts = []) {
    if (!node || typeof node !== 'object') return;
    if ('$value' in node) {
      const raw = node.$value;
      const rendered = typeof raw === 'object' ? JSON.stringify(raw) : String(raw);
      const name = parts.join('-');
      tokens.push({
        name,
        value: rendered,
        kind: cssTokenKind(name, rendered),
        sourcePath: rel,
        sourceHash: sha256(content),
      });
      return;
    }
    for (const [key, child] of Object.entries(node))
      if (!key.startsWith('$')) visit(child, [...parts, key]);
  }
  visit(value);
  return tokens;
}

function collectPiiFromSchema(schema, prefix = '', out = []) {
  if (!schema || typeof schema !== 'object') return out;
  for (const [key, value] of Object.entries(schema.properties ?? {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isPiiField(key)) out.push(path);
    collectPiiFromSchema(value, path, out);
  }
  if (schema.items) collectPiiFromSchema(schema.items, `${prefix}[]`, out);
  return out;
}

function dereferenceSchema(schema, spec, seen = new Set()) {
  if (!schema || typeof schema !== 'object') return { type: 'object', additionalProperties: true };
  if (schema.$ref) {
    if (seen.has(schema.$ref)) return { type: 'object', 'x-ref': schema.$ref };
    seen.add(schema.$ref);
    const target = schema.$ref
      .split('/')
      .slice(1)
      .reduce((node, part) => node?.[part.replace(/~1/g, '/').replace(/~0/g, '~')], spec);
    return { ...dereferenceSchema(target, spec, seen), 'x-ref': schema.$ref };
  }
  const copy = { ...schema };
  if (copy.properties)
    copy.properties = Object.fromEntries(
      Object.entries(copy.properties).map(([k, v]) => [
        k,
        dereferenceSchema(v, spec, new Set(seen)),
      ]),
    );
  if (copy.items) copy.items = dereferenceSchema(copy.items, spec, new Set(seen));
  return copy;
}

function operationInputSchema(pathItem, operation, spec) {
  const properties = {};
  const required = [];
  for (const parameter of [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])]) {
    const schema = dereferenceSchema(parameter.schema ?? {}, spec);
    properties[parameter.name] = { ...schema, 'x-location': parameter.in };
    if (parameter.required) required.push(parameter.name);
  }
  const body = operation.requestBody;
  const media = body?.content?.['application/json'] ?? Object.values(body?.content ?? {})[0];
  const bodySchema = dereferenceSchema(media?.schema ?? {}, spec);
  if (bodySchema.type === 'object') {
    Object.assign(properties, bodySchema.properties ?? {});
    required.push(...(bodySchema.required ?? []));
  } else if (body?.content) properties.body = bodySchema;
  return {
    type: 'object',
    properties,
    required: [...new Set(required)],
    additionalProperties: false,
  };
}

function operationOutputSchema(operation, spec) {
  const responses = operation.responses ?? {};
  const key =
    ['200', '201', '202', '204'].find((x) => responses[x]) ??
    Object.keys(responses).find((x) => /^2\d\d$/.test(x));
  const response = key ? responses[key] : null;
  const media =
    response?.content?.['application/json'] ?? Object.values(response?.content ?? {})[0];
  return dereferenceSchema(
    media?.schema ?? { type: 'object', properties: {}, additionalProperties: true },
    spec,
  );
}

function securityPermissions(spec, operation) {
  const security = operation.security ?? spec.security ?? [];
  return [
    ...new Set(
      security.flatMap((entry) =>
        Object.entries(entry).flatMap(([scheme, scopes]) => (scopes.length ? scopes : [scheme])),
      ),
    ),
  ];
}

function entityNamesFromSchema(schema) {
  const refs = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node['x-ref']) refs.push(node['x-ref'].split('/').at(-1));
    for (const child of Object.values(node.properties ?? {})) visit(child);
    if (node.items) visit(node.items);
  };
  visit(schema);
  return [...new Set(refs.filter(Boolean))];
}

export function parseOpenApi(
  spec,
  { sourcePath = 'openapi.json', content = JSON.stringify(spec) } = {},
) {
  if (!String(spec.openapi ?? '').startsWith('3.'))
    throw new Error('Only OpenAPI 3.x is supported');
  const capabilities = [];
  const entities = [];
  const ev = sourceEvidence('openapi', sourcePath, content, EVIDENCE_STATUS.VERIFIED, 0.95);
  for (const [name, rawSchema] of Object.entries(spec.components?.schemas ?? {})) {
    const schema = dereferenceSchema(rawSchema, spec);
    entities.push({
      id: name,
      name,
      fields: Object.entries(schema.properties ?? {}).map(([field, value]) => ({
        name: field,
        schema: value,
        pii: isPiiField(field),
      })),
      confidence: 0.95,
      evidence: [ev],
    });
  }
  for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem?.[method];
      if (!operation) continue;
      const id =
        operation.operationId ?? `${path.replace(/^\//, '').replace(/[/{}/-]+/g, '.')}.${method}`;
      const inputSchema = operationInputSchema(pathItem, operation, spec);
      const outputSchema = operationOutputSchema(operation, spec);
      const risk = inferRisk(id, method);
      const entityRefs = [
        ...new Set([...entityNamesFromSchema(inputSchema), ...entityNamesFromSchema(outputSchema)]),
      ];
      const resource = path.split('/').filter((x) => x && x !== 'api' && !x.startsWith('{'))[0];
      const inferredEntity = Object.keys(spec.components?.schemas ?? {}).find(
        (x) => x.toLowerCase() === String(resource).replace(/s$/, '').toLowerCase(),
      );
      const affected = [...new Set([...entityRefs, ...(inferredEntity ? [inferredEntity] : [])])];
      capabilities.push({
        id,
        title: operation.summary ?? operation.description ?? id,
        kind: method === 'get' ? 'query' : 'command',
        operation: { protocol: 'http', method: method.toUpperCase(), path },
        inputSchema,
        outputSchema,
        errorSchemas: Object.entries(operation.responses ?? {})
          .filter(([code]) => /^[45]/.test(code))
          .map(([code, response]) => ({ code, description: response.description ?? '' })),
        readsEntities: method === 'get' ? affected : [],
        createsEntities: method === 'post' ? affected : [],
        updatesEntities: ['put', 'patch'].includes(method) ? affected : [],
        deletesEntities: method === 'delete' ? affected : [],
        preconditions: [],
        sideEffects: method === 'get' ? [] : [`mutates:${resource ?? path}`],
        requiredPermissions: securityPermissions(spec, operation),
        idempotent: ['get', 'put', 'delete'].includes(method),
        reversible: method === 'get' ? true : (operation['x-reversible'] ?? 'unknown'),
        rollbackCapabilityId: operation['x-rollback-operation'],
        risk,
        confirmation:
          operation['x-confirmation'] ??
          (risk === 'destructive' ? 'modal' : risk === 'sensitive' ? 'inline' : 'none'),
        pagination: operation.parameters?.some((p) => /page|cursor|offset|limit/i.test(p.name))
          ? {
              style: 'parameter',
              parameters: operation.parameters
                .filter((p) => /page|cursor|offset|limit/i.test(p.name))
                .map((p) => p.name),
            }
          : undefined,
        piiFields: [
          ...new Set([...collectPiiFromSchema(inputSchema), ...collectPiiFromSchema(outputSchema)]),
        ],
        examples: [],
        mustFollow: operation['x-must-follow'] ?? [],
        confidence: 0.95,
        verification: 'verified',
        evidence: [ev],
      });
    }
  }
  return { capabilities, entities };
}

function stripGraphqlComments(text) {
  return text
    .replace(/#[^\n]*/g, '')
    .replace(/"""[\s\S]*?"""/g, '')
    .replace(/"(?:\\.|[^"\\])*"/g, '""');
}

function splitGraphqlFields(body) {
  const fields = [];
  let current = '';
  let paren = 0;
  let bracket = 0;
  for (const char of body) {
    if (char === '(') paren += 1;
    if (char === ')') paren -= 1;
    if (char === '[') bracket += 1;
    if (char === ']') bracket -= 1;
    if (char === '\n' && paren === 0 && bracket === 0) {
      if (current.trim()) fields.push(current.trim());
      current = '';
    } else current += char;
  }
  if (current.trim()) fields.push(current.trim());
  return fields;
}

function graphqlTypeSchema(typeRef) {
  const clean = typeRef.replace(/\s+/g, '');
  const required = clean.endsWith('!');
  const bare = clean.replace(/!$/, '');
  if (bare.startsWith('[')) {
    const inner = bare.slice(1, -1);
    return {
      type: 'array',
      items: graphqlTypeSchema(inner),
      nullable: !required,
      'x-graphql-type': clean,
    };
  }
  const scalar = {
    String: 'string',
    ID: 'string',
    Int: 'integer',
    Float: 'number',
    Boolean: 'boolean',
  }[bare];
  return {
    type: scalar ?? 'object',
    nullable: !required,
    ...(scalar ? {} : { 'x-entity': bare }),
    'x-graphql-type': clean,
  };
}

function parseGraphqlArgs(argsText = '') {
  const properties = {};
  const required = [];
  for (const match of argsText.matchAll(/(\w+)\s*:\s*([\[\]!\w]+)/g)) {
    properties[match[1]] = graphqlTypeSchema(match[2]);
    if (match[2].endsWith('!')) required.push(match[1]);
  }
  return { type: 'object', properties, required, additionalProperties: false };
}

export function parseGraphql(sdl, { sourcePath = 'schema.graphql' } = {}) {
  const cleaned = stripGraphqlComments(sdl);
  const capabilities = [];
  const entities = [];
  const ev = sourceEvidence('graphql_schema', sourcePath, sdl, EVIDENCE_STATUS.VERIFIED, 0.94);
  for (const typeMatch of cleaned.matchAll(
    /(?:type|interface)\s+(\w+)(?:\s+implements[^\{]+)?\s*\{([\s\S]*?)\}/g,
  )) {
    const [, typeName, body] = typeMatch;
    const fields = [];
    for (const entry of splitGraphqlFields(body)) {
      const match = entry.match(/^(\w+)\s*(?:\(([\s\S]*?)\))?\s*:\s*([\[\]!\w]+)/);
      if (!match) continue;
      fields.push({
        name: match[1],
        args: match[2] ?? '',
        typeRef: match[3],
        pii: isPiiField(match[1]),
      });
    }
    if (!['Query', 'Mutation', 'Subscription'].includes(typeName)) {
      entities.push({
        id: typeName,
        name: typeName,
        fields: fields.map((f) => ({
          name: f.name,
          schema: graphqlTypeSchema(f.typeRef),
          pii: f.pii,
        })),
        confidence: 0.94,
        evidence: [ev],
      });
      continue;
    }
    for (const field of fields) {
      const kind = typeName === 'Query' ? 'query' : typeName === 'Mutation' ? 'command' : 'stream';
      const id = `graphql.${typeName.toLowerCase()}.${field.name}`;
      const risk = inferRisk(id, kind === 'query' ? 'QUERY' : 'POST');
      const output = graphqlTypeSchema(field.typeRef);
      const entity = output['x-entity'] ?? output.items?.['x-entity'];
      capabilities.push({
        id,
        title: field.name,
        kind,
        operation: {
          protocol: 'graphql',
          operationType: typeName.toLowerCase(),
          field: field.name,
        },
        inputSchema: parseGraphqlArgs(field.args),
        outputSchema: output,
        errorSchemas: [],
        readsEntities: kind === 'query' && entity ? [entity] : [],
        createsEntities: [],
        updatesEntities: kind === 'command' && entity ? [entity] : [],
        deletesEntities: [],
        preconditions: [],
        sideEffects: kind === 'query' ? [] : [`graphql:${field.name}`],
        requiredPermissions: [],
        idempotent: kind === 'query',
        reversible: kind === 'query' ? true : 'unknown',
        risk,
        confirmation: risk === 'destructive' ? 'modal' : risk === 'sensitive' ? 'inline' : 'none',
        piiFields: Object.keys(parseGraphqlArgs(field.args).properties).filter(isPiiField),
        examples: [],
        mustFollow: [],
        confidence: 0.94,
        verification: 'verified',
        evidence: [ev],
      });
    }
  }
  return { capabilities, entities };
}

function cssTokenKind(name, value) {
  if (
    /color|background|foreground|primary|accent|danger|success|warning|#[0-9a-f]|rgb|hsl/i.test(
      `${name}:${value}`,
    )
  )
    return 'color';
  if (/radius/i.test(name)) return 'radius';
  if (/shadow/i.test(name)) return 'shadow';
  if (/space|spacing|gap|size/i.test(name)) return 'spacing';
  if (/font|type|line-height/i.test(name)) return 'typography';
  if (/duration|motion|ease/i.test(name)) return 'motion';
  return 'other';
}

function extractCssSignals(content, rel) {
  const sourceHash = sha256(content);
  const tokens = [];
  for (const match of content.matchAll(/--([\w-]+)\s*:\s*([^;}{]+);/g)) {
    tokens.push({
      name: match[1],
      value: match[2].trim(),
      kind: cssTokenKind(match[1], match[2]),
      sourcePath: rel,
      sourceHash,
    });
  }
  return tokens;
}

function extractClassSignals(content, rel) {
  const classes = [...content.matchAll(/className\s*=\s*["'`]([^"'`]+)["'`]/g)]
    .flatMap((m) => m[1].split(/\s+/))
    .filter(Boolean);
  return classes.length ? [{ sourcePath: rel, sourceHash: sha256(content), classes }] : [];
}

function mergeFacts(items, key = 'id') {
  const map = new Map();
  for (const item of items) {
    const id = item[key];
    if (!id) continue;
    const current = map.get(id);
    if (!current) {
      map.set(id, item);
      continue;
    }
    const winner = (item.confidence ?? 0) > (current.confidence ?? 0) ? item : current;
    const loser = winner === item ? current : item;
    map.set(id, {
      ...loser,
      ...winner,
      evidence: [...(current.evidence ?? []), ...(item.evidence ?? [])],
      requiredPermissions: [
        ...new Set([...(current.requiredPermissions ?? []), ...(item.requiredPermissions ?? [])]),
      ],
      piiFields: [...new Set([...(current.piiFields ?? []), ...(item.piiFields ?? [])])],
    });
  }
  return [...map.values()].sort((a, b) => String(a[key]).localeCompare(String(b[key])));
}

export function summarizeRuntimeObservations(
  records,
  { sourcePath = 'atelier.observations.json' } = {},
) {
  const grouped = new Map();
  for (const record of records) {
    const key = record.capabilityId ?? `${record.method ?? 'GET'}:${record.path ?? 'unknown'}`;
    const group = grouped.get(key) ?? {
      key,
      count: 0,
      latencies: [],
      status: new Map(),
      fields: new Map(),
    };
    group.count += 1;
    if (Number.isFinite(record.durationMs)) group.latencies.push(record.durationMs);
    if (record.status)
      group.status.set(String(record.status), (group.status.get(String(record.status)) ?? 0) + 1);
    for (const field of record.responseFields ?? [])
      group.fields.set(field, (group.fields.get(field) ?? 0) + 1);
    grouped.set(key, group);
  }
  return [...grouped.values()].map((group) => ({
    capabilityId: group.key,
    sampleCount: group.count,
    latencyMs: group.latencies.length
      ? {
          min: Math.min(...group.latencies),
          max: Math.max(...group.latencies),
          average: Math.round(group.latencies.reduce((a, b) => a + b, 0) / group.latencies.length),
        }
      : null,
    statuses: Object.fromEntries(group.status),
    commonFields: [...group.fields.entries()].map(([field, count]) => ({
      field,
      presence: count / group.count,
    })),
    valuesCaptured: false,
    evidence: [
      sourceEvidence(
        'runtime_observation',
        sourcePath,
        JSON.stringify(records),
        EVIDENCE_STATUS.OBSERVED,
        0.85,
      ),
    ],
  }));
}

async function optionalTypeScriptEnrichment(projectRoot, sourceFiles, components) {
  try {
    const ts = await import('typescript');
    const program = ts.createProgram(sourceFiles, {
      allowJs: true,
      jsx: ts.JsxEmit.ReactJSX,
      skipLibCheck: true,
    });
    const checker = program.getTypeChecker();
    const byPath = new Map(components.map((x) => [resolve(projectRoot, x.sourcePath), x]));
    for (const sourceFile of program.getSourceFiles()) {
      if (!sourceFile.fileName.startsWith(resolve(projectRoot))) continue;
      const component = byPath.get(sourceFile.fileName);
      if (!component) continue;
      ts.forEachChild(sourceFile, (node) => {
        if (
          !ts.isFunctionDeclaration(node) ||
          !node.name ||
          node.name.text !== component.exportName ||
          !node.parameters[0]
        )
          return;
        const type = checker.getTypeAtLocation(node.parameters[0]);
        const properties = {};
        const required = [];
        for (const symbol of type.getProperties()) {
          const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
          const propType = declaration
            ? checker.typeToString(checker.getTypeOfSymbolAtLocation(symbol, declaration))
            : 'unknown';
          properties[symbol.name] = tsTypeToSchema(propType);
          if (!(symbol.flags & ts.SymbolFlags.Optional)) required.push(symbol.name);
        }
        component.propsSchema = {
          type: 'object',
          properties,
          required,
          additionalProperties: false,
        };
        component.confidence = 0.92;
        component.evidence.push(
          sourceEvidence(
            'typescript_compiler',
            component.sourcePath,
            component.contentHash,
            EVIDENCE_STATUS.OBSERVED,
            0.92,
          ),
        );
      });
    }
    return { enabled: true, packageVersion: ts.version };
  } catch {
    return { enabled: false, reason: 'typescript package not installed; lexical scanner used' };
  }
}

export async function scanProject(projectRoot, options = {}) {
  const root = resolve(projectRoot);
  const allFiles = await walkProject(root, options);
  const routes = [];
  const components = [];
  const slots = [];
  const permissions = [];
  const capabilities = [];
  const entities = [];
  const designTokens = [];
  const classSignals = [];
  const sourceHashes = [];
  const observations = [];
  const scanIssues = [];
  const adapters = ['lexical-react-next'];
  const sourceFiles = [];

  for (const file of allFiles) {
    const rel = relative(root, file).split(sep).join('/');
    const ext = extname(file).toLowerCase();
    const size = (await stat(file)).size;
    if (size > (options.maxFileBytes ?? 2_000_000)) continue;
    let content;
    try {
      content = await readFile(file, 'utf8');
    } catch {
      continue;
    }
    const hash = sha256(content);
    sourceHashes.push({ path: rel, hash });

    if (SOURCE_EXTENSIONS.has(ext)) {
      sourceFiles.push(file);
      const path = routeFromPath(rel);
      if (path)
        routes.push({
          id: stableId('route', path),
          path,
          sourcePath: rel,
          evidence: [
            sourceEvidence('route_convention', rel, content, EVIDENCE_STATUS.OBSERVED, 0.9),
          ],
        });
      components.push(...extractComponents(content, rel, hash));
      slots.push(...extractSlots(content, rel));
      permissions.push(...extractPermissions(content, rel));
      capabilities.push(...extractSourceCapabilities(content, rel));
      capabilities.push(...extractTrpcCapabilities(content, rel));
      entities.push(...extractDomainEntities(content, rel));
      classSignals.push(...extractClassSignals(content, rel));
    }
    if (ext === '.css' || ext === '.scss') designTokens.push(...extractCssSignals(content, rel));
    if (/openapi|swagger/i.test(basename(file)) && ext === '.json') {
      try {
        const parsed = parseOpenApi(JSON.parse(content), { sourcePath: rel, content });
        capabilities.push(...parsed.capabilities);
        entities.push(...parsed.entities);
        adapters.push('openapi-3');
      } catch (error) {
        if (options.strict) throw error;
      }
    }
    if (basename(file) === 'schema.prisma') {
      entities.push(...parsePrismaSchema(content, rel));
      adapters.push('prisma-schema');
    }
    if (/tokens?|design-system/i.test(basename(file)) && ext === '.json') {
      try {
        designTokens.push(...extractW3cDesignTokens(JSON.parse(content), rel, content));
        adapters.push('w3c-design-tokens');
      } catch (error) {
        scanIssues.push({
          sourcePath: rel,
          code: 'TOKEN_JSON_PARSE_FAILED',
          message: error.message,
        });
        if (options.strict) throw error;
      }
    }
    if (/openapi|swagger/i.test(basename(file)) && ['.yaml', '.yml'].includes(ext)) {
      try {
        const yaml = await import('yaml');
        const parsed = parseOpenApi(yaml.parse(content), { sourcePath: rel, content });
        capabilities.push(...parsed.capabilities);
        entities.push(...parsed.entities);
        adapters.push('openapi-3-yaml');
      } catch (error) {
        scanIssues.push({
          sourcePath: rel,
          code: 'OPENAPI_YAML_ADAPTER_REQUIRED',
          message: error.message,
        });
        if (options.strict) throw error;
      }
    }
    if (ext === '.graphql' || ext === '.gql') {
      const parsed = parseGraphql(content, { sourcePath: rel });
      capabilities.push(...parsed.capabilities);
      entities.push(...parsed.entities);
      adapters.push('graphql-sdl');
    }
    if (/atelier\.(observations|runtime)\.json$/i.test(rel)) {
      try {
        observations.push(
          ...summarizeRuntimeObservations(JSON.parse(content), { sourcePath: rel }),
        );
      } catch (error) {
        if (options.strict) throw error;
      }
    }
  }

  const tsEnrichment =
    options.typescript === false
      ? { enabled: false, reason: 'disabled' }
      : await optionalTypeScriptEnrichment(root, sourceFiles, components);
  if (tsEnrichment.enabled) adapters.push('typescript-compiler');

  const scan = {
    schemaVersion: 2,
    projectId: options.projectId ?? basename(root),
    projectRoot: root,
    generatedAt: new Date().toISOString(),
    rootHash: sha256(sourceHashes),
    routes: mergeFacts(routes, 'path'),
    components: mergeFacts(components),
    slots: mergeFacts(slots),
    permissions: mergeFacts(permissions),
    capabilities: mergeFacts(capabilities),
    entities: mergeFacts(entities),
    designTokens: mergeFacts(designTokens, 'name'),
    classSignals,
    componentSignals: mergeFacts(components),
    observations,
    adapters: [...new Set(adapters)],
    sourceSummary: {
      filesScanned: sourceHashes.length,
      sourceFiles: sourceFiles.length,
      sourceHashes,
      typescriptEnrichment: tsEnrichment,
      issues: scanIssues,
    },
  };
  scan.designGenome = buildDesignGenome(scan, { projectId: scan.projectId });
  return scan;
}
