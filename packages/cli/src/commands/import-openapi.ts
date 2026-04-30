// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * `cir import openapi <spec>` — generate CIR capabilities from an OpenAPI 3.x spec.
 *
 * The OpenAPI importer reads an OpenAPI 3.x spec and emits one CIR capability
 * per operation under the chosen output directory. Every imported capability
 * is written as a DRAFT — it carries a `_review` envelope listing the
 * heuristic decisions (side_effects, permissions, confirmation, reversible,
 * rate_limit) that a human must audit, plus any property names that matched
 * the PII wordlist. CI's `cir-schemas validate-data --strict` refuses to
 * merge any capability with a non-empty `_review.needs` list.
 *
 * Alongside each `<resource>/<verb>.json` the importer also writes a
 * `<resource>/<verb>.review.md` sidecar — a checklist a reviewer ticks off
 * while clearing the draft. When the JSON is updated and the `_review` field
 * removed, delete the sidecar.
 *
 * Usage:
 *
 *   cir import openapi <spec-url-or-path> [--out capabilities/] [--dry-run] [--force] [--strict]
 *
 *   --out <dir>     Output directory (default: capabilities/).
 *   --dry-run       Print the planned files without writing any.
 *   --force         Overwrite existing files. Default skips with a warning.
 *                   --force also overwrites the sibling `.review.md`.
 *   --strict        Refuse to import on any of: missing `security` for non-GET
 *                   operations, ANY PII match, or ambiguous side_effects
 *                   (operation has no `responses`, unrecognized method).
 *                   Use in regulated codepaths to block risky imports outright.
 *                   Default behavior is to warn and write the draft.
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
 *  - _review       always populated for imported capabilities — see
 *                  `BASELINE_REVIEW_NEEDS` plus any PII matches. The runtime
 *                  ignores this field; CI gates against non-empty `needs`.
 *
 * These are heuristics. Operators must hand-tune `side_effects`, `permissions`,
 * `confirmation`, `reversible`, and `rate_limit` before committing the
 * generated files. The `.review.md` sidecar lists what to audit.
 *
 * Agent F integration: wire from src/index.ts as:
 *   if (cmd === 'import' && argv[1] === 'openapi') return importOpenApi(argv.slice(2));
 * Exported function: importOpenApi(args: string[]): Promise<void>
 */

/* eslint-disable no-console */

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';

import { CapabilitySchema, type Capability, type ReviewEnvelope } from '@cir/schemas';

import { readCliVersion } from '../version.js';

// -----------------------------------------------------------------------------
// PII detector wordlist.
//
// Substring, case-insensitive matches against PROPERTY NAMES in input/output.
// Word-boundary regex ensures `email` matches `userEmail` (camelCase) and
// `email_address` (snake) but NOT `mail_template` (no `email` token boundary).
//
// Exported so future callers (e.g. Wave 4 P-CLI-2's `cir compile`) can reuse
// the same wordlist without forking it. Keep the list short, obvious, and
// conservative — false positives are easier to live with than false negatives.
// -----------------------------------------------------------------------------

export const PII_TOKENS = [
  'email',
  'phone',
  'ssn',
  'dob',
  'date_of_birth',
  'birth_date',
  'address',
  'street',
  'zip',
  'postal',
  'card',
  'cvv',
  'card_number',
  'pan',
  'password',
  'auth_token',
  'api_key',
  'secret',
  'session_token',
  'ip',
  'ip_address',
  'user_agent',
  'name',
  'first_name',
  'last_name',
  'full_name',
  'gender',
  'race',
  'ethnicity',
] as const;

/**
 * Always-on `_review.needs` entries for imported capabilities.
 *
 * Every imported capability ships with these — they reflect heuristic
 * decisions the importer cannot validate. PII matches and other dynamic
 * entries are appended.
 */
export const BASELINE_REVIEW_NEEDS = [
  'side_effects',
  'permissions',
  'confirmation',
  'reversible',
  'rate_limit',
] as const;

/**
 * Build the PII matcher regexes once. Each token is wrapped with `\b` word
 * boundaries on either side. We also treat camelCase transitions as word
 * boundaries by splitting candidate names before matching (see `matchesPii`).
 */
const PII_MATCHERS: ReadonlyArray<{ token: string; re: RegExp }> = PII_TOKENS.map((t) => ({
  token: t,
  // Underscores are word chars; we match on a NORMALIZED form (camel split to
  // snake) so `email` boundary works against `userEmail` -> `user_email`.
  re: new RegExp(`(?:^|_)${t}(?:$|_)`, 'i'),
}));

