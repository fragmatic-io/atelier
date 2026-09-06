// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Minimal filter / sort / group_by grammar parser.
 *
 * Mirrors the example expressions in `/Users/vid/cir/docs/artifacts.md`:
 *
 *   "requires_decision = true AND received_after = today_start"
 *   "due_within = 7d AND status != done"
 *
 * Supported operators: `=`, `!=`, `>`, `<`, `>=`, `<=`.
 * Logical: `AND`, `OR` (case-insensitive). Parens for grouping.
 * Literals: numbers, quoted strings (`"..."` or `'...'`), bare identifiers,
 * booleans (`true`/`false`), and ISO-8601 date-like literals.
 *
 * The parser produces a small AST (see `FilterAst`). Three emitters consume
 * the AST:
 *   - `toQueryString()`     — REST-friendly `?filter=...` (round-trips the
 *                             raw expression for max compatibility).
 *   - `toWhereClause()`     — SQL/GraphQL-flavoured WHERE clause.
 *   - `toPredicate()`       — JS predicate function for in-memory filtering
 *                             (used by `MockDataResolver`).
 *
 * Compromises (this is intentionally a small parser, not a full SQL grammar):
 *   - No `IN`, `BETWEEN`, `LIKE`, `NULL` literal, or function calls.
 *   - No nested field access (`user.name`); identifiers are flat tokens.
 *   - Date literals are parsed into JS `Date` objects when the right-hand
 *     side looks like an ISO-8601 string, otherwise left as strings — the
 *     grammar in `docs/artifacts.md` uses logical literals like `today_start`
 *     and `7d` that the host is expected to interpret. We pass those through
 *     untouched so consumers can wire their own date math.
 */

import type { StructuredFilter, StructuredFilterOp, StructuredSort } from '@atelier/schemas';

// -----------------------------------------------------------------------------
// AST shapes
// -----------------------------------------------------------------------------

export type ComparisonOp = '=' | '!=' | '>' | '<' | '>=' | '<=';
export type LogicalOp = 'AND' | 'OR';

export type LiteralValue = string | number | boolean | Date;

export interface ComparisonNode {
  type: 'comparison';
  field: string;
  op: ComparisonOp;
  value: LiteralValue;
  /** Original right-hand-side token, before literal coercion (useful for query-string round-trips). */
  rawValue: string;
}

export interface LogicalNode {
  type: 'logical';
  op: LogicalOp;
  left: FilterAst;
  right: FilterAst;
}

export type FilterAst = ComparisonNode | LogicalNode;

// -----------------------------------------------------------------------------
// Tokeniser
// -----------------------------------------------------------------------------

type TokenKind = 'ident' | 'string' | 'number' | 'bool' | 'op' | 'logical' | 'lparen' | 'rparen';

interface Token {
  kind: TokenKind;
  value: string;
}

const COMPARISON_OPS: readonly ComparisonOp[] = ['>=', '<=', '!=', '=', '>', '<'];
const LOGICAL_OPS: readonly LogicalOp[] = ['AND', 'OR'];

function tokenise(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;

    // Whitespace.
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    // Parens.
    if (ch === '(') {
      tokens.push({ kind: 'lparen', value: '(' });
      i += 1;
      continue;
    }
    if (ch === ')') {
      tokens.push({ kind: 'rparen', value: ')' });
      i += 1;
      continue;
    }

    // Quoted string. Same delimiter closes; backslash-escapes the delimiter.
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      let buf = '';
      while (j < src.length) {
        const c = src[j]!;
        if (c === '\\' && j + 1 < src.length) {
          buf += src[j + 1]!;
          j += 2;
          continue;
        }
        if (c === quote) break;
        buf += c;
        j += 1;
      }
      if (j >= src.length) {
        throw new Error(`unterminated string literal starting at index ${String(i)}`);
      }
      tokens.push({ kind: 'string', value: buf });
      i = j + 1;
      continue;
    }

    // Multi-char or single-char operators.
    const twoCh = src.slice(i, i + 2);
    if ((COMPARISON_OPS as readonly string[]).includes(twoCh)) {
      tokens.push({ kind: 'op', value: twoCh });
      i += 2;
      continue;
    }
    if ((COMPARISON_OPS as readonly string[]).includes(ch)) {
      tokens.push({ kind: 'op', value: ch });
      i += 1;
      continue;
    }

    // Number literal — supports leading `-`, decimals.
    // If the run of digits/dots is immediately followed by a letter, `:` or `-`
    // (which would extend it into an identifier or ISO date), promote the
    // whole token to an identifier instead. This lets `7d`, `1.5x`, and
    // `2026-04-30` lex as a single identifier rather than choking the parser.
    if (/[0-9]/.test(ch) || (ch === '-' && i + 1 < src.length && /[0-9]/.test(src[i + 1]!))) {
      let j = i + 1;
      while (j < src.length && /[0-9.]/.test(src[j]!)) j += 1;
      const next = src[j];
      if (next !== undefined && /[A-Za-z_:T+-]/.test(next)) {
        // Continue consuming as an identifier.
        while (j < src.length && /[A-Za-z0-9_.:T+-]/.test(src[j]!)) j += 1;
        tokens.push({ kind: 'ident', value: src.slice(i, j) });
      } else {
        tokens.push({ kind: 'number', value: src.slice(i, j) });
      }
      i = j;
      continue;
    }

    // Identifier / keyword. Allows `_`, `.`, `-`, alphanumerics so logical
    // tokens like `today_start`, `7d`, `2026-04-30T00:00:00Z` can surface as
    // a single token. Also covers booleans and AND/OR.
    if (/[A-Za-z_]/.test(ch)) {
      let j = i + 1;
      while (j < src.length && /[A-Za-z0-9_.:T+-]/.test(src[j]!)) j += 1;
      const raw = src.slice(i, j);
      const upper = raw.toUpperCase();
      if ((LOGICAL_OPS as readonly string[]).includes(upper)) {
        tokens.push({ kind: 'logical', value: upper });
      } else if (raw === 'true' || raw === 'false') {
        tokens.push({ kind: 'bool', value: raw });
      } else {
        tokens.push({ kind: 'ident', value: raw });
      }
      i = j;
      continue;
    }

    throw new Error(`unexpected character ${JSON.stringify(ch)} at index ${String(i)}`);
  }
  return tokens;
}

