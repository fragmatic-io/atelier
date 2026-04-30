// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * `cir import openapi <spec>` — generate CIR capabilities from an OpenAPI 3.x spec.
 *
 * The OpenAPI importer reads an OpenAPI 3.x spec and emits one CIR
 * capability per operation under the chosen output directory. Output is
 * schema-validated; failures are skipped with a warning. The result is a
 * starting point — review side_effects, permissions, confirmation, and
 * rate_limit before committing.
 *
 * Usage:
 *
 *   cir import openapi <spec-url-or-path> [--out capabilities/] [--dry-run] [--force]
 *
 *   --out <dir>     Output directory (default: capabilities/).
 *   --dry-run       Print the planned files without writing any.
 *   --force         Overwrite existing files. Default skips with a warning.
 *
 * Mapping (OpenAPI operation -> CIR Capability):
 *
 *  - id            <operationId> if present, else `<resource>.<verb>` heuristic.
 *  - kind          'data' for GET, 'action' for POST/PUT/PATCH/DELETE.
 *  - version       info.version (if semver) else '1.0.0'.
 *  - input         path + query + body collapsed into one record. Each property
 *                  is the OpenAPI `type` string (or 'object'/'array<...>').
 *  - output        2xx response body schema (prefer 200, then 201, then first
 *                  2xx). Empty record when no body is declared.
 *  - side_effects  [] for GET; ['mutates:<resource>'] for non-GET.
 *  - permissions   union of all declared `security` scopes (mirrors
 *                  `<scope>:<verb>` style strings the spec already uses).
 *  - confirmation  GET -> 'none', PUT/PATCH/POST -> 'inline' (soft),
 *                  DELETE -> 'modal' (hard). The CIR schema only allows
 *                  none|inline|modal|verbal_required; the brief's "soft" and
 *                  "hard" map to inline and modal respectively.
 *  - rate_limit    'x-rate-limit' extension if present, else '100/min/user'.
 *  - reversible    PUT -> true, DELETE/POST/PATCH -> false, GET -> true.
 *  - rollback      'x-rollback-operation' extension if present, else omitted.
 *
 * These are heuristics. Operators must hand-tune `side_effects`, `permissions`,
 * `confirmation`, and `rate_limit` before committing the generated files.
 *
 * Agent F integration: wire from src/index.ts as:
 *   if (cmd === 'import' && argv[1] === 'openapi') return importOpenApi(argv.slice(2));
 * Exported function: importOpenApi(args: string[]): Promise<void>
 */

/* eslint-disable no-console */

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';

import { CapabilitySchema, type Capability } from '@cir/schemas';

// -----------------------------------------------------------------------------
// Minimal hand-rolled OpenAPI 3.x types — only the bits the importer needs.
// We deliberately avoid an external parser so the CLI stays dependency-light.
// -----------------------------------------------------------------------------

interface OpenApiSpec {
  openapi?: string;
  swagger?: string;
  info?: { version?: string; title?: string };
  paths?: Record<string, OpenApiPathItem | undefined>;
  components?: {
    schemas?: Record<string, OpenApiSchema | undefined>;
    securitySchemes?: Record<string, unknown>;
  };
}

interface OpenApiPathItem {
  parameters?: OpenApiParameter[];
  get?: OpenApiOperation;
  put?: OpenApiOperation;
  post?: OpenApiOperation;
  delete?: OpenApiOperation;
  patch?: OpenApiOperation;
  head?: OpenApiOperation;
  options?: OpenApiOperation;
  trace?: OpenApiOperation;
}

interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  parameters?: OpenApiParameter[];
  requestBody?: OpenApiRequestBody;
  responses?: Record<string, OpenApiResponse | undefined>;
  security?: Array<Record<string, string[]>>;
  // OpenAPI vendor extensions
  ['x-rate-limit']?: string;
  ['x-rollback-operation']?: string;
}

interface OpenApiParameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required?: boolean;
  schema?: OpenApiSchema;
  $ref?: string;
}

