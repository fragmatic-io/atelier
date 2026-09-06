// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { assert, noPrototypeKeys, canonical } from './common.mjs';
const valid = (k) =>
  typeof k === 'string' &&
  /^[A-Za-z_][\w.-]{0,100}$/.test(k) &&
  !k.split('.').some((x) => ['constructor', 'prototype', '__proto__'].includes(x));
export function readPath(value, path = '') {
  assert(path === '' || valid(path), 400, 'DATA_PATH', 'Invalid data path');
  return path === ''
    ? value
    : path
        .split('.')
        .reduce(
          (v, k) => (v && typeof v === 'object' && Object.hasOwn(v, k) ? v[k] : undefined),
          value,
        );
}
export function calculate(
  plan,
  datasets,
  { maxRows = 10000, maxSteps = 20, maxCells = 200000 } = {},
) {
  noPrototypeKeys(plan);
  assert(
    plan &&
      Object.hasOwn(datasets, plan.source) &&
      Array.isArray(plan.steps) &&
      plan.steps.length <= maxSteps,
    400,
    'CALC_PLAN',
    'Invalid or unauthorized calculation',
  );
  const source = readPath(datasets[plan.source], plan.path ?? '');
  assert(
    Array.isArray(source) && source.length <= maxRows,
    413,
    'CALC_ROWS',
    'Source must be a bounded array',
  );
  let rows = structuredClone(source);
  for (const s of plan.steps) {
    if (s.op === 'filter') {
      assert(
        ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'in'].includes(s.operator),
        400,
        'CALC_FILTER',
        'Unsupported filter',
      );
      rows = rows.filter((r) => {
        const a = readPath(r, s.field),
          b = s.value;
        if (s.operator === 'eq') return a === b;
        if (s.operator === 'ne') return a !== b;
        if (s.operator === 'contains')
          return typeof a === 'string' && typeof b === 'string' && a.includes(b);
        if (s.operator === 'in') return Array.isArray(b) && b.length <= 100 && b.includes(a);
        if (typeof a !== 'number' || typeof b !== 'number') return false;
        return s.operator === 'gt'
          ? a > b
          : s.operator === 'gte'
            ? a >= b
            : s.operator === 'lt'
              ? a < b
              : a <= b;
      });
    } else if (s.op === 'select') {
      assert(
        Array.isArray(s.fields) &&
          s.fields.length > 0 &&
          s.fields.length <= 40 &&
          s.fields.every(valid),
        400,
        'CALC_FIELDS',
        'Select explicitly named fields',
      );
      rows = rows.map((r) => Object.fromEntries(s.fields.map((k) => [k, readPath(r, k) ?? null])));
    } else if (s.op === 'sort') {
      assert(['asc', 'desc'].includes(s.direction ?? 'asc'), 400, 'CALC_SORT', 'Invalid direction');
      rows = rows
        .map((r, i) => ({ r, i }))
        .sort((a, b) => {
          const x = readPath(a.r, s.field),
            y = readPath(b.r, s.field);
          return (
            (x === y ? 0 : x == null ? 1 : y == null ? -1 : x < y ? -1 : 1) *
              (s.direction === 'desc' ? -1 : 1) || a.i - b.i
          );
        })
        .map((x) => x.r);
    } else if (s.op === 'limit') {
      assert(
        Number.isSafeInteger(s.count) && s.count >= 0 && s.count <= maxRows,
        400,
        'CALC_LIMIT',
        'Invalid row limit',
      );
      rows = rows.slice(0, s.count);
    } else if (s.op === 'group') {
      const by = s.by ?? [];
      assert(
        Array.isArray(by) &&
          by.length <= 5 &&
          by.every(valid) &&
          Array.isArray(s.metrics) &&
          s.metrics.length > 0 &&
          s.metrics.length <= 10,
        400,
        'CALC_GROUP',
        'Invalid group',
      );
      for (const m of s.metrics)
        assert(
          valid(m.as) &&
            !by.includes(m.as) &&
            ['count', 'sum', 'mean', 'min', 'max', 'median', 'distinct'].includes(m.op) &&
            (m.op === 'count' || valid(m.field)),
          400,
          'CALC_METRIC',
          'Invalid aggregate',
        );
      assert(
        new Set(s.metrics.map((x) => x.as)).size === s.metrics.length,
        400,
        'CALC_METRIC',
        'Duplicate aggregate names',
      );
      const groups = new Map();
      for (const r of rows) {
        const tuple = by.map((k) => readPath(r, k) ?? null),
          key = canonical(tuple);
        if (!groups.has(key)) groups.set(key, { tuple, rows: [] });
        groups.get(key).rows.push(r);
      }
      if (!by.length && !groups.size) groups.set('[]', { tuple: [], rows: [] });
      rows = [...groups.values()].map((g) => {
        const out = Object.fromEntries(by.map((k, i) => [k, g.tuple[i]]));
        for (const m of s.metrics) {
          const v =
            m.op === 'count'
              ? []
              : g.rows.map((r) => readPath(r, m.field)).filter((x) => x != null);
          if (m.op === 'count') out[m.as] = g.rows.length;
          else if (m.op === 'distinct') out[m.as] = new Set(v.map(canonical)).size;
          else {
            assert(
              v.every((x) => typeof x === 'number' && Number.isFinite(x)),
              400,
              'CALC_NUMBER',
              'Finite numeric values required',
            );
            const total = v.reduce((a, b) => a + b, 0);
            out[m.as] =
              m.op === 'sum'
                ? total
                : !v.length
                  ? null
                  : m.op === 'mean'
                    ? total / v.length
                    : m.op === 'min'
                      ? Math.min(...v)
                      : m.op === 'max'
                        ? Math.max(...v)
                        : (() => {
                            v.sort((a, b) => a - b);
                            const i = Math.floor(v.length / 2);
                            return v.length % 2 ? v[i] : (v[i - 1] + v[i]) / 2;
                          })();
            assert(
              out[m.as] === null || Number.isFinite(out[m.as]),
              400,
              'CALC_OVERFLOW',
              'Numeric overflow',
            );
          }
        }
        return out;
      });
    } else if (s.op === 'join') {
      assert(
        Object.hasOwn(datasets, s.source) &&
          valid(s.as) &&
          ['inner', 'left'].includes(s.kind ?? 'inner'),
        400,
        'CALC_JOIN',
        'Invalid or unauthorized join',
      );
      const right = readPath(datasets[s.source], s.path ?? '');
      assert(
        Array.isArray(right) && right.length <= maxRows,
        413,
        'CALC_ROWS',
        'Join source exceeds budget',
      );
      const index = new Map();
      for (const r of right) {
        const v = readPath(r, s.rightKey);
        if (v == null) continue;
        const k = canonical(v);
        if (!index.has(k)) index.set(k, []);
        index.get(k).push(r);
      }
      const out = [];
      for (const l of rows) {
        const v = readPath(l, s.leftKey),
          matches = v == null ? [] : (index.get(canonical(v)) ?? []);
        if (!matches.length && s.kind === 'left') out.push({ ...l, [s.as]: null });
        for (const r of matches) {
          assert(out.length < maxRows, 413, 'CALC_ROWS', 'Join expansion exceeds budget');
          out.push({ ...l, [s.as]: r });
        }
      }
      rows = out;
    } else assert(false, 400, 'CALC_OPERATOR', 'Unsupported calculation operation');
    assert(
      rows.length <= maxRows &&
        rows.length * Math.max(1, Object.keys(rows[0] ?? {}).length) <= maxCells,
      413,
      'CALC_LIMIT',
      'Calculation budget exceeded',
    );
  }
  assert(
    Buffer.byteLength(canonical(rows)) <= 1024 * 1024,
    413,
    'CALC_LIMIT',
    'Result exceeds 1 MB',
  );
  return {
    rows,
    count: rows.length,
    source: plan.source,
    precision: 'IEEE-754; use authorized decimal backend operations for settlement',
  };
}