// -----------------------------------------------------------------------------
// Parser (recursive descent: OR-expr -> AND-expr -> comparison)
// -----------------------------------------------------------------------------

class Parser {
  #pos = 0;
  constructor(private readonly tokens: Token[]) {}

  parse(): FilterAst {
    const ast = this.#parseOr();
    if (this.#pos !== this.tokens.length) {
      throw new Error(
        `unexpected token ${JSON.stringify(this.tokens[this.#pos]?.value)} after expression`,
      );
    }
    return ast;
  }

  #peek(): Token | undefined {
    return this.tokens[this.#pos];
  }

  #consume(): Token {
    const t = this.tokens[this.#pos];
    if (!t) throw new Error('unexpected end of expression');
    this.#pos += 1;
    return t;
  }

  #parseOr(): FilterAst {
    let left = this.#parseAnd();
    while (this.#peek()?.kind === 'logical' && this.#peek()?.value === 'OR') {
      this.#consume();
      const right = this.#parseAnd();
      left = { type: 'logical', op: 'OR', left, right };
    }
    return left;
  }

  #parseAnd(): FilterAst {
    let left = this.#parsePrimary();
    while (this.#peek()?.kind === 'logical' && this.#peek()?.value === 'AND') {
      this.#consume();
      const right = this.#parsePrimary();
      left = { type: 'logical', op: 'AND', left, right };
    }
    return left;
  }

  #parsePrimary(): FilterAst {
    const t = this.#peek();
    if (!t) throw new Error('expected expression');
    if (t.kind === 'lparen') {
      this.#consume();
      const inner = this.#parseOr();
      const close = this.#consume();
      if (close.kind !== 'rparen') {
        throw new Error(`expected ')' but got ${JSON.stringify(close.value)}`);
      }
      return inner;
    }
    return this.#parseComparison();
  }

  #parseComparison(): ComparisonNode {
    const fieldTok = this.#consume();
    if (fieldTok.kind !== 'ident') {
      throw new Error(`expected field name, got ${JSON.stringify(fieldTok.value)}`);
    }
    const opTok = this.#consume();
    if (opTok.kind !== 'op') {
      throw new Error(`expected comparison operator, got ${JSON.stringify(opTok.value)}`);
    }
    const valTok = this.#consume();
    const { value, rawValue } = coerceLiteral(valTok);
    return {
      type: 'comparison',
      field: fieldTok.value,
      op: opTok.value as ComparisonOp,
      value,
      rawValue,
    };
  }
}

// ISO-8601 date detection. Matches `YYYY-MM-DD` and `YYYY-MM-DDTHH:mm:ss(Z|±HH:mm)`.
const ISO_DATE_RE =
  /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/u;