interface OpenApiRequestBody {
  required?: boolean;
  content?: Record<string, { schema?: OpenApiSchema } | undefined>;
  $ref?: string;
}

interface OpenApiResponse {
  description?: string;
  content?: Record<string, { schema?: OpenApiSchema } | undefined>;
  $ref?: string;
}

interface OpenApiSchema {
  type?: string;
  format?: string;
  items?: OpenApiSchema;
  properties?: Record<string, OpenApiSchema | undefined>;
  required?: string[];
  $ref?: string;
  enum?: unknown[];
  additionalProperties?: boolean | OpenApiSchema;
  allOf?: OpenApiSchema[];
  oneOf?: OpenApiSchema[];
  anyOf?: OpenApiSchema[];
}

// -----------------------------------------------------------------------------
// Argv parsing — same conventions as the rest of the CLI.
// -----------------------------------------------------------------------------

interface ImportArgs {
  spec: string;
  out: string;
  dryRun: boolean;
  force: boolean;
  help: boolean;
}

function parseImportArgs(args: readonly string[]): ImportArgs {
  let spec = '';
  let out = 'capabilities';
  let dryRun = false;
  let force = false;
  let help = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === undefined) continue;
    if (a === '--help' || a === '-h') {
      help = true;
      continue;
    }
    if (a === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (a === '--force') {
      force = true;
      continue;
    }
    if (a === '--out') {
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        out = next;
        i++;
      }
      continue;
    }
    if (a.startsWith('--out=')) {
      out = a.slice('--out='.length);
      continue;
    }
    if (a.startsWith('--')) {
      // unknown flag — ignore for forward compatibility
      continue;
    }
    if (spec === '') {
      spec = a;
    }
  }
  return { spec, out, dryRun, force, help };
}

// -----------------------------------------------------------------------------
// Spec loading.
// -----------------------------------------------------------------------------

async function loadSpec(specRef: string, cwd: string): Promise<OpenApiSpec> {
  if (/^https?:\/\//i.test(specRef)) {
    const res = await fetch(specRef);
    if (!res.ok) {
      throw new Error(`failed to fetch ${specRef}: ${res.status} ${res.statusText}`);
    }
    const text = await res.text();
    return JSON.parse(text) as OpenApiSpec;
  }
  const abs = isAbsolute(specRef) ? specRef : resolve(cwd, specRef);
  const raw = await readFile(abs, 'utf8');
  return JSON.parse(raw) as OpenApiSpec;
}

// -----------------------------------------------------------------------------
// $ref resolution — only follows local `#/components/schemas/<name>` refs.
// External refs and circular refs degrade gracefully to `'object'`.
// -----------------------------------------------------------------------------

function resolveRef(ref: string, spec: OpenApiSpec, seen: Set<string>): OpenApiSchema | undefined {
  if (seen.has(ref)) return undefined;
  seen.add(ref);
  const m = /^#\/components\/schemas\/(.+)$/.exec(ref);
  if (!m || !m[1]) return undefined;
  return spec.components?.schemas?.[m[1]];
}

function flatten(
  schema: OpenApiSchema | undefined,
  spec: OpenApiSpec,
  seen: Set<string>,
): OpenApiSchema | undefined {
  if (!schema) return undefined;
  if (schema.$ref) {
    return flatten(resolveRef(schema.$ref, spec, seen), spec, seen);
  }
  return schema;
}

// -----------------------------------------------------------------------------
// Type-string rendering. Mirrors the lightweight `"field": "type"` style used
// by the existing capabilities (see capabilities/github/*.json).
// -----------------------------------------------------------------------------

