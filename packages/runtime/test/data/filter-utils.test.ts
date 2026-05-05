// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { describe, expect, it } from 'vitest';
import type { StructuredFilter } from '@atelier/schemas';
import {
  applyFilter,
  formatFilterAsString,
  isStructuredFilter,
} from '../../src/data/filter-utils.js';

describe('isStructuredFilter', () => {
  it('returns true for a well-formed structured filter', () => {
    expect(isStructuredFilter({ field: 'status', op: 'eq', value: 'pending' })).toBe(true);
  });

  it('returns false for strings', () => {
    expect(isStructuredFilter("status == 'pending'")).toBe(false);
  });

  it('returns false for null / undefined / arrays', () => {
    expect(isStructuredFilter(null)).toBe(false);
    expect(isStructuredFilter(undefined)).toBe(false);
    expect(isStructuredFilter([])).toBe(false);
  });

  it('returns false when field or op are missing', () => {
    expect(isStructuredFilter({ op: 'eq', value: 'x' })).toBe(false);
    expect(isStructuredFilter({ field: 'status', value: 'x' })).toBe(false);
  });
});

describe('formatFilterAsString', () => {
  it('passes string filters through verbatim', () => {
    expect(formatFilterAsString("status == 'pending'")).toBe("status == 'pending'");
  });

  it('renders a simple eq comparison', () => {
    // Bare-ident literal — matches the data-resolvers parser convention
    // (`'pending'` and `pending` both parse to the same value, but bare
    // idents stay readable on the wire).
    expect(formatFilterAsString({ field: 'status', op: 'eq', value: 'pending' })).toBe(
      'status = pending',
    );
  });

  it('quotes string literals that contain whitespace', () => {
    expect(formatFilterAsString({ field: 'title', op: 'eq', value: 'urgent approval' })).toBe(
      "title = 'urgent approval'",
    );
  });

  it('renders a numeric comparison without quotes', () => {
    expect(formatFilterAsString({ field: 'priority', op: 'gte', value: 3 })).toBe('priority >= 3');
  });

  it('renders a boolean literal', () => {
    expect(formatFilterAsString({ field: 'starred', op: 'eq', value: true })).toBe(
      'starred = true',
    );
  });

  it('renders an identifier-like value without quotes', () => {
    expect(formatFilterAsString({ field: 'received_after', op: 'eq', value: 'today_start' })).toBe(
      'received_after = today_start',
    );
  });

  it('renders an `in` op against the first array element', () => {
    expect(formatFilterAsString({ field: 'status', op: 'in', value: ['pending', 'review'] })).toBe(
      'status = pending',
    );
  });

  it('parenthesises an AND conjunction', () => {
    const out = formatFilterAsString({
      field: 'status',
      op: 'eq',
      value: 'pending',
      and: [{ field: 'priority', op: 'gte', value: 3 }],
    });
    expect(out).toBe('(status = pending AND priority >= 3)');
  });

  it('parenthesises an OR disjunction', () => {
    const out = formatFilterAsString({
      field: 'status',
      op: 'eq',
      value: 'pending',
      or: [{ field: 'starred', op: 'eq', value: true }],
    });
    expect(out).toBe('(status = pending OR starred = true)');
  });

  it('handles ne / gt / lt / lte mappings', () => {
    expect(formatFilterAsString({ field: 'a', op: 'ne', value: 1 })).toBe('a != 1');
    expect(formatFilterAsString({ field: 'a', op: 'gt', value: 1 })).toBe('a > 1');
    expect(formatFilterAsString({ field: 'a', op: 'lt', value: 1 })).toBe('a < 1');
    expect(formatFilterAsString({ field: 'a', op: 'lte', value: 1 })).toBe('a <= 1');
  });
});