function coerceLiteral(tok: Token): { value: LiteralValue; rawValue: string } {
  switch (tok.kind) {
    case 'string':
      // Strings: try ISO-date coercion, else keep as string.
      if (ISO_DATE_RE.test(tok.value)) {
        const d = new Date(tok.value);
        if (!Number.isNaN(d.getTime())) return { value: d, rawValue: tok.value };
      }
      return { value: tok.value, rawValue: tok.value };
    case 'number':
      return { value: Number(tok.value), rawValue: tok.value };
    case 'bool':
      return { value: tok.value === 'true', rawValue: tok.value };
    case 'ident': {
      // Bare ISO date as ident.
      if (ISO_DATE_RE.test(tok.value)) {
        const d = new Date(tok.value);
        if (!Number.isNaN(d.getTime())) return { value: d, rawValue: tok.value };
      }
      // Otherwise a logical literal like `today_start`, `7d`. Pass through.
      return { value: tok.value, rawValue: tok.value };
    }
    default:
      throw new Error(`unexpected token in value position: ${JSON.stringify(tok.value)}`);
  }
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/** Parse a filter expression into an AST. Throws on malformed input. */
export function parseFilter(src: string): FilterAst {
  const trimmed = src.trim();
  if (trimmed.length === 0) {
    throw new Error('cannot parse empty filter expression');
  }
  return new Parser(tokenise(trimmed)).parse();
}

/**
 * Sprint 2.4 / P3 — coerce a `StructuredFilter` into a CEL-like
 * expression string so the existing string-based parsers + emitters
 * (`tryParseFilter`, `astToString`, `toQueryString`, `toWhereClause`)
 * work uniformly across both filter forms.
 *
 * Mirrors `formatFilterAsString` in `@atelier/runtime/src/data/filter-utils.ts`
 * — kept inline here so `@atelier/data-resolvers` does not take a
 * dependency on `@atelier/runtime`. The two implementations share a
 * round-trip test in the runtime suite.
 */
export function structuredFilterToString(filter: StructuredFilter): string {
  const head = renderStructuredComparison(filter);
  const ands = (filter.and ?? []).map(structuredFilterToString);
  const ors = (filter.or ?? []).map(structuredFilterToString);
  let combined = head;
  if (ands.length > 0) combined = `(${[combined, ...ands].join(' AND ')})`;
  if (ors.length > 0) combined = `(${[combined, ...ors].join(' OR ')})`;
  return combined;
}

function renderStructuredComparison(node: StructuredFilter): string {
  const op = STRUCTURED_OP_TO_CEL[node.op] ?? node.op;
  const value = renderStructuredValue(node.op, node.value);
  return `${node.field} ${op} ${value}`;
}

const STRUCTURED_OP_TO_CEL: Readonly<Record<StructuredFilterOp, string>> = Object.freeze({
  eq: '=',
  ne: '!=',
  gt: '>',
  lt: '<',
  gte: '>=',
  lte: '<=',
  // `contains` / `in` / `nin` collapse to equality semantics for the CEL
  // grammar; consumers wanting full membership semantics drive an
  // in-memory predicate via `applyFilter` from `@atelier/runtime`.
  contains: '=',
  in: '=',
  nin: '!=',
});

function renderStructuredValue(op: StructuredFilterOp, value: unknown): string {
  if ((op === 'in' || op === 'nin') && Array.isArray(value)) {
    return formatStructuredLiteral(value[0]);
  }
  return formatStructuredLiteral(value);
}

function formatStructuredLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') {
    if (/^[A-Za-z_][A-Za-z0-9_.:T+-]*$/u.test(value)) return value;
    return `'${value.replace(/'/gu, "\\'")}'`;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

/**
 * Coerce either filter form into a string for a string-only consumer.
 * `undefined` flows through as `undefined`; strings pass through;
 * structured filters render via `structuredFilterToString`.
 */
export function coerceFilterToString(
  filter: string | StructuredFilter | undefined,
): string | undefined {
  if (filter === undefined) return undefined;
  if (typeof filter === 'string') return filter;
  return structuredFilterToString(filter);
}

/**
 * Coerce either sort form into a string for string-only consumers
 * (REST query strings, GraphQL variables, the local mock applySort
 * grammar). `undefined` flows through as `''`; strings pass through;
 * structured sorts render as `±field, ±field, ...` where `-` = desc and
 * `+` = asc (default if direction is unspecified).
 *
 * 2026-05-06 — added during the schema/LLM gap closure for `binding.sort`.
 * Mirrors `coerceFilterToString` shape; the runtime version lives in
 * `@atelier/runtime`'s `data/filter-utils` and is the canonical impl.
 * This duplicate exists so the data-resolvers package stays free of a
 * runtime workspace dep.
 */
export function coerceSortToString(sort: string | StructuredSort | undefined): string {
  if (sort === undefined) return '';
  if (typeof sort === 'string') return sort;
  return sort.map((key) => `${key.direction === 'desc' ? '-' : '+'}${key.field}`).join(', ');
}

/**
 * Best-effort parse — returns `null` instead of throwing when the source
 * cannot be parsed. Useful for resolvers that need to degrade to "pass the
 * raw filter through as a query-string parameter" rather than fail loudly.
 */
export function tryParseFilter(src: string): FilterAst | null {
  try {
    return parseFilter(src);
  } catch {
    return null;
  }
}

/** Render a `field op value` comparison back to source-like text. */
function renderLiteral(value: LiteralValue, raw: string): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  // Strings that contain spaces or operators get quoted; bare idents pass through.
  if (/[\s()=<>!]/.test(raw)) return JSON.stringify(value);
  return raw;
}