function renderTypeString(
  schema: OpenApiSchema | undefined,
  spec: OpenApiSpec,
  seen: Set<string>,
): string {
  const s = flatten(schema, spec, seen);
  if (!s) return 'unknown';
  if (s.enum && s.enum.length > 0) return 'string';
  switch (s.type) {
    case 'integer':
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'string':
      if (s.format === 'date-time' || s.format === 'date') return 'datetime';
      return 'string';
    case 'array': {
      const inner = renderTypeString(s.items, spec, new Set(seen));
      return `array<${inner}>`;
    }
    case 'object':
      return 'object';
    default:
      return 'object';
  }
}

function renderObjectFields(
  schema: OpenApiSchema | undefined,
  spec: OpenApiSpec,
  seen: Set<string>,
): Record<string, string> {
  const s = flatten(schema, spec, seen);
  if (!s) return {};
  if (s.type === 'object' || s.properties) {
    const out: Record<string, string> = {};
    for (const [name, prop] of Object.entries(s.properties ?? {})) {
      out[name] = renderTypeString(prop, spec, new Set(seen));
    }
    return out;
  }
  // Non-object response (string, array, etc.) — wrap as a single value.
  return { value: renderTypeString(s, spec, seen) };
}

// -----------------------------------------------------------------------------
// Heuristics: id derivation, resource extraction.
// -----------------------------------------------------------------------------

const VERB_FOR_METHOD: Record<string, string> = {
  get: 'get',
  put: 'update',
  post: 'create',
  patch: 'update',
  delete: 'delete',
};

function isCollectionPath(path: string): boolean {
  // last non-empty segment is plain (no template), so it's likely a list endpoint.
  const segs = path.split('/').filter(Boolean);
  const last = segs[segs.length - 1];
  return last !== undefined && !last.includes('{');
}

function deriveResource(path: string): string {
  const rawSegs = path.split('/').filter(Boolean);
  // Prefer the deepest non-templated, non-version segment.
  const concrete = rawSegs.filter((s) => !s.includes('{') && !/^v\d+$/i.test(s));
  const fallback = rawSegs[rawSegs.length - 1]?.replace(/^\{(.+)\}$/, '$1') ?? 'resource';
  const resource = concrete[concrete.length - 1] ?? fallback;
  return resource
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+$/g, '');
}

function deriveId(method: string, path: string, operationId: string | undefined): string {
  if (operationId && operationId.trim().length > 0) {
    return camelToDot(operationId);
  }
  const resource = deriveResource(path);
  const baseVerb = VERB_FOR_METHOD[method] ?? method;
  // GET on a collection -> list; GET on a templated last segment -> get.
  let verb = baseVerb;
  if (method === 'get') {
    verb = isCollectionPath(path) ? 'list' : 'get';
  }
  return `${resource}.${verb}`;
}

function camelToDot(s: string): string {
  // updatePet -> pet.update; addPet -> pet.add; getPetById -> pet.get_by_id.
  // Heuristic: split on transitions, then if the first token is a known verb,
  // emit `<rest>.<verb>` so resource leads.
  const tokens = s
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[_\s.-]+/u)
    .filter(Boolean);
  if (tokens.length === 0) return 'op';
  const VERBS = new Set([
    'get',
    'list',
    'find',
    'fetch',
    'load',
    'read',
    'add',
    'create',
    'place',
    'post',
    'update',
    'put',
    'patch',
    'modify',
    'edit',
    'delete',
    'remove',
    'destroy',
    'purge',
    'logout',
    'login',
    'upload',
    'download',
  ]);
  const first = tokens[0]!;
  if (VERBS.has(first) && tokens.length > 1) {
    const rest = tokens.slice(1).join('_');
    return `${rest}.${first}`;
  }
  // Already resource-led; collapse to dot-separated lowercase.
  return tokens.join('.');
}

// -----------------------------------------------------------------------------
// Build a Capability from a single operation.
// -----------------------------------------------------------------------------

function isSemver(v: string): boolean {
  return /^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/u.test(v);
}

