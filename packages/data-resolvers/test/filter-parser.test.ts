// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

import { describe, expect, it } from 'vitest';
import {
  astToString,
  parseFilter,
  toPredicate,
  toQueryString,
  toWhereClause,
  tryParseFilter,
} from '../src/filter-parser.js';

describe('filter-parser', () => {
  it('parses single comparison with bare identifier rhs', () => {
    const ast = parseFilter('requires_decision = true');
    expect(ast).toEqual({
      type: 'comparison',
      field: 'requires_decision',
      op: '=',
      value: true,
      rawValue: 'true',
    });
  });

  it('parses AND with logical literals on both sides (artifacts.md example)', () => {
    const ast = parseFilter('requires_decision = true AND received_after = today_start');
    expect(ast.type).toBe('logical');
    if (ast.type !== 'logical') return;
    expect(ast.op).toBe('AND');
    expect((ast.left as { field: string }).field).toBe('requires_decision');
    expect((ast.right as { field: string }).field).toBe('received_after');
  });

  it('parses OR with quoted strings and not-equal operator', () => {
    const ast = parseFilter('status != "done" OR priority = "high"');
    expect(ast.type).toBe('logical');
    if (ast.type !== 'logical') return;
    expect(ast.op).toBe('OR');
  });

  it('respects explicit parens to override AND/OR precedence', () => {
    const ast = parseFilter('(a = 1 OR b = 2) AND c = 3');
    expect(ast.type).toBe('logical');
    if (ast.type !== 'logical') return;
    expect(ast.op).toBe('AND');
    expect(ast.left.type).toBe('logical');
    expect((ast.left as { op: string }).op).toBe('OR');
  });

  it('handles all comparison operators', () => {
    expect((parseFilter('a >= 1') as { op: string }).op).toBe('>=');
    expect((parseFilter('a <= 1') as { op: string }).op).toBe('<=');
    expect((parseFilter('a > 1') as { op: string }).op).toBe('>');
    expect((parseFilter('a < 1') as { op: string }).op).toBe('<');
    expect((parseFilter('a != 1') as { op: string }).op).toBe('!=');
    expect((parseFilter('a = 1') as { op: string }).op).toBe('=');
  });

  it('parses numbers including negatives and decimals', () => {
    const ast = parseFilter('balance >= -3.5');
    if (ast.type !== 'comparison') throw new Error('expected comparison');
    expect(ast.value).toBe(-3.5);
  });

  it('coerces ISO-8601 dates into Date objects on either side', () => {
    const a = parseFilter('created_at > "2026-04-30T00:00:00Z"');
    if (a.type !== 'comparison') throw new Error('expected comparison');
    expect(a.value).toBeInstanceOf(Date);

    const b = parseFilter('created_at > 2026-04-30');
    if (b.type !== 'comparison') throw new Error('expected comparison');
    expect(b.value).toBeInstanceOf(Date);
  });

  it('passes logical literals like 7d / today_start through verbatim', () => {
    const ast = parseFilter('due_within = 7d');
    if (ast.type !== 'comparison') throw new Error('expected comparison');
    expect(ast.value).toBe('7d');
    expect(ast.rawValue).toBe('7d');
  });

  it('rejects empty input', () => {
    expect(() => parseFilter('   ')).toThrow(/empty/u);
  });

  it('rejects unterminated string literals', () => {
    expect(() => parseFilter('a = "oops')).toThrow(/unterminated/u);
  });

  it('rejects unexpected characters', () => {
    expect(() => parseFilter('a # 1')).toThrow(/unexpected character/u);
  });

  it('rejects malformed comparisons (missing operator)', () => {
    expect(() => parseFilter('a 1')).toThrow();
  });

  it('rejects trailing tokens after a complete expression', () => {
    expect(() => parseFilter('a = 1 b = 2')).toThrow();
  });

  it('handles backslash-escaped quotes inside string literals', () => {
    const ast = parseFilter('name = "O\\"Reilly"');
    if (ast.type !== 'comparison') throw new Error('expected comparison');
    expect(ast.value).toBe('O"Reilly');
  });

  it('tryParseFilter returns null on parse failure', () => {
    expect(tryParseFilter('a = ')).toBeNull();
    expect(tryParseFilter('valid = 1')).not.toBeNull();
  });

  it('astToString round-trips an AND/OR expression', () => {
    const src = '(a = 1 AND b != "two") OR c >= 3';
    const ast = parseFilter(src);
    const out = astToString(ast);
    // Re-parse the output to confirm it remains valid.
    expect(() => parseFilter(out)).not.toThrow();
  });

  it('toQueryString sets filter / sort / group_by params', () => {
    const params = toQueryString({
      filter: 'a = 1 AND b = 2',
      sort: 'created_at desc',
      group_by: 'status',
    });
    expect(params.get('filter')).toBeTruthy();
    expect(params.get('sort')).toBe('created_at desc');
    expect(params.get('group_by')).toBe('status');
  });

  it('toQueryString passes unparseable filters through verbatim', () => {
    const params = toQueryString({ filter: 'totally :: invalid ## syntax' });
    expect(params.get('filter')).toBe('totally :: invalid ## syntax');
  });

  it('toQueryString returns empty params for an empty binding', () => {
    expect(toQueryString({}).size).toBe(0);
  });

  it('toWhereClause emits SQL-shaped output with quoted strings', () => {
    const ast = parseFilter('status = "done" AND count >= 5');
    const sql = toWhereClause(ast);
    expect(sql).toContain("'done'");
    expect(sql).toContain('count >= 5');
    expect(sql).toContain(' AND ');
  });

  it('toWhereClause escapes single quotes by doubling them', () => {
    const ast = parseFilter('name = "O\'Brien"');
    expect(toWhereClause(ast)).toContain("'O''Brien'");
  });

  it('toWhereClause emits booleans as TRUE/FALSE and dates as ISO strings', () => {
    const a = toWhereClause(parseFilter('flag = true'));
    expect(a).toContain('TRUE');
    const b = toWhereClause(parseFilter('created_at > "2026-04-30T00:00:00Z"'));
    expect(b).toContain("'2026-04-30T00:00:00.000Z'");
  });

  it('toPredicate filters arrays by single comparison', () => {
    const pred = toPredicate(parseFilter('age >= 18'));
    expect([{ age: 17 }, { age: 18 }, { age: 30 }].filter(pred)).toHaveLength(2);
  });

  it('toPredicate evaluates AND short-circuits and OR fall-through', () => {
    const andPred = toPredicate(parseFilter('a = 1 AND b = 2'));
    expect(andPred({ a: 1, b: 2 })).toBe(true);
    expect(andPred({ a: 1, b: 9 })).toBe(false);
    const orPred = toPredicate(parseFilter('a = 1 OR b = 2'));
    expect(orPred({ a: 9, b: 2 })).toBe(true);
    expect(orPred({ a: 9, b: 9 })).toBe(false);
  });

  it('toPredicate compares strings lexicographically for >/<', () => {
    const pred = toPredicate(parseFilter('name > "alpha"'));
    expect(pred({ name: 'beta' })).toBe(true);
    expect(pred({ name: 'aardvark' })).toBe(false);
  });

  it('toPredicate handles Date comparisons by parsing both sides', () => {
    const pred = toPredicate(parseFilter('created_at > "2026-04-29T00:00:00Z"'));
    expect(pred({ created_at: '2026-04-30T00:00:00Z' })).toBe(true);
    expect(pred({ created_at: '2026-04-28T00:00:00Z' })).toBe(false);
    // Already-Date side.
    expect(pred({ created_at: new Date('2026-04-30T00:00:00Z') })).toBe(true);
    // Non-date string falls through false-rather-than-throw.
    expect(pred({ created_at: 'not-a-date' })).toBe(false);
  });

  it('toPredicate returns false for missing fields on objects and non-objects', () => {
    const pred = toPredicate(parseFilter('missing = "x"'));
    expect(pred({ other: 1 })).toBe(false);
    expect(pred(null)).toBe(false);
    expect(pred(42)).toBe(false);
  });

  it('toPredicate exercises every numeric comparator on numeric fields', () => {
    const records = [{ n: 1 }, { n: 2 }, { n: 3 }];
    expect(records.filter(toPredicate(parseFilter('n != 2')))).toHaveLength(2);
    expect(records.filter(toPredicate(parseFilter('n < 3')))).toHaveLength(2);
    expect(records.filter(toPredicate(parseFilter('n <= 2')))).toHaveLength(2);
    expect(records.filter(toPredicate(parseFilter('n > 1')))).toHaveLength(2);
    expect(records.filter(toPredicate(parseFilter('n >= 3')))).toHaveLength(1);
    expect(records.filter(toPredicate(parseFilter('n = 2')))).toHaveLength(1);
  });
});
