// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
import { describe, expect, it } from 'vitest';
import { CapabilitySchema } from '../src/capability.ts';
import { ManifestSchema } from '../src/manifest.ts';
import { toJsonSchema } from '../src/json-schema.ts';

describe('toJsonSchema', () => {
  it('emits a $id and $schema for the Capability schema', () => {
    const out = toJsonSchema(CapabilitySchema, { name: 'capability' });
    expect(out['$id']).toBe('https://cir.dev/schemas/capability.json');
    expect(out['$schema']).toBe('https://json-schema.org/draft/2019-09/schema');
    const properties = out['properties'];
    expect(properties).toBeDefined();
    expect(properties['id']).toBeDefined();
    expect(properties['kind']).toBeDefined();
    expect(properties['side_effects']).toBeDefined();
  });

  it('honours an explicit idBase', () => {
    const out = toJsonSchema(CapabilitySchema, {
      name: 'capability',
      idBase: 'https://example.com/x',
    });
    expect(out['$id']).toBe('https://example.com/x/capability.json');
  });

  it('falls back to draft-07 when target is jsonSchema7', () => {
    const out = toJsonSchema(CapabilitySchema, {
      name: 'capability',
      target: 'jsonSchema7',
    });
    expect(out['$schema']).toBe('http://json-schema.org/draft-07/schema#');
  });

  it('handles recursive schemas (ManifestSchema with LayoutNode)', () => {
    const out = toJsonSchema(ManifestSchema, { name: 'manifest' });
    expect(out['$id']).toBe('https://cir.dev/schemas/manifest.json');
    expect(out['type']).toBe('object');
  });
});