function pickResponseSchema(
  responses: Record<string, OpenApiResponse | undefined> | undefined,
  spec: OpenApiSpec,
  seen: Set<string>,
): OpenApiSchema | undefined {
  if (!responses) return undefined;
  const order = ['200', '201', '202', '203', '204'];
  let pick: OpenApiResponse | undefined;
  for (const code of order) {
    if (responses[code]) {
      pick = responses[code];
      break;
    }
  }
  if (!pick) {
    for (const [code, resp] of Object.entries(responses)) {
      if (/^2\d\d$/.test(code) && resp) {
        pick = resp;
        break;
      }
    }
  }
  if (!pick) return undefined;
  // We don't follow `$ref` on response objects — only on schemas. The 2xx
  // response objects in real-world specs almost never use `$ref` at the
  // response level (it's a less common form). If we hit one, fall back to
  // its raw content.
  const content = pick.content;
  if (!content) return undefined;
  const json = content['application/json'];
  if (json?.schema) return flatten(json.schema, spec, seen);
  // Fall back to the first declared content-type with a schema.
  for (const v of Object.values(content)) {
    if (v?.schema) return flatten(v.schema, spec, seen);
  }
  return undefined;
}

function pickRequestBodySchema(
  body: OpenApiRequestBody | undefined,
  spec: OpenApiSpec,
  seen: Set<string>,
): OpenApiSchema | undefined {
  if (!body) return undefined;
  const content = body.content;
  if (!content) return undefined;
  const json = content['application/json'];
  if (json?.schema) return flatten(json.schema, spec, seen);
  for (const v of Object.values(content)) {
    if (v?.schema) return flatten(v.schema, spec, seen);
  }
  return undefined;
}

function gatherPermissions(operation: OpenApiOperation): string[] {
  const out = new Set<string>();
  for (const req of operation.security ?? []) {
    for (const scopes of Object.values(req)) {
      for (const scope of scopes) {
        if (typeof scope === 'string' && /^[a-z][a-z0-9_.-]*:[a-z][a-z0-9_.-]*$/u.test(scope)) {
          out.add(scope);
        }
      }
    }
  }
  return Array.from(out).sort();
}

interface BuildResult {
  capability: Capability;
  /** Path relative to the output dir, e.g. `pet/list.json`. */
  relativePath: string;
}

function buildCapability(
  method: string,
  path: string,
  operation: OpenApiOperation,
  pathItem: OpenApiPathItem,
  spec: OpenApiSpec,
): BuildResult {
  const id = deriveId(method, path, operation.operationId);
  const resource = deriveResource(path);
  const kind: Capability['kind'] = method === 'get' ? 'data' : 'action';

  // Input: path + query + body fields.
  const input: Record<string, string> = {};
  const allParams = [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])];
  for (const p of allParams) {
    if (p.in !== 'path' && p.in !== 'query') continue;
    if (!p.name) continue;
    input[p.name] = renderTypeString(p.schema, spec, new Set());
  }
  const bodySchema = pickRequestBodySchema(operation.requestBody, spec, new Set());
  if (bodySchema) {
    Object.assign(input, renderObjectFields(bodySchema, spec, new Set()));
  }

  // Output: 2xx body.
  const respSchema = pickResponseSchema(operation.responses, spec, new Set());
  const output = respSchema ? renderObjectFields(respSchema, spec, new Set()) : {};

  // Confirmation: GET=none; PUT/PATCH/POST=inline; DELETE=modal.
  let confirmation: Capability['confirmation'];
  switch (method) {
    case 'get':
      confirmation = 'none';
      break;
    case 'delete':
      confirmation = 'modal';
      break;
    default:
      confirmation = 'inline';
  }

  // Side effects.
  const sideEffects: string[] = method === 'get' ? [] : [`mutates:${resource}`];

  // Reversibility heuristics.
  let reversible: boolean;
  switch (method) {
    case 'get':
      reversible = true;
      break;
    case 'put':
      reversible = true;
      break;
    default:
      reversible = false;
  }

  // Version: prefer info.version when it's a valid semver; else 1.0.0.
  const infoVersion = spec.info?.version;
  const version = infoVersion && isSemver(infoVersion) ? infoVersion : '1.0.0';

  // Rate limit: vendor extension override or default.
  const rateExt = operation['x-rate-limit'];
  const rate_limit =
    typeof rateExt === 'string' && /^\d+\/(sec|min|hour|day)\/(user|org|global)$/u.test(rateExt)
      ? rateExt
      : '100/min/user';

  const permissions = gatherPermissions(operation);

  const capability: Capability = {
    id,
    kind,
    version,
    input,
    output,
    side_effects: sideEffects,
    permissions,
    confirmation,
    rate_limit,
    reversible,
  };

  const rollbackExt = operation['x-rollback-operation'];
  if (typeof rollbackExt === 'string' && rollbackExt.length > 0) {
    capability.rollback = rollbackExt;
  }

  // File path: <resource>/<verb>.json. Verb derived from id's last dot segment.
  const verb = id.includes('.') ? id.slice(id.lastIndexOf('.') + 1) : method;
  const fileResource = resource;
  const relativePath = join(fileResource, `${sanitizeFilename(verb)}.json`);

  return { capability, relativePath };
}

