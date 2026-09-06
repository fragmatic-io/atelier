// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/** Bounded JSON-Schema validator for the explicitly documented generation-contract subset.
 * Unknown keywords fail closed; this is not advertised as a full JSON-Schema implementation.
 */
export class OutputValidationError extends Error {
  constructor(errors) {
    super('Model output does not match its generation contract');
    this.code = 'MODEL_SCHEMA_INVALID';
    this.errors = errors;
  }
}
const keywords = new Set([
  'type',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'minItems',
  'maxItems',
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'enum',
  'const',
  'anyOf',
  'oneOf',
  'allOf',
  'description',
  'title',
  'default',
  '$defs',
  '$ref',
  '$schema',
]);
function equal(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
export function checkSchema(schema, root = schema, depth = 0) {
  if (depth > 30) throw new OutputValidationError(['Schema exceeds maximum depth']);
  if (typeof schema === 'boolean') return;
  if (!schema || typeof schema !== 'object' || Array.isArray(schema))
    throw new OutputValidationError(['Schema must be an object or boolean']);
  for (const k of Object.keys(schema))
    if (!keywords.has(k))
      throw new OutputValidationError([`Unsupported generation-schema keyword: ${k}`]);
  if (schema.$ref) {
    if (!schema.$ref.startsWith('#/$defs/'))
      throw new OutputValidationError(['Only local $defs references are supported']);
    return;
  }
  if (schema.properties)
    for (const s of Object.values(schema.properties)) checkSchema(s, root, depth + 1);
  for (const k of ['anyOf', 'oneOf', 'allOf'])
    if (schema[k]) schema[k].forEach((s) => checkSchema(s, root, depth + 1));
  if (schema.items) checkSchema(schema.items, root, depth + 1);
  if (schema.additionalProperties && typeof schema.additionalProperties === 'object')
    checkSchema(schema.additionalProperties, root, depth + 1);
  if (schema.$defs) Object.values(schema.$defs).forEach((s) => checkSchema(s, root, depth + 1));
}
export function validateOutput(value, schema, { maxBytes = 2 * 1024 * 1024 } = {}) {
  checkSchema(schema);
  if (Buffer.byteLength(JSON.stringify(value) ?? '') > maxBytes)
    throw new OutputValidationError(['Output too large']);
  const errors = [];
  function walk(v, s, path, depth) {
    if (errors.length >= 20) return;
    if (depth > 40) {
      errors.push(`${path}: nesting exceeds 40`);
      return;
    }
    if (s === true) return;
    if (s === false) {
      errors.push(`${path}: forbidden`);
      return;
    }
    if (s.$ref) {
      const key = s.$ref.slice('#/$defs/'.length);
      const target = schema.$defs?.[key];
      if (!target) {
        errors.push(`${path}: unresolved reference`);
        return;
      }
      return walk(v, target, path, depth + 1);
    }
    const fail = (m) => errors.push(`${path}: ${m}`);
    if (s.const !== undefined && !equal(v, s.const)) fail('const mismatch');
    if (s.enum && !s.enum.some((x) => equal(x, v))) fail('enum mismatch');
    for (const k of ['anyOf', 'oneOf'])
      if (s[k]) {
        let passes = 0;
        for (const sub of s[k]) {
          const before = errors.length;
          walk(v, sub, path, depth + 1);
          if (errors.length === before) passes++;
          errors.length = before;
        }
        if (k === 'anyOf' ? passes === 0 : passes !== 1) fail(`${k} mismatch`);
      }
    if (s.allOf) for (const sub of s.allOf) walk(v, sub, path, depth + 1);
    const matches = (t) =>
      t === 'null'
        ? v === null
        : t === 'array'
          ? Array.isArray(v)
          : t === 'object'
            ? v !== null && typeof v === 'object' && !Array.isArray(v)
            : t === 'integer'
              ? Number.isSafeInteger(v)
              : t === 'number'
                ? typeof v === 'number' && Number.isFinite(v)
                : typeof v === t;
    if (s.type && ![].concat(s.type).some(matches)) {
      fail(`expected ${s.type}`);
      return;
    }
    if (typeof v === 'string') {
      if (s.minLength !== undefined && v.length < s.minLength) fail('too short');
      if (s.maxLength !== undefined && v.length > s.maxLength) fail('too long');
    }
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) fail('not finite');
      if (s.minimum !== undefined && v < s.minimum) fail('below minimum');
      if (s.maximum !== undefined && v > s.maximum) fail('above maximum');
    }
    if (Array.isArray(v)) {
      if (s.minItems !== undefined && v.length < s.minItems) fail('too few items');
      if (s.maxItems !== undefined && v.length > s.maxItems) fail('too many items');
      if (s.items)
        for (let i = 0; i < v.length; i++) walk(v[i], s.items, `${path}[${i}]`, depth + 1);
    } else if (v && typeof v === 'object') {
      for (const k of s.required ?? []) if (!Object.hasOwn(v, k)) fail(`missing ${k}`);
      for (const [k, x] of Object.entries(v)) {
        if (['__proto__', 'prototype', 'constructor'].includes(k)) {
          fail('unsafe key');
          continue;
        }
        if (Object.hasOwn(s.properties ?? {}, k))
          walk(x, s.properties[k], `${path}.${k}`, depth + 1);
        else if (s.additionalProperties === false) fail(`unknown property ${k}`);
        else if (s.additionalProperties && typeof s.additionalProperties === 'object')
          walk(x, s.additionalProperties, `${path}.${k}`, depth + 1);
      }
    }
  }
  walk(value, schema, '$', 0);
  if (errors.length) throw new OutputValidationError(errors);
  return value;
}
export function parseOutput(text, schema) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new OutputValidationError(['Output is not a single JSON value']);
  }
  return validateOutput(value, schema);
}
