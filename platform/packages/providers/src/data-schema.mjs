// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { validateOutput, OutputValidationError } from './schema.mjs';
/** Preserve validation constraints; only non-validation metadata is stripped.
 * Unsupported constraints fail closed and require a host-specific validator. */
export function normalizeDataSchema(schema) {
  if (typeof schema === 'boolean') return schema;
  const out = {};
  for (const [k, v] of Object.entries(schema ?? {})) {
    if (
      k.startsWith('x-') ||
      ['examples', 'example', 'deprecated', 'readOnly', 'writeOnly', 'format'].includes(k)
    )
      continue;
    if (k === 'nullable') continue;
    if (['properties', '$defs'].includes(k))
      out[k] = Object.fromEntries(Object.entries(v).map(([n, s]) => [n, normalizeDataSchema(s)]));
    else if (['items', 'additionalProperties'].includes(k) && typeof v === 'object')
      out[k] = normalizeDataSchema(v);
    else if (['oneOf', 'anyOf', 'allOf'].includes(k)) out[k] = v.map(normalizeDataSchema);
    else out[k] = v;
  }
  if (schema?.nullable && out.type) out.type = [...[].concat(out.type), 'null'];
  return out;
}
export function validateData(value, schema) {
  validateOutput(value, normalizeDataSchema(schema));
  const visit = (v, s, depth = 0) => {
    if (depth > 40) throw new OutputValidationError(['Data too deeply nested']);
    if (s?.format && typeof v === 'string') {
      let ok = true;
      if (s.format === 'date-time')
        ok = /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v));
      else if (s.format === 'date')
        ok = /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v));
      else if (s.format === 'email') ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      else if (s.format === 'uuid')
        ok = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
      else if (['uri', 'url'].includes(s.format)) {
        try {
          new URL(v);
        } catch {
          ok = false;
        }
      } else if (
        !['int32', 'int64', 'float', 'double', 'password', 'binary', 'byte'].includes(s.format)
      )
        throw new OutputValidationError([`Unsupported data format: ${s.format}`]);
      if (!ok) throw new OutputValidationError([`Invalid ${s.format} value`]);
    }
    if (Array.isArray(v)) v.forEach((x) => visit(x, s?.items, depth + 1));
    else if (v && typeof v === 'object')
      for (const [k, x] of Object.entries(v)) visit(x, s?.properties?.[k], depth + 1);
  };
  visit(value, schema);
  return value;
}