/**
 * Round-trip the AST back into a normalized expression string.
 * Used by `toQueryString()` to keep payloads readable on the wire.
 */
export function astToString(ast: FilterAst): string {
  if (ast.type === 'comparison') {
    return `${ast.field} ${ast.op} ${renderLiteral(ast.value, ast.rawValue)}`;
  }
  return `(${astToString(ast.left)} ${ast.op} ${astToString(ast.right)})`;
}

/**
 * Emit the binding's `filter` / `sort` / `group_by` as `URLSearchParams`.
 * REST adapters call this before appending to a URL.
 *
 * Filters are passed as the normalized expression string under `filter=...`.
 * Hosts that prefer a structured representation can call `parseFilter()` on
 * the same input themselves.
 */
export function toQueryString(binding: {
  filter?: string | StructuredFilter;
  sort?: string | StructuredSort;
  group_by?: string;
}): URLSearchParams {
  const params = new URLSearchParams();
  const filterStr = coerceFilterToString(binding.filter);
  if (filterStr) {
    const ast = tryParseFilter(filterStr);
    params.set('filter', ast ? astToString(ast) : filterStr);
  }
  // 2026-05-06 — coerce structured sort to string for URLSearchParams.
  const sortStr = coerceSortToString(binding.sort);
  if (sortStr.length > 0) params.set('sort', sortStr);
  if (binding.group_by) params.set('group_by', binding.group_by);
  return params;
}

/**
 * Render the AST into a SQL/GraphQL-flavoured WHERE clause. Field names are
 * passed through verbatim; string literals are single-quoted with `'` escaped.
 *
 * Note: this emitter is deliberately conservative — it is meant for hosts
 * that want a starting point, not a full safe-by-construction query builder.
 * Hosts using actual SQL must run the output through their own escaper.
 */
export function toWhereClause(ast: FilterAst): string {
  if (ast.type === 'comparison') {
    return `${ast.field} ${ast.op} ${sqlLiteral(ast.value)}`;
  }
  return `(${toWhereClause(ast.left)} ${ast.op} ${toWhereClause(ast.right)})`;
}

function sqlLiteral(value: LiteralValue): string {
  if (value instanceof Date) return `'${value.toISOString()}'`;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return `'${value.replace(/'/gu, "''")}'`;
}

/**
 * Compile the AST into a JS predicate function. Used by `MockDataResolver`
 * to filter in-memory fixture arrays.
 *
 * The predicate compares `record[field]` (read with `Reflect.get`) to the
 * literal. `Date` literals coerce both sides via `Date.parse`; numeric
 * comparisons fall back to lexicographic compare for strings.
 */
export function toPredicate<T = unknown>(ast: FilterAst): (record: T) => boolean {
  return (record) => evaluate(ast, record);
}

function evaluate(ast: FilterAst, record: unknown): boolean {
  if (ast.type === 'logical') {
    const left = evaluate(ast.left, record);
    if (ast.op === 'AND') return left && evaluate(ast.right, record);
    return left || evaluate(ast.right, record);
  }
  // comparison
  const fieldValue = readField(record, ast.field);
  return compareValues(fieldValue, ast.op, ast.value);
}

function readField(record: unknown, field: string): unknown {
  if (record === null || typeof record !== 'object') return undefined;
  return Reflect.get(record, field) as unknown;
}

function compareValues(left: unknown, op: ComparisonOp, right: LiteralValue): boolean {
  // Date comparison: coerce both sides through Date.parse when one side is a Date.
  if (right instanceof Date) {
    const l = left instanceof Date ? left.getTime() : Date.parse(String(left));
    const r = right.getTime();
    if (Number.isNaN(l)) return false;
    return numericCompare(l, op, r);
  }

  if (op === '=') return left === right;
  if (op === '!=') return left !== right;

  if (typeof left === 'number' && typeof right === 'number') {
    return numericCompare(left, op, right);
  }
  // Lexicographic fall-through for strings and mixed types.
  const ls = String(left);
  const rs = String(right);
  return numericCompare(ls > rs ? 1 : ls < rs ? -1 : 0, op, 0);
}

function numericCompare(left: number, op: ComparisonOp, right: number): boolean {
  switch (op) {
    case '=':
      return left === right;
    case '!=':
      return left !== right;
    case '>':
      return left > right;
    case '<':
      return left < right;
    case '>=':
      return left >= right;
    case '<=':
      return left <= right;
  }
}
