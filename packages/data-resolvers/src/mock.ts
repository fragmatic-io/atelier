// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `MockDataResolver` — returns fixture data from an in-memory map keyed by
 * capability id. For development, tests, and "show something while the
 * real source is offline" fallbacks.
 *
 * If the fixture is an array and the binding has a `filter`, the filter is
 * parsed via `parseFilter` and applied as a JS predicate. Sorting is
 * applied for `field asc` / `field desc` shapes; group_by groups into an
 * object keyed by the bucket value.
 *
 * Returning `undefined` is meaningful — components show their empty state.
 * The mock resolver returns `undefined` for capability ids it has no
 * fixture for, so a `CompositeDataResolver` can fall through to the next
 * adapter.
 */

import {
  coerceFilterToString,
  coerceSortToString,
  toPredicate,
  tryParseFilter,
} from './filter-parser.js';
import type { DataBinding } from './types.js';

export type FixtureValue =
  | unknown[]
  | Record<string, unknown>
  | ((binding: DataBinding) => unknown);

export interface MockResolverOptions {
  /**
   * Fixtures keyed by capability id. Either a literal value or a function
   * that builds the value from the binding (handy for "filter aware"
   * fixtures that simulate server-side filtering).
   */
  fixtures: Map<string, FixtureValue> | Record<string, FixtureValue>;
  /**
   * If true (default), array fixtures get the binding's `filter` / `sort` /
   * `group_by` applied client-side. Disable when the fixture function
   * already accounts for the binding.
   */
  applyBindingClientSide?: boolean;
}

function lookupFixture(
  fixtures: MockResolverOptions['fixtures'],
  id: string,
): FixtureValue | undefined {
  if (fixtures instanceof Map) return fixtures.get(id);
  return fixtures[id];
}

interface SortField {
  field: string;
  direction: 'asc' | 'desc';
}

function parseSortFields(sort: string): SortField[] | null {
  const fields: SortField[] = [];
  for (const token of sort.split(',')) {
    const trimmed = token.trim();
    const match = /^([+-]?)(\S+?)(?:\s+(asc|desc))?$/iu.exec(trimmed);
    if (!match) return null;
    const sign = match[1];
    const field = match[2];
    if (!field) return null;
    fields.push({
      field,
      direction: sign === '-' || match[3]?.toLowerCase() === 'desc' ? 'desc' : 'asc',
    });
  }
  return fields.length > 0 ? fields : null;
}

function applySort(records: unknown[], sort: string): unknown[] {
  const fields = parseSortFields(sort);
  if (!fields) return records;
  return [...records].sort((a, b) => {
    for (const { field, direction } of fields) {
      const av = readField(a, field) as number | string | undefined;
      const bv = readField(b, field) as number | string | undefined;
      if (av === bv) continue;
      if (av === undefined) return 1;
      if (bv === undefined) return -1;
      return (av < bv ? -1 : 1) * (direction === 'desc' ? -1 : 1);
    }
    return 0;
  });
}

function applyGroup(records: unknown[], field: string): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {};
  for (const r of records) {
    const raw = readField(r, field);
    const key = stringifyKey(raw);
    (out[key] ??= []).push(r);
  }
  return out;
}

/** Coerce a group_by bucket value to a string key without tripping no-base-to-string. */
function stringifyKey(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  // Fall back to JSON for nested values rather than `[object Object]`.
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

function readField(record: unknown, field: string): unknown {
  if (record === null || typeof record !== 'object') return undefined;
  return Reflect.get(record, field);
}

export class MockDataResolver {
  readonly #options: MockResolverOptions;

  constructor(options: MockResolverOptions) {
    this.#options = options;
  }

  resolve = (binding: DataBinding): unknown => {
    const fixture = lookupFixture(this.#options.fixtures, binding.source);
    if (fixture === undefined) return undefined;

    const value = typeof fixture === 'function' ? fixture(binding) : fixture;

    const apply = this.#options.applyBindingClientSide ?? true;
    if (!apply || !Array.isArray(value)) return value;

    let records: unknown[] = value;
    const filterStr = coerceFilterToString(binding.filter);
    if (filterStr) {
      const ast = tryParseFilter(filterStr);
      if (ast) records = records.filter(toPredicate(ast));
    }
    // 2026-05-06 — `binding.sort` widened to `string | StructuredSort`.
    // Coerce to string here so the local applySort grammar handles it.
    if (binding.sort) records = applySort(records, coerceSortToString(binding.sort));
    if (binding.group_by) return applyGroup(records, binding.group_by);
    return records;
  };
}
