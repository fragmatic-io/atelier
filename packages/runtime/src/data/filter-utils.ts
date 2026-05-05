// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Filter helpers for `ComponentDataBinding.filter`.
 *
 * Sprint 2.4 / P3 — `filter` was widened from `string` to `string |
 * StructuredFilter`. The string form is a CEL-like expression
 * (`status == 'pending'`) parsed by `@atelier/data-resolvers`'s
 * `filter-parser`. The structured form is what the LLM tends to emit
 * naturally (`{ field: 'status', op: 'eq', value: 'pending' }`), and
 * lets manifests express compound conditions without escaping into a
 * raw expression string.
 *
 * This module exposes three helpers:
 *
 *   - `isStructuredFilter()` — type guard.
 *   - `formatFilterAsString()` — best-effort CEL-like rendering of
 *     either form. String filters pass through verbatim. Structured
 *     filters render as `field op value` (with `and` / `or`
 *     parenthesised). Used by string-only consumers as a graceful
 *     degradation hook so existing code paths (REST query strings,
 *     GraphQL variables, the mock filter parser) keep working without
 *     re-implementing structured-filter handling.
 *   - `applyFilter()` — pure in-memory predicate. Iterates an array
 *     and returns the rows matching the filter. Used by hosts that
 *     filter client-side (synthetic data, ambient previews) when the
 *     data resolver doesn't run a backend query.
 *
 * The structured-form rendering is deliberately conservative: it
 * matches the small grammar that the existing string parser already
 * understands. Anything richer (regex, BETWEEN, NULL) belongs in a
 * future grammar extension rather than a quietly diverging emitter.
 */

import type {
  StructuredFilter,
  StructuredFilterOp,
  StructuredSort,
  StructuredSortKey,
} from '@atelier/schemas';

export type FilterValue = string | StructuredFilter;

/** Type guard for `StructuredFilter`. Narrow safely without `as`. */
export function isStructuredFilter(filter: unknown): filter is StructuredFilter {
  if (filter === null || typeof filter !== 'object') return false;
  const obj = filter as Record<string, unknown>;
  return typeof obj['field'] === 'string' && typeof obj['op'] === 'string' && 'value' in obj;
}

/**
 * Best-effort CEL-like rendering of a filter.
 *
 * String filters pass through verbatim — they are already CEL-like.
 * Structured filters render as `field op value`, with `and` / `or`
 * children joined into a parenthesised group. The op vocabulary maps
 * one-to-one with the filter parser in `@atelier/data-resolvers`:
 *
 *   eq → `=`,   ne → `!=`,
 *   gt → `>`,   lt → `<`,
 *   gte → `>=`, lte → `<=`,
 *   contains → `=` over a string-coerced LHS,
 *   in / nin → `=` / `!=` over the first array element (best-effort —
 *     the CEL parser doesn't model multi-value membership).
 *
 * The renderer never throws. Unknown ops fall back to the raw op
 * keyword so the consumer can at least see what the LLM produced.
 */
export function formatFilterAsString(filter: FilterValue): string {
  if (typeof filter === 'string') return filter;
  return renderStructured(filter);
}

function renderStructured(node: StructuredFilter): string {
  const head = renderComparison(node);
  const conjuncts = (node.and ?? []).map(renderStructured);
  const disjuncts = (node.or ?? []).map(renderStructured);
  let combined = head;
  if (conjuncts.length > 0) {
    combined = `(${[combined, ...conjuncts].join(' AND ')})`;
  }
  if (disjuncts.length > 0) {
    combined = `(${[combined, ...disjuncts].join(' OR ')})`;
  }
  return combined;
}

function renderComparison(node: StructuredFilter): string {
  const op = OP_TO_CEL[node.op] ?? node.op;
  const value = renderValue(node.op, node.value);
  return `${node.field} ${op} ${value}`;
}

const OP_TO_CEL: Readonly<Record<StructuredFilterOp, string>> = Object.freeze({
  eq: '=',
  ne: '!=',
  gt: '>',
  lt: '<',
  gte: '>=',
  lte: '<=',
  contains: '=',
  in: '=',
  nin: '!=',
});

function renderValue(op: StructuredFilterOp, value: unknown): string {
  // `in` / `nin` typically receive arrays; render the first element so
  // the CEL parser has something to compare against. Hosts that need
  // full membership semantics use `applyFilter` instead.
  if ((op === 'in' || op === 'nin') && Array.isArray(value)) {
    return formatLiteral(value[0]);
  }
  return formatLiteral(value);
}

function formatLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') {
    // Quote unless the string looks like a bare identifier (the parser
    // accepts both, but quoting whitespace / operator chars keeps the
    // round-trip stable).
    if (/^[A-Za-z_][A-Za-z0-9_.:T+-]*$/u.test(value)) return value;
    return `'${value.replace(/'/gu, "\\'")}'`;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  // Fall back to JSON for structured values so the output is still
  // human-readable rather than `[object Object]`.
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

/**
 * In-memory predicate runner.
 *
 * Returns the subset of `items` that match `filter`. Accepts either
 * filter form. Strings are best-effort coerced into a structured
 * predicate by routing through `parseStringFilter` — but the heavy
 * lifting for raw-string CEL lives in `@atelier/data-resolvers`'s
 * `filter-parser`, so callers with that dependency available should
 * prefer it. This helper is intentionally dependency-free so any
 * package can import it.
 */
export function applyFilter<T>(items: readonly T[], filter: FilterValue | undefined): T[] {
  if (filter === undefined) return [...items];
  if (typeof filter === 'string') {
    const parsed = parseStringFilter(filter);
    if (!parsed) return [...items];
    return items.filter((row) => evaluate(parsed, row));
  }
  return items.filter((row) => evaluate(filter, row));
}

function evaluate(node: StructuredFilter, row: unknown): boolean {
  // The head comparison + every `and` branch combine via conjunction.
  const headMatches = compareField(row, node);
  const andMatches =
    !node.and || node.and.length === 0 || node.and.every((child) => evaluate(child, row));
  const conjunction = headMatches && andMatches;
  // `or` branches widen the match: the result is true if the conjunction
  // matches OR any `or` branch matches.
  if (node.or && node.or.length > 0) {
    return conjunction || node.or.some((child) => evaluate(child, row));
  }
  return conjunction;
}

function compareField(row: unknown, node: StructuredFilter): boolean {
  const left = readField(row, node.field);
  const right = node.value;
  switch (node.op) {
    case 'eq':
      return Object.is(left, right);
    case 'ne':
      return !Object.is(left, right);
    case 'gt':
      return cmp(left, right) > 0;
    case 'lt':
      return cmp(left, right) < 0;
    case 'gte':
      return cmp(left, right) >= 0;
    case 'lte':
      return cmp(left, right) <= 0;
    case 'contains':
      return contains(left, right);
    case 'in':
      return Array.isArray(right) && right.some((candidate) => Object.is(left, candidate));
    case 'nin':
      return !Array.isArray(right) || !right.some((candidate) => Object.is(left, candidate));
    default:
      return false;
  }
}

function readField(row: unknown, field: string): unknown {
  if (row === null || typeof row !== 'object') return undefined;
  return Reflect.get(row, field) as unknown;
}

function cmp(left: unknown, right: unknown): number {
  if (typeof left === 'number' && typeof right === 'number') {
    return left === right ? 0 : left < right ? -1 : 1;
  }
  const ls = String(left);
  const rs = String(right);
  return ls === rs ? 0 : ls < rs ? -1 : 1;
}

function contains(left: unknown, right: unknown): boolean {
  if (Array.isArray(left)) return left.some((c) => Object.is(c, right));
  if (typeof left === 'string' && typeof right === 'string') return left.includes(right);
  return false;
}

/**
 * Tiny string-filter parser used by `applyFilter()` when the caller
 * supplies a raw expression string but is running in a package that
 * doesn't have `@atelier/data-resolvers` available. Supports the
 * subset that the LLM and CEL-form emitter naturally produce:
 *
 *   `<field> <op> <literal>`        — single comparison
 *   `<expr> AND <expr>`             — conjunction (no parens, left-assoc)
 *
 * Returns `undefined` for anything richer; callers fall back to "do
 * not filter" rather than mis-filter. Round-trip-tested against
 * `formatFilterAsString` over `eq` / `ne` / `gt` / `lt` / `gte` /
 * `lte`.
 */
