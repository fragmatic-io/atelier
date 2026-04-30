// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
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

import { toPredicate, tryParseFilter } from './filter-parser.js';
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

function applySort(records: unknown[], sort: string): unknown[] {
  // Supports `field asc` / `field desc` / `field`.
  const trimmed = sort.trim();
  const match = /^(\S+)(?:\s+(asc|desc))?$/iu.exec(trimmed);
  if (!match) return records;
  const field = match[1]!;
  const direction = (match[2] ?? 'asc').toLowerCase();
  const dir = direction === 'desc' ? -1 : 1;
  return [...records].sort((a, b) => {
    const av = readField(a, field) as number | string | undefined;
    const bv = readField(b, field) as number | string | undefined;
    if (av === bv) return 0;
    if (av === undefined) return 1;
    if (bv === undefined) return -1;
    return (av < bv ? -1 : 1) * dir;
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
    if (binding.filter) {
      const ast = tryParseFilter(binding.filter);
      if (ast) records = records.filter(toPredicate(ast));
    }
    if (binding.sort) records = applySort(records, binding.sort);
    if (binding.group_by) return applyGroup(records, binding.group_by);
    return records;
  };
}
