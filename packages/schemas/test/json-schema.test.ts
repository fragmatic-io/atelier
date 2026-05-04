// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { CapabilitySchema } from '../src/capability.js';
import { ManifestSchema } from '../src/manifest.js';
import { toJsonSchema } from '../src/json-schema.js';

describe('toJsonSchema', () => {
  it('emits a $id and $schema for the Capability schema', () => {
    const out = toJsonSchema(CapabilitySchema, { name: 'capability' });
    expect(out['$id']).toBe('https://cir.dev/schemas/capability.json');
    expect(out['$schema']).toBe('https://json-schema.org/draft/2019-09/schema');
    const properties = (out['properties'] ?? {}) as Record<string, unknown>;
    expect(out['properties']).toBeDefined();
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

  it('strips `format` keywords so AJV strict mode accepts the output', () => {
    // `z.string().datetime()` would otherwise emit `"format": "date-time"`,
    // and `z.string().email()` `"format": "email"` — both rejected by AJV
    // strict without `ajv-formats`. We never want to ship that surprise.
    const Source = z.object({
      created_at: z.string().datetime({ offset: true }),
      contact: z.string().email(),
      site: z.string().url(),
      slug: z.string().regex(/^[a-z]+$/),
    });
    const out = toJsonSchema(Source, { name: 'no-formats' });
    expect(JSON.stringify(out)).not.toContain('"format"');
  });
});