function sanitizeFilename(s: string): string {
  return s.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
}

// -----------------------------------------------------------------------------
// Walk the spec — yield one Capability per operation.
// -----------------------------------------------------------------------------

const HTTP_METHODS = ['get', 'put', 'post', 'patch', 'delete'] as const;

interface PlannedFile {
  absolutePath: string;
  relativePath: string;
  contents: string;
  capability: Capability;
}

interface ImportPlan {
  files: PlannedFile[];
  warnings: string[];
}

function planImport(spec: OpenApiSpec, outDir: string): ImportPlan {
  const files: PlannedFile[] = [];
  const warnings: string[] = [];
  const usedRelativePaths = new Set<string>();

  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    if (!item) continue;
    for (const method of HTTP_METHODS) {
      const op = item[method];
      if (!op) continue;
      let built: BuildResult;
      try {
        built = buildCapability(method, path, op, item, spec);
      } catch (err) {
        warnings.push(`skip ${method.toUpperCase()} ${path}: ${(err as Error).message}`);
        continue;
      }
      // Disambiguate collisions (two ops mapping to the same relative path).
      let relativePath = built.relativePath;
      if (usedRelativePaths.has(relativePath)) {
        const stem = relativePath.replace(/\.json$/, '');
        let i = 2;
        while (usedRelativePaths.has(`${stem}_${i}.json`)) i++;
        relativePath = `${stem}_${i}.json`;
        warnings.push(
          `id collision for ${method.toUpperCase()} ${path}: writing to ${relativePath}`,
        );
      }
      usedRelativePaths.add(relativePath);

      // Validate against the CIR Capability schema before queueing.
      const parsed = CapabilitySchema.safeParse(built.capability);
      if (!parsed.success) {
        const issues = parsed.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ');
        warnings.push(`skip ${method.toUpperCase()} ${path}: schema invalid (${issues})`);
        continue;
      }

      files.push({
        absolutePath: resolve(outDir, relativePath),
        relativePath,
        contents: `${JSON.stringify(parsed.data, null, 2)}\n`,
        capability: parsed.data,
      });
    }
  }
  return { files, warnings };
}

function detectOpenApiVersion(spec: OpenApiSpec): {
  ok: boolean;
  version: string;
  warn: string | null;
} {
  if (typeof spec.swagger === 'string') {
    return {
      ok: false,
      version: `swagger ${spec.swagger}`,
      warn: `OpenAPI/Swagger ${spec.swagger} is not supported. Convert to OpenAPI 3 first.`,
    };
  }
  const v = spec.openapi;
  if (typeof v !== 'string') {
    return { ok: false, version: 'unknown', warn: 'spec is missing top-level "openapi" field' };
  }
  if (v.startsWith('3.1')) return { ok: true, version: v, warn: null };
  if (v.startsWith('3.0')) {
    return {
      ok: true,
      version: v,
      warn: `OpenAPI ${v} (3.0) — proceeding; some 3.1 features unsupported.`,
    };
  }
  if (v.startsWith('3.'))
    return { ok: true, version: v, warn: `OpenAPI ${v} — proceeding (untested minor).` };
  return { ok: false, version: v, warn: `unsupported OpenAPI version: ${v}` };
}