function parseStringFilter(src: string): StructuredFilter | undefined {
  const trimmed = stripBalancedParens(src.trim());
  if (trimmed.length === 0) return undefined;
  const ands = splitTopLevel(trimmed, /\s+AND\s+/iu);
  if (ands.length === 0) return undefined;
  const [head, ...rest] = ands;
  const parsedHead = parseComparison(head!);
  if (!parsedHead) return undefined;
  if (rest.length === 0) return parsedHead;
  const parsedRest = rest
    .map((s) => parseComparison(s))
    .filter((node): node is StructuredFilter => node !== undefined);
  if (parsedRest.length !== rest.length) return undefined;
  return { ...parsedHead, and: [...(parsedHead.and ?? []), ...parsedRest] };
}

/**
 * Strip a fully-balanced outer pair of parentheses (e.g. `(a AND b)`)
 * so the formatter's parenthesised conjunctions round-trip through
 * `parseStringFilter`. Leaves expressions like `(a AND b) OR (c)`
 * untouched because the leading `(` does not balance to the trailing
 * `)`.
 */
function stripBalancedParens(src: string): string {
  let s = src;
  while (s.startsWith('(') && s.endsWith(')') && balancedAtEnd(s)) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

function balancedAtEnd(src: string): boolean {
  let depth = 0;
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '(') depth += 1;
    else if (src[i] === ')') {
      depth -= 1;
      if (depth === 0 && i !== src.length - 1) return false;
    }
  }
  return depth === 0;
}