/** Convert `userEmailAddress` to `user_email_address` for boundary matching. */
function normalizePropName(name: string): string {
  return name
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')
    .toLowerCase();
}

/**
 * Returns the matched PII token if `name` matches the PII wordlist, else null.
 * Match is on a normalized snake_case form so `userEmail`, `email_address`,
 * and `EmailAddress` all match `email`, while `mail_template` does not.
 */
export function matchesPii(name: string): string | null {
  const normalized = normalizePropName(name);
  for (const { token, re } of PII_MATCHERS) {
    if (re.test(normalized)) return token;
  }
  return null;
}

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
  strict: boolean;
  help: boolean;
}

function parseImportArgs(args: readonly string[]): ImportArgs {
  let spec = '';
  let out = 'capabilities';
  let dryRun = false;
  let force = false;
  let strict = false;
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
    if (a === '--strict') {
      strict = true;
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
  return { spec, out, dryRun, force, strict, help };
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

/**
 * Walk every property name on a schema (recursively flattening $refs and
 * `allOf`/`oneOf`/`anyOf` shallowly) and yield each name once. Used by the
 * PII detector and the heuristic reporter.
 */
function collectPropertyNames(
  schema: OpenApiSchema | undefined,
  spec: OpenApiSpec,
  seen: Set<string>,
  out: Set<string>,
): void {
  const s = flatten(schema, spec, seen);
  if (!s) return;
  if (s.properties) {
    for (const [name, prop] of Object.entries(s.properties)) {
      if (typeof name === 'string' && name.length > 0) out.add(name);
      collectPropertyNames(prop, spec, new Set(seen), out);
    }
  }
  if (s.items) collectPropertyNames(s.items, spec, new Set(seen), out);
  for (const composer of [s.allOf, s.oneOf, s.anyOf]) {
    if (Array.isArray(composer)) {
      for (const sub of composer) collectPropertyNames(sub, spec, new Set(seen), out);
    }
  }
}

/**
 * Detect PII properties on input + output schemas. Returns the matches with
 * their location ("input" / "output") and the wordlist token that matched.
 */
interface PiiMatch {
  location: 'input' | 'output';
  property: string;
  token: string;
}

function detectPii(inputProps: Iterable<string>, outputProps: Iterable<string>): PiiMatch[] {
  const out: PiiMatch[] = [];
  for (const p of inputProps) {
    const t = matchesPii(p);
    if (t) out.push({ location: 'input', property: p, token: t });
  }
  for (const p of outputProps) {
    const t = matchesPii(p);
    if (t) out.push({ location: 'output', property: p, token: t });
  }
  return out;
}

interface BuildResult {
  capability: Capability;
  /** Path relative to the output dir, e.g. `pet/list.json`. */
  relativePath: string;
  /** PII matches found while walking the operation schemas. */
  piiMatches: PiiMatch[];
  /** Heuristic decisions made — used to render the .review.md sidecar. */
  heuristics: HeuristicDecision[];
  /** Whether the operation declared `security`. */
  hasSecurity: boolean;
  /** Whether the operation declared `responses`. */
  hasResponses: boolean;
  /** HTTP method (lowercase). */
  method: string;
  /** OpenAPI path string. */
  path: string;
}

interface HeuristicDecision {
  field: string;
  value: string;
  rationale: string;
}

function buildCapability(
  method: string,
  path: string,
  operation: OpenApiOperation,
  pathItem: OpenApiPathItem,
  spec: OpenApiSpec,
  reviewBase: Omit<ReviewEnvelope, 'needs'>,
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

  // PII walk: collect every property name on input + output (recursively
  // through $refs/allOf/oneOf/anyOf) and run each through `matchesPii`.
  const inputProps = new Set<string>();
  const outputProps = new Set<string>();
  for (const k of Object.keys(input)) inputProps.add(k);
  for (const k of Object.keys(output)) outputProps.add(k);
  if (bodySchema) collectPropertyNames(bodySchema, spec, new Set(), inputProps);
  if (respSchema) collectPropertyNames(respSchema, spec, new Set(), outputProps);
  const piiMatches = detectPii(inputProps, outputProps);

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
  const rateExtValid =
    typeof rateExt === 'string' && /^\d+\/(sec|min|hour|day)\/(user|org|global)$/u.test(rateExt);
  const rate_limit = rateExtValid ? rateExt : '100/min/user';

  const permissions = gatherPermissions(operation);

  // ---------------------------------------------------------------------------
  // Build the _review envelope.
  //
  // Always-required entries (BASELINE_REVIEW_NEEDS) flag the heuristic
  // decisions a human must audit. Plus one entry per PII match.
  // ---------------------------------------------------------------------------
  const reviewNeeds: string[] = [...BASELINE_REVIEW_NEEDS];
  for (const m of piiMatches) {
    reviewNeeds.push(`pii:${m.location}.${m.property}`);
  }

  const review: ReviewEnvelope = {
    needs: reviewNeeds,
    imported_from: reviewBase.imported_from,
    imported_at: reviewBase.imported_at,
    importer_version: reviewBase.importer_version,
  };

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
    _review: review,
  };

  const rollbackExt = operation['x-rollback-operation'];
  if (typeof rollbackExt === 'string' && rollbackExt.length > 0) {
    capability.rollback = rollbackExt;
  }

  // Heuristic record — fed to the .review.md sidecar renderer.
  const heuristics: HeuristicDecision[] = [
    {
      field: 'side_effects',
      value: JSON.stringify(sideEffects),
      rationale:
        method === 'get'
          ? 'GET → empty list. Verify: any reads:* dependencies?'
          : `non-GET → ['mutates:${resource}']. Verify: also notifies, bills, emails, sends?`,
    },
    {
      field: 'permissions',
      value: JSON.stringify(permissions),
      rationale:
        permissions.length === 0
          ? 'Spec did not declare `security`. Almost certainly wrong — enumerate the real permissions.'
          : 'Inferred from spec `security` scopes. Verify mapping is complete.',
    },
    {
      field: 'confirmation',
      value: confirmation,
      rationale:
        method === 'delete'
          ? 'DELETE → modal. Sometimes wrong (e.g. DELETE on a draft).'
          : method === 'get'
            ? 'GET → none.'
            : 'non-GET, non-DELETE → inline (soft confirm).',
    },
    {
      field: 'reversible',
      value: String(reversible),
      rationale:
        method === 'put'
          ? 'PUT → true. Pure guess; verify the operation actually has an inverse.'
          : method === 'get'
            ? 'GET → true (no state change to reverse).'
            : `${method.toUpperCase()} → false. Pure guess; if reversible, set true and add rollback.`,
    },
    {
      field: 'rate_limit',
      value: rate_limit,
      rationale: rateExtValid
        ? 'Read from `x-rate-limit` extension on the operation.'
        : 'No `x-rate-limit` extension; fabricated default `100/min/user`. Set to a real value.',
    },
  ];

  // File path: <resource>/<verb>.json. Verb derived from id's last dot segment.
  const verb = id.includes('.') ? id.slice(id.lastIndexOf('.') + 1) : method;
  const fileResource = resource;
  const relativePath = join(fileResource, `${sanitizeFilename(verb)}.json`);

  return {
    capability,
    relativePath,
    piiMatches,
    heuristics,
    hasSecurity: Array.isArray(operation.security) && operation.security.length > 0,
    hasResponses: !!operation.responses && Object.keys(operation.responses).length > 0,
    method,
    path,
  };
}

function sanitizeFilename(s: string): string {
  return s.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
}

/**
 * Render the `.review.md` sidecar for a single imported capability.
 *
 * Lists the source spec, every heuristic decision (with rationale), every PII
 * match, a checkbox list a reviewer ticks off, and a footer explaining how to
 * clear the draft (delete `_review` from JSON + delete this `.review.md`).
 */
function renderReviewMarkdown(args: {
  capability: Capability;
  relativeJsonPath: string;
  piiMatches: PiiMatch[];
  heuristics: HeuristicDecision[];
  method: string;
  apiPath: string;
  importedFrom: string;
  importedAt: string;
  importerVersion: string;
}): string {
  const lines: string[] = [];
  lines.push(`# Review: \`${args.capability.id}\``);
  lines.push('');
  lines.push(`**Source:** \`${args.importedFrom}\``);
  lines.push(`**Operation:** \`${args.method.toUpperCase()} ${args.apiPath}\``);
  lines.push(`**Imported at:** ${args.importedAt}`);
  lines.push(`**Importer version:** ${args.importerVersion}`);
  lines.push(`**Capability JSON:** \`${args.relativeJsonPath}\``);
  lines.push('');
  lines.push('This capability was generated automatically from an OpenAPI spec. Every');
  lines.push('heuristic decision below must be audited before this file can land on `main`.');
  lines.push('CI (`cir-schemas validate-data --strict`) will refuse to merge it while');
  lines.push('the `_review` field is still present.');
  lines.push('');
  lines.push('## Heuristic decisions');
  lines.push('');
  for (const h of args.heuristics) {
    lines.push(`- **${h.field}**: \`${h.value}\` — ${h.rationale}`);
  }
  lines.push('');
  lines.push('## PII matches');
  lines.push('');
  if (args.piiMatches.length === 0) {
    lines.push('_No property names matched the PII wordlist._');
  } else {
    for (const m of args.piiMatches) {
      lines.push(
        `- \`${m.location}.${m.property}\` matched token \`${m.token}\` — confirm data-protection handling.`,
      );
    }
  }
  lines.push('');
  lines.push('## Reviewer checklist');
  lines.push('');
  lines.push('- [ ] side_effects audited and complete');
  lines.push(
    `- [ ] permissions enumerated (currently: ${JSON.stringify(args.capability.permissions)})`,
  );
  lines.push('- [ ] confirmation level appropriate');
  lines.push('- [ ] reversibility verified');
  lines.push('- [ ] rate_limit set to a real value');
  lines.push('- [ ] PII fields handled per data-protection policy');
  lines.push('');
  lines.push('## How to clear this draft');
  lines.push('');
  lines.push('When all checkboxes are ticked and the JSON is updated, remove the `_review`');
  lines.push("field from the capability JSON and delete this `.review.md`. CI's");
  lines.push('`validate-data --strict` will then accept the capability.');
  lines.push('');
  return lines.join('\n');
}

function reviewMarkdownPath(jsonRelative: string): string {
  return jsonRelative.replace(/\.json$/, '.review.md');
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
  /** Sidecar `.review.md` content. */
  reviewMarkdown: string;
  /** Sidecar `.review.md` absolute path. */
  reviewMarkdownAbsolute: string;
  /** Sidecar `.review.md` relative path (relative to outDir). */
  reviewMarkdownRelative: string;
  /** PII matches discovered for this op. Used for --strict gating + warnings. */
  piiMatches: PiiMatch[];
  /** Whether the operation declared `security`. Used for --strict gating. */
  hasSecurity: boolean;
  /** Whether the operation declared `responses`. Used for --strict gating. */
  hasResponses: boolean;
  method: string;
  apiPath: string;
}

interface ImportPlan {
  files: PlannedFile[];
  warnings: string[];
}

function planImport(
  spec: OpenApiSpec,
  outDir: string,
  reviewBase: Omit<ReviewEnvelope, 'needs'>,
): ImportPlan {
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
        built = buildCapability(method, path, op, item, spec, reviewBase);
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

      const reviewMarkdown = renderReviewMarkdown({
        capability: parsed.data,
        relativeJsonPath: relativePath,
        piiMatches: built.piiMatches,
        heuristics: built.heuristics,
        method,
        apiPath: path,
        importedFrom: reviewBase.imported_from,
        importedAt: reviewBase.imported_at,
        importerVersion: reviewBase.importer_version,
      });

      const reviewRel = reviewMarkdownPath(relativePath);

      files.push({
        absolutePath: resolve(outDir, relativePath),
        relativePath,
        contents: `${JSON.stringify(parsed.data, null, 2)}\n`,
        capability: parsed.data,
        reviewMarkdown,
        reviewMarkdownAbsolute: resolve(outDir, reviewRel),
        reviewMarkdownRelative: reviewRel,
        piiMatches: built.piiMatches,
        hasSecurity: built.hasSecurity,
        hasResponses: built.hasResponses,
        method,
        apiPath: path,
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

const USAGE = `usage: cir import openapi <spec> [--out <dir>] [--dry-run] [--force] [--strict]

Generate CIR capabilities from an OpenAPI 3.x spec. <spec> is a path or URL.

  --out <dir>     Output directory (default: capabilities/).
  --dry-run       Print the planned files without writing.
  --force         Overwrite existing files and their .review.md siblings.
  --strict        Refuse to import on any of: missing 'security' for non-GET,
                  any PII match, ambiguous side_effects (no responses, etc.).

Each emitted JSON ships as a DRAFT with a '_review' envelope listing the
heuristic decisions a human must audit. Alongside every JSON, a sibling
'<basename>.review.md' is written with a checklist for the reviewer.

CI's 'cir-schemas validate-data --strict' refuses to merge any capability
whose '_review.needs' is non-empty. Clear it by auditing each item, fixing
the JSON, dropping the '_review' field, and deleting the .review.md sidecar.`;

/**
 * `cir import openapi` programmatic entry point.
 *
 * Args: positional `<spec>` (URL or filesystem path), then any of
 * `--out <dir>`, `--dry-run`, `--force`, `--strict`.
 *
 * Always returns; prints all output via console. Throws on unrecoverable
 * errors (callers may catch). With `--strict`, throws on missing security /
 * PII matches / ambiguous side_effects without writing any files.
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

  // Build the import-time _review base (shared across every emitted file).
  // `imported_from` uses an `openapi:` prefix so the runtime/CI can tell at a
  // glance which importer produced the draft.
  const importerVersion = readCliVersion();
  const reviewBase: Omit<ReviewEnvelope, 'needs'> = {
    imported_from: `openapi:${parsed.spec}`,
    imported_at: new Date().toISOString(),
    importer_version: importerVersion,
  };

  const plan = planImport(spec, outDir, reviewBase);

  for (const w of plan.warnings) {
    console.warn(`warn: ${w}`);
  }

  // Emit per-PII warnings on stderr. These mirror the `_review.needs` entries.
  for (const f of plan.files) {
    for (const m of f.piiMatches) {
      console.warn(
        `warn: PII match in ${f.relativePath}: ${m.location}.${m.property} (token=${m.token})`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // --strict gate: refuse the import outright on risky inputs.
  // ---------------------------------------------------------------------------
  if (parsed.strict) {
    const strictFailures: string[] = [];
    for (const f of plan.files) {
      if (f.method !== 'get' && !f.hasSecurity) {
        strictFailures.push(
          `${f.relativePath}: ${f.method.toUpperCase()} ${f.apiPath} has no 'security' declaration`,
        );
      }
      if (!f.hasResponses) {
        strictFailures.push(
          `${f.relativePath}: ${f.method.toUpperCase()} ${f.apiPath} has no 'responses' (ambiguous side_effects)`,
        );
      }
      for (const m of f.piiMatches) {
        strictFailures.push(
          `${f.relativePath}: PII match ${m.location}.${m.property} (token=${m.token})`,
        );
      }
    }
    if (strictFailures.length > 0) {
      for (const msg of strictFailures) console.error(`strict: ${msg}`);
      throw new Error(
        `--strict refused import: ${strictFailures.length} issue(s); no files written`,
      );
    }
  }

  let imported = 0;
  let skipped = 0;

  if (parsed.dryRun) {
    console.log(
      `plan: ${plan.files.length} capabilit${plan.files.length === 1 ? 'y' : 'ies'} -> ${outDir}`,
    );
    for (const f of plan.files) {
      console.log(`  ${f.relativePath}  (${f.capability.id})`);
      console.log(`  ${f.reviewMarkdownRelative}  (review sidecar)`);
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
      // `.review.md` sidecar — same overwrite policy as the JSON.
      await mkdir(dirname(f.reviewMarkdownAbsolute), { recursive: true });
      await writeFile(f.reviewMarkdownAbsolute, f.reviewMarkdown, 'utf8');
      imported++;
    }
    console.log(
      `imported ${imported} capabilit${imported === 1 ? 'y' : 'ies'} into ${outDir} ` +
        `(skipped ${skipped} existing, ${plan.warnings.length} warning${plan.warnings.length === 1 ? '' : 's'})`,
    );
  }

  console.error(
    `NOTE: ${imported} capabilit${imported === 1 ? 'y' : 'ies'} written as DRAFTS. ` +
      'Review the .review.md sidecars, fix the JSON, drop the _review field, then ' +
      '`pnpm validate:data --strict`. CI will refuse to merge unreviewed drafts.',
  );
}

// Agent F integration: wire from src/index.ts as:
//   if (cmd === 'import' && argv[1] === 'openapi') return importOpenApi(argv.slice(2));
// Exported function: importOpenApi(args: string[]): Promise<void>
//
// The router should treat any positional after `openapi` as the spec ref.
// All other flags (--out, --dry-run, --force, --help) are parsed inside
// importOpenApi itself, so the router can pass `argv.slice(2)` as-is.