// -----------------------------------------------------------------------------
// CLI entry point.
// -----------------------------------------------------------------------------

const USAGE = `usage: cir import openapi <spec> [--out <dir>] [--dry-run] [--force]

Generate CIR capabilities from an OpenAPI 3.x spec. <spec> is a path or URL.

  --out <dir>     Output directory (default: capabilities/).
  --dry-run       Print the planned files without writing.
  --force         Overwrite existing files (default: skip + warn).

Generated capabilities are starting points. Review side_effects, permissions,
confirmation, and rate_limit before committing.`;

/**
 * `cir import openapi` programmatic entry point.
 *
 * Args: positional `<spec>` (URL or filesystem path), then any of
 * `--out <dir>`, `--dry-run`, `--force`.
 *
 * Always returns; prints all output via console. Exits the process on
 * unrecoverable errors via thrown Error (callers may catch).
 */
export async function importOpenApi(args: string[]): Promise<void> {
  const parsed = parseImportArgs(args);
  if (parsed.help) {
    console.log(USAGE);
    return;
  }
  if (!parsed.spec) {
    console.error(USAGE);
    throw new Error('missing required argument <spec>');
  }

  const cwd = process.cwd();
  const outDir = isAbsolute(parsed.out) ? parsed.out : resolve(cwd, parsed.out);

  let spec: OpenApiSpec;
  try {
    spec = await loadSpec(parsed.spec, cwd);
  } catch (err) {
    throw new Error(`failed to load spec ${parsed.spec}: ${(err as Error).message}`);
  }

  const detection = detectOpenApiVersion(spec);
  if (!detection.ok) {
    throw new Error(detection.warn ?? `unsupported spec (${detection.version})`);
  }
  if (detection.warn) {
    console.warn(`warn: ${detection.warn}`);
  }

  const plan = planImport(spec, outDir);

  for (const w of plan.warnings) {
    console.warn(`warn: ${w}`);
  }

  let imported = 0;
  let skipped = 0;

  if (parsed.dryRun) {
    console.log(
      `plan: ${plan.files.length} capabilit${plan.files.length === 1 ? 'y' : 'ies'} -> ${outDir}`,
    );
    for (const f of plan.files) {
      console.log(`  ${f.relativePath}  (${f.capability.id})`);
    }
  } else {
    for (const f of plan.files) {
      if (existsSync(f.absolutePath) && !parsed.force) {
        console.warn(`skip: ${f.relativePath} already exists (use --force to overwrite)`);
        skipped++;
        continue;
      }
      await mkdir(dirname(f.absolutePath), { recursive: true });
      await writeFile(f.absolutePath, f.contents, 'utf8');
      imported++;
    }
    console.log(
      `imported ${imported} capabilit${imported === 1 ? 'y' : 'ies'} into ${outDir} ` +
        `(skipped ${skipped} existing, ${plan.warnings.length} warning${plan.warnings.length === 1 ? '' : 's'})`,
    );
  }

  console.error(
    'NOTE: Generated capabilities are starting points. Review side_effects, ' +
      'permissions, confirmation, and rate_limit before committing.',
  );
}

// Agent F integration: wire from src/index.ts as:
//   if (cmd === 'import' && argv[1] === 'openapi') return importOpenApi(argv.slice(2));
// Exported function: importOpenApi(args: string[]): Promise<void>
//
// The router should treat any positional after `openapi` as the spec ref.
// All other flags (--out, --dry-run, --force, --help) are parsed inside
// importOpenApi itself, so the router can pass `argv.slice(2)` as-is.
