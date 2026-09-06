// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
export function assert(condition, status, code, message, details) {
  if (!condition)
    throw Object.assign(new Error(message), {
      status,
      code,
      ...(details !== undefined ? { details } : {}),
    });
}
export function canonical(x) {
  return JSON.stringify(x, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, v[k]]),
        )
      : v,
  );
}
export function hash(x) {
  return createHash('sha256')
    .update(typeof x === 'string' ? x : canonical(x))
    .digest('hex');
}
export function id(prefix = 'id') {
  return prefix + '_' + randomBytes(16).toString('hex');
}
export function token() {
  return randomBytes(32).toString('base64url');
}
export function text(x, name = 'Value', { min = 1, max = 1000 } = {}) {
  assert(
    typeof x === 'string' && x.trim().length >= min && x.length <= max,
    400,
    'INVALID_TEXT',
    name + ' has an invalid length',
  );
  return x.trim();
}
export function strings(x, name = 'Values', { max = 100 } = {}) {
  assert(
    Array.isArray(x) &&
      x.length <= max &&
      x.every((v) => typeof v === 'string' && v.length > 0 && v.length <= 240),
    400,
    'INVALID_LIST',
    'Invalid ' + name,
  );
  assert(new Set(x).size === x.length, 400, 'DUPLICATE_VALUES', 'Duplicate ' + name);
  return x;
}
export function integer(x, name, min, max) {
  assert(
    Number.isSafeInteger(x) && x >= min && x <= max,
    400,
    'INVALID_INTEGER',
    'Invalid ' + name,
  );
  return x;
}
export function parseJson(x, fallback = null) {
  if (x === null || x === undefined || x === '') return fallback;
  if (typeof x === 'object') return x;
  return JSON.parse(x);
}
export function noPrototypeKeys(value, depth = 0) {
  assert(depth < 40, 400, 'DEPTH_LIMIT', 'Data nesting exceeds limit');
  if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) {
      assert(
        !['__proto__', 'prototype', 'constructor'].includes(k),
        400,
        'PROTOTYPE_KEY',
        'Unsafe object property',
      );
      noPrototypeKeys(v, depth + 1);
    }
}
export function same(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