describe('applyFilter (structured)', () => {
  const items = [
    { id: 1, status: 'pending', priority: 3 },
    { id: 2, status: 'pending', priority: 1 },
    { id: 3, status: 'done', priority: 5 },
    { id: 4, status: 'review', priority: 2 },
  ];

  it('returns all items when filter is undefined', () => {
    expect(applyFilter(items, undefined)).toEqual(items);
  });

  it('filters by eq', () => {
    const out = applyFilter(items, { field: 'status', op: 'eq', value: 'pending' });
    expect(out.map((r) => r.id)).toEqual([1, 2]);
  });

  it('filters by ne', () => {
    const out = applyFilter(items, { field: 'status', op: 'ne', value: 'done' });
    expect(out.map((r) => r.id)).toEqual([1, 2, 4]);
  });

  it('filters by gt / gte / lt / lte', () => {
    expect(applyFilter(items, { field: 'priority', op: 'gt', value: 3 }).map((r) => r.id)).toEqual([
      3,
    ]);
    expect(applyFilter(items, { field: 'priority', op: 'gte', value: 3 }).map((r) => r.id)).toEqual(
      [1, 3],
    );
    expect(applyFilter(items, { field: 'priority', op: 'lt', value: 3 }).map((r) => r.id)).toEqual([
      2, 4,
    ]);
    expect(applyFilter(items, { field: 'priority', op: 'lte', value: 3 }).map((r) => r.id)).toEqual(
      [1, 2, 4],
    );
  });

  it('filters by `in` (membership)', () => {
    const out = applyFilter(items, {
      field: 'status',
      op: 'in',
      value: ['pending', 'review'],
    });
    expect(out.map((r) => r.id)).toEqual([1, 2, 4]);
  });

  it('filters by `nin` (non-membership)', () => {
    const out = applyFilter(items, {
      field: 'status',
      op: 'nin',
      value: ['done'],
    });
    expect(out.map((r) => r.id)).toEqual([1, 2, 4]);
  });

  it('filters by `contains` over arrays', () => {
    const tagged = [
      { id: 1, tags: ['a', 'b'] },
      { id: 2, tags: ['c'] },
    ];
    const out = applyFilter(tagged, { field: 'tags', op: 'contains', value: 'a' });
    expect(out.map((r) => r.id)).toEqual([1]);
  });

  it('filters by `contains` over strings', () => {
    const named = [
      { id: 1, title: 'urgent approval' },
      { id: 2, title: 'routine review' },
    ];
    const out = applyFilter(named, { field: 'title', op: 'contains', value: 'urgent' });
    expect(out.map((r) => r.id)).toEqual([1]);
  });

  it('combines AND clauses', () => {
    const filter: StructuredFilter = {
      field: 'status',
      op: 'eq',
      value: 'pending',
      and: [{ field: 'priority', op: 'gte', value: 3 }],
    };
    const out = applyFilter(items, filter);
    expect(out.map((r) => r.id)).toEqual([1]);
  });

  it('combines OR clauses', () => {
    const filter: StructuredFilter = {
      field: 'status',
      op: 'eq',
      value: 'done',
      or: [{ field: 'priority', op: 'gte', value: 3 }],
    };
    const out = applyFilter(items, filter);
    expect(out.map((r) => r.id)).toEqual([1, 3]);
  });
});

describe('applyFilter (string)', () => {
  const items = [
    { id: 1, status: 'pending', priority: 3 },
    { id: 2, status: 'done', priority: 5 },
  ];

  it('parses a simple equality string', () => {
    const out = applyFilter(items, "status = 'pending'");
    expect(out.map((r) => r.id)).toEqual([1]);
  });

  it('parses a CEL-style `==` string', () => {
    const out = applyFilter(items, "status == 'pending'");
    expect(out.map((r) => r.id)).toEqual([1]);
  });

  it('parses an AND chain', () => {
    const out = applyFilter(items, "status = 'pending' AND priority >= 3");
    expect(out.map((r) => r.id)).toEqual([1]);
  });

  it('returns all items when the string is unparseable', () => {
    const out = applyFilter(items, 'this is not a filter expression');
    expect(out.length).toBe(items.length);
  });

  it('returns all items when the string is empty', () => {
    expect(applyFilter(items, '').length).toBe(items.length);
  });
});

describe('round-trip: format then re-parse via applyFilter', () => {
  const items = [
    { id: 1, status: 'pending', priority: 3 },
    { id: 2, status: 'done', priority: 1 },
    { id: 3, status: 'pending', priority: 5 },
  ];

  it('eq round-trips', () => {
    const filter: StructuredFilter = { field: 'status', op: 'eq', value: 'pending' };
    const formatted = formatFilterAsString(filter);
    expect(applyFilter(items, formatted).map((r) => r.id)).toEqual(
      applyFilter(items, filter).map((r) => r.id),
    );
  });

  it('AND round-trips', () => {
    const filter: StructuredFilter = {
      field: 'status',
      op: 'eq',
      value: 'pending',
      and: [{ field: 'priority', op: 'gte', value: 3 }],
    };
    const formatted = formatFilterAsString(filter);
    expect(applyFilter(items, formatted).map((r) => r.id)).toEqual(
      applyFilter(items, filter).map((r) => r.id),
    );
  });
});
