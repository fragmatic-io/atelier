// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const PARAMETER_LOCATIONS = new Set(['path', 'query', 'header', 'cookie']);
const VALID_SCHEMA_TYPES = new Set([
  'array',
  'boolean',
  'integer',
  'null',
  'number',
  'object',
  'string',
]);

function words(value) {
  return String(value ?? '')
    .replace(/[._/-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

function title(value) {
  const text = words(value);
  return text ? text[0].toUpperCase() + text.slice(1) : 'API';
}

function openApiPath(value) {
  return String(value ?? '')
    .replace(/:([A-Za-z_$][\w$]*)\*/g, '{$1}')
    .replace(/:([A-Za-z_$][\w$]*)/g, '{$1}');
}

function cleanSchema(value) {
  if (value === true || value === false) return value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const schema = structuredClone(value);
  delete schema['x-location'];
  if (schema['x-typescript']) {
    schema['x-atelier-typescript'] = schema['x-typescript'];
    delete schema['x-typescript'];
  }
  if (schema['x-ref']) {
    schema['x-atelier-source-ref'] = schema['x-ref'];
    delete schema['x-ref'];
  }
  if (schema.type && !VALID_SCHEMA_TYPES.has(schema.type)) {
    schema['x-atelier-original-type'] = schema.type;
    delete schema.type;
  }
  if (schema.properties)
    schema.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([key, child]) => [key, cleanSchema(child)]),
    );
  if (schema.items) schema.items = cleanSchema(schema.items);
  for (const key of ['allOf', 'anyOf', 'oneOf'])
    if (Array.isArray(schema[key])) schema[key] = schema[key].map(cleanSchema);
  if (schema.not) schema.not = cleanSchema(schema.not);
  return schema;
}

function inputParts(capability, path, method) {
  const input = capability.inputSchema ?? {};
  const properties = input.properties ?? {};
  const required = new Set(input.required ?? []);
  const parameters = [];
  const bodyProperties = {};
  const bodyRequired = [];
  for (const [name, raw] of Object.entries(properties)) {
    const inferred = path.includes(`{${name}}`)
      ? 'path'
      : ['GET', 'HEAD', 'OPTIONS'].includes(method)
        ? 'query'
        : 'body';
    const location = PARAMETER_LOCATIONS.has(raw?.['x-location']) ? raw['x-location'] : inferred;
    if (location === 'body') {
      bodyProperties[name] = cleanSchema(raw);
      if (required.has(name)) bodyRequired.push(name);
      continue;
    }
    parameters.push({
      name,
      in: location,
      required: location === 'path' || required.has(name),
      schema: cleanSchema(raw),
    });
  }
  parameters.sort((a, b) => a.in.localeCompare(b.in) || a.name.localeCompare(b.name));
  const requestBody = Object.keys(bodyProperties).length
    ? {
        required: bodyRequired.length > 0,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: bodyProperties,
              ...(bodyRequired.length ? { required: bodyRequired } : {}),
              additionalProperties: input.additionalProperties === true,
            },
          },
        },
      }
    : undefined;
  return { parameters, requestBody };
}

function responses(capability) {
  const success = capability.operation?.method?.toUpperCase() === 'POST' ? '201' : '200';
  const output = cleanSchema(capability.outputSchema ?? {});
  const result = {
    [success]: {
      description: capability.kind === 'command' ? 'Command accepted' : 'Successful response',
      content: { 'application/json': { schema: output } },
    },
  };
  for (const error of capability.errorSchemas ?? []) {
    const code = /^\d{3}$|^default$/.test(String(error.code)) ? String(error.code) : 'default';
    if (!result[code]) result[code] = { description: error.description || 'Error response' };
  }
  if (!result.default)
    result.default = {
      description: 'Authorization, validation, or host execution error',
    };
  return result;
}

function operation(capability, path, method, tag) {
  const { parameters, requestBody } = inputParts(capability, path, method);
  const evidence = (capability.evidence ?? [])
    .map((item) => `${item.source}${item.sourcePath ? ` (${item.sourcePath})` : ''}`)
    .join(', ');
  const review = capability.securityReviewed
    ? 'Security reviewed for agent/tool use.'
    : 'Discovered contract only. Not approved for agent/tool execution.';
  return {
    tags: [tag],
    summary: capability.title || title(capability.id),
    description: `${review}${evidence ? `\n\nSource evidence: ${evidence}.` : ''}`,
    operationId: capability.id,
    ...(parameters.length ? { parameters } : {}),
    ...(requestBody ? { requestBody } : {}),
    responses: responses(capability),
    deprecated: capability.status === 'deprecated',
    'x-atelier-kind': capability.kind,
    'x-atelier-risk': capability.risk,
    'x-atelier-confirmation': capability.confirmation,
    'x-atelier-security-reviewed': capability.securityReviewed === true,
    'x-atelier-verification': capability.verification ?? 'unknown',
    'x-atelier-confidence': capability.confidence ?? null,
    'x-atelier-required-permissions': capability.requiredPermissions ?? [],
    'x-atelier-side-effects': capability.sideEffects ?? [],
    'x-atelier-idempotent': capability.idempotent ?? false,
    'x-atelier-reversible': capability.reversible ?? 'unknown',
    'x-atelier-must-follow': capability.mustFollow ?? [],
    'x-atelier-pii-fields': capability.piiFields ?? [],
  };
}

export function createOpenApiDocument({ project, model }) {
  if (!project || !model) throw new TypeError('Project and project model are required');
  const paths = {};
  const tags = new Set();
  let unsupported = 0;
  for (const capability of model.capabilities ?? []) {
    const protocol = capability.operation?.protocol;
    const method = capability.operation?.method?.toUpperCase();
    if (protocol !== 'http' || !HTTP_METHODS.has(method) || !capability.operation?.path) {
      unsupported++;
      continue;
    }
    const path = openApiPath(capability.operation.path);
    const tag = title(capability.id.split('.')[0] || path.split('/').filter(Boolean)[0]);
    tags.add(tag);
    paths[path] ??= {};
    const key = method.toLowerCase();
    const current = paths[path][key];
    if (!current) paths[path][key] = operation(capability, path, method, tag);
    else {
      current['x-atelier-capability-aliases'] = [
        ...(current['x-atelier-capability-aliases'] ?? [current.operationId]),
        capability.id,
      ];
    }
  }
  return {
    openapi: '3.1.0',
    info: {
      title: `${project.name} API reference`,
      version: model.projectVersion,
      description:
        'Automatically generated from the current Atelier project model. This inventory describes host-application contracts; it does not grant authority. Only capabilities marked security-reviewed may become agent tools.',
    },
    tags: [...tags].sort().map((name) => ({ name })),
    paths: Object.fromEntries(Object.entries(paths).sort(([a], [b]) => a.localeCompare(b))),
    'x-atelier-project-id': project.id,
    'x-atelier-project-version': model.projectVersion,
    'x-atelier-generated-from-model': true,
    'x-atelier-unsupported-capability-count': unsupported,
  };
}
