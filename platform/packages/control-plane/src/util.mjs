// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}
export function assert(ok, status, code, message, details) {
  if (!ok) throw new AppError(status, code, message, details);
}
export const id = (prefix = 'id') => `${prefix}_${randomBytes(16).toString('hex')}`;
export const token = () => randomBytes(32).toString('base64url');
export const hash = (value) =>
  createHash('sha256')
    .update(typeof value === 'string' ? value : canonical(value))
    .digest('hex');
export const iso = () => new Date().toISOString();
export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return (
    '{' +
    Object.keys(value)
      .sort()
      .filter((k) => value[k] !== undefined)
      .map((k) => JSON.stringify(k) + ':' + canonical(value[k]))
      .join(',') +
    '}'
  );
}
export function same(a, b) {
  const x = Buffer.from(String(a ?? '')),
    y = Buffer.from(String(b ?? ''));
  return x.length === y.length && timingSafeEqual(x, y);
}
export function object(value) {
  assert(
    value && typeof value === 'object' && !Array.isArray(value),
    400,
    'INVALID_INPUT',
    'Expected a JSON object',
  );
  return value;
}
export function text(value, name, { min = 1, max = 200, optional = false } = {}) {
  if (optional && (value === undefined || value === null)) return undefined;
  assert(
    typeof value === 'string' &&
      value.trim().length >= min &&
      value.length <= max &&
      !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value),
    400,
    'INVALID_INPUT',
    `${name} must contain ${min}–${max} characters`,
  );
  return value.trim();
}
export function choice(value, choices, name) {
  assert(
    choices.includes(value),
    400,
    'INVALID_INPUT',
    `${name} must be one of ${choices.join(', ')}`,
  );
  return value;
}
export function bool(value, fallback = false) {
  if (value === undefined) return fallback;
  assert(typeof value === 'boolean', 400, 'INVALID_INPUT', 'Expected a boolean');
  return value;
}
export function integer(value, name, min = 0, max = 1e6) {
  assert(
    Number.isSafeInteger(value) && value >= min && value <= max,
    400,
    'INVALID_INPUT',
    `${name} must be an integer between ${min} and ${max}`,
  );
  return value;
}
export function strings(value, name, { max = 100 } = {}) {
  assert(
    Array.isArray(value) && value.length <= max,
    400,
    'INVALID_INPUT',
    `${name} must be a list of at most ${max} strings`,
  );
  return [...new Set(value.map((v) => text(v, name, { max: 160 })))];
}
export function email(value) {
  const e = text(value, 'Email', { max: 254 }).toLowerCase();
  assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e), 400, 'INVALID_EMAIL', 'Enter a valid email address');
  return e;
}
export function parseJson(value, fallback = null) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}
export function safeError(err) {
  if (err instanceof AppError)
    return {
      code: err.code,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    };
  return {
    code: 'INTERNAL_ERROR',
    message: 'The operation failed. Use the request ID to locate the server log.',
  };
}
export function safePath(path) {
  assert(
    typeof path === 'string' &&
      path.length < 300 &&
      !path.includes('\\') &&
      !path.startsWith('/') &&
      !path.includes('\0'),
    400,
    'UNSAFE_PATH',
    'Unsafe source path',
  );
  const parts = path.split('/');
  assert(
    parts.every((p) => p && p !== '.' && p !== '..' && !p.includes(':')),
    400,
    'UNSAFE_PATH',
    'Unsafe source path',
  );
  return path;
}
export function sanitizeMetadata(input, depth = 0) {
  if (depth > 8) return '[depth limit]';
  if (input === null || typeof input === 'boolean' || typeof input === 'number') return input;
  if (typeof input === 'string') return input.slice(0, 2000);
  if (Array.isArray(input)) return input.slice(0, 100).map((v) => sanitizeMetadata(v, depth + 1));
  if (input && typeof input === 'object')
    return Object.fromEntries(
      Object.entries(input)
        .filter(
          ([k]) =>
            !/(password|secret|token|authorization|cookie|email|phone|rawPrompt|payload)/i.test(k),
        )
        .slice(0, 80)
        .map(([k, v]) => [k, sanitizeMetadata(v, depth + 1)]),
    );
  return null;
}
export const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new Error('Aborted'));
    const done = () => {
      signal?.removeEventListener('abort', abort);
      resolve();
    };
    const t = setTimeout(done, ms);
    const abort = () => {
      clearTimeout(t);
      reject(signal.reason ?? new Error('Aborted'));
    };
    signal?.addEventListener('abort', abort, { once: true });
  });
export function noPrototypeKeys(value, depth = 0) {
  assert(depth <= 40, 400, 'JSON_TOO_DEEP', 'JSON nesting exceeds 40 levels');
  if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) {
      assert(
        !['__proto__', 'prototype', 'constructor'].includes(k),
        400,
        'UNSAFE_KEY',
        'Prototype-related keys are not accepted',
      );
      noPrototypeKeys(v, depth + 1);
    }
  return value;
}