function splitTopLevel(src: string, sep: RegExp): string[] {
  // We don't model parens / quoted strings — the LLM and the formatter
  // never emit `AND` inside a literal value with this grammar, so a
  // simple split is enough.
  return src
    .split(sep)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

const COMPARISON_RE = /^(\S+?)\s*(>=|<=|!=|==|=|>|<)\s*(.*)$/u;

function parseComparison(src: string): StructuredFilter | undefined {
  const match = COMPARISON_RE.exec(src.trim());
  if (!match) return undefined;
  const field = match[1]!;
  const opToken = match[2]!;
  const rawValue = match[3]!.trim();
  const op = TOKEN_TO_OP[opToken];
  if (!op) return undefined;
  return { field, op, value: parseLiteralValue(rawValue) };
}

const TOKEN_TO_OP: Readonly<Record<string, StructuredFilterOp>> = Object.freeze({
  '=': 'eq',
  '==': 'eq',
  '!=': 'ne',
  '>': 'gt',
  '<': 'lt',
  '>=': 'gte',
  '<=': 'lte',
});

function parseLiteralValue(raw: string): unknown {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  if (/^-?\d+(\.\d+)?$/u.test(raw)) return Number(raw);
  if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) {
    return raw.slice(1, -1).replace(/\\'/gu, "'");
  }
  return raw;
}

// =============================================================================
// Sort helpers (2026-05-06 — schema/LLM gap closure for `binding.sort`)
// =============================================================================
//
// `ComponentDataBinding.sort` was widened from `string` to
// `string | StructuredSort` (`StructuredSort` = `StructuredSortKey[]`). The
// string form follows the convention `"-created_at, +id"` (leading sign +
// field; comma separator). The structured form is what the LLM emits
// naturally for multi-field sorts.
//
// These helpers mirror the filter triplet (type guard, format, apply) so
// downstream consumers keep working with the simpler string surface.

export type SortValue = string | StructuredSort;

/** Type guard for `StructuredSort`. */
export function isStructuredSort(sort: unknown): sort is StructuredSort {
  if (!Array.isArray(sort) || sort.length === 0) return false;
  return sort.every((entry) => {
    if (entry === null || typeof entry !== 'object') return false;
    const o = entry as Record<string, unknown>;
    if (typeof o['field'] !== 'string' || o['field'].length === 0) return false;
    if (o['direction'] !== undefined && o['direction'] !== 'asc' && o['direction'] !== 'desc') {
      return false;
    }
    return true;
  });
}

/**
 * Best-effort string rendering of a sort value.
 *
 * String form passes through verbatim. Structured form renders as a
 * comma-separated list of `±field` tokens — `desc` becomes `-`, `asc`
 * (default) becomes `+`. The format round-trips cleanly through
 * `parseSortString` below; consumers that want a stable cache key get a
 * deterministic shape regardless of which form was authored.
 */
export function formatSortAsString(sort: SortValue): string {
  if (typeof sort === 'string') return sort;
  return sort.map((key) => `${key.direction === 'desc' ? '-' : '+'}${key.field}`).join(', ');
}

/**
 * Parse a sort string back into the structured form. Best-effort: tokens
 * without a leading sign default to `asc`. Used by `applySort` so the
 * comparator works against either input shape.
 */
export function parseSortString(raw: string): StructuredSort {
  const tokens = raw
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  return tokens.map<StructuredSortKey>((tok) => {
    if (tok.startsWith('-')) return { field: tok.slice(1).trim(), direction: 'desc' };
    if (tok.startsWith('+')) return { field: tok.slice(1).trim(), direction: 'asc' };
    return { field: tok, direction: 'asc' };
  });
}

/**
 * Pure in-memory comparator. Returns a new array — does NOT mutate.
 *
 * Comparison is value-by-value: `<`, `>` for primitives; nulls / undefined
 * sort last regardless of direction. Stability across sort keys: when key
 * `i` ties, falls through to key `i+1`. This is what manifests authored
 * with multi-field sort intend.
 */
export function applySort<T>(items: readonly T[], sort: SortValue | undefined): T[] {
  if (sort === undefined) return [...items];
  const keys = typeof sort === 'string' ? parseSortString(sort) : sort;
  if (keys.length === 0) return [...items];
  const out = [...items];
  out.sort((a, b) => {
    for (const key of keys) {
      const direction = key.direction === 'desc' ? -1 : 1;
      const av = (a as Record<string, unknown>)[key.field];
      const bv = (b as Record<string, unknown>)[key.field];
      // null / undefined sort last in either direction.
      const aNullish = av === null || av === undefined;
      const bNullish = bv === null || bv === undefined;
      if (aNullish && !bNullish) return 1;
      if (!aNullish && bNullish) return -1;
      if (aNullish && bNullish) continue;
      if (av === bv) continue;
      // Comparable primitives. Anything else falls back to JSON-stringify.
      if (typeof av === 'number' && typeof bv === 'number') {
        return (av - bv) * direction;
      }
      if (
        (typeof av === 'string' || typeof av === 'boolean') &&
        (typeof bv === 'string' || typeof bv === 'boolean')
      ) {
        const as = String(av);
        const bs = String(bv);
        return as < bs ? -1 * direction : as > bs ? 1 * direction : 0;
      }
      const as = JSON.stringify(av);
      const bs = JSON.stringify(bv);
      return as < bs ? -1 * direction : as > bs ? 1 * direction : 0;
    }
    return 0;
  });
  return out;
}

/**
 * Coerce a `string | StructuredSort | undefined` to a string for
 * consumers that only handle the legacy form (REST query strings,
 * GraphQL variables, cache keys). `undefined` returns `''`.
 */
export function coerceSortToString(sort: SortValue | undefined): string {
  if (sort === undefined) return '';
  return formatSortAsString(sort);
}

// =============================================================================
// CompiledFrom helpers (2026-05-06 — schema/LLM gap closure for
// `compiled_from.capability_version`)
// =============================================================================
//
// `capability_version` was widened from `SemverString` to
// `SemverString | Record<CapabilityId, SemverString>`. The record form is
// semantically primary (each capability has its own version) and is what
// the LLM emits organically. The string form remains for the "single
// catalog snapshot" interpretation.
//
// `formatCapabilityVersion` produces a stable canonical-JSON string from
// either form so cache keys stay deterministic.

export type CapabilityVersion = string | Record<string, string>;

/**
 * Stable canonical-JSON rendering of a capability_version field for
 * cache keys. Strings pass through; records are sorted by capability id
 * and emitted as `id1@v1,id2@v2,...`. Empty record returns `''`.
 *
 * The record-shape rendering is intentionally compact (not JSON-quoted)
 * because cache keys go into URL query strings and Redis keys; quoted
 * JSON would require additional escaping per consumer. The form is
 * stable as long as `Object.keys()` / `Object.entries()` order is
 * insertion-order (which it is in modern V8).
 */
export function formatCapabilityVersion(version: CapabilityVersion): string {
  if (typeof version === 'string') return version;
  const entries = Object.entries(version).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  if (entries.length === 0) return '';
  return entries.map(([id, v]) => `${id}@${v}`).join(',');
}

/** Type guard for the record shape. */
export function isCapabilityVersionRecord(version: unknown): version is Record<string, string> {
  if (version === null || typeof version !== 'object') return false;
  return Object.values(version as Record<string, unknown>).every((v) => typeof v === 'string');
}
