// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { assert, bool, choice, noPrototypeKeys, object, strings, text } from './util.mjs';

const CONTEXT_TYPES = ['string', 'number', 'integer', 'boolean'];

export function sanitizeSlotContextSchema(value) {
  if (value === undefined)
    return { type: 'object', properties: {}, required: [], additionalProperties: true };
  object(value);
  noPrototypeKeys(value);
  assert(
    value.type === undefined || value.type === 'object',
    400,
    'INVALID_SLOT_CONTEXT',
    'Slot context schema must describe an object',
  );
  const rawProperties = value.properties ?? {};
  object(rawProperties);
  noPrototypeKeys(rawProperties);
  const entries = Object.entries(rawProperties);
  assert(
    entries.length <= 40,
    400,
    'INVALID_SLOT_CONTEXT',
    'Slot context supports at most 40 fields',
  );
  const properties = {};
  for (const [rawName, rawSchema] of entries) {
    const name = text(rawName, 'Slot context field', { max: 80 });
    assert(
      /^[A-Za-z][A-Za-z0-9_]*$/.test(name),
      400,
      'INVALID_SLOT_CONTEXT',
      'Slot context fields use letters, numbers and underscores',
    );
    object(rawSchema);
    noPrototypeKeys(rawSchema);
    properties[name] = {
      type: choice(rawSchema.type ?? 'string', CONTEXT_TYPES, 'Slot context field type'),
    };
  }
  const required = strings(value.required ?? [], 'Required slot context fields', { max: 40 });
  assert(
    required.every((name) => Object.hasOwn(properties, name)),
    400,
    'INVALID_SLOT_CONTEXT',
    'Every required slot context field must have a property schema',
  );
  return {
    type: 'object',
    properties,
    required,
    additionalProperties: bool(value.additionalProperties, true),
  };
}
