// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Tests for the `cir import openapi` command.
 *
 * Uses an inline stripped petstore-style fixture (3 operations: GET /pets,
 * POST /pets, DELETE /pets/{id}). No network calls.
 */

import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CapabilitySchema, type Capability } from '@cir/schemas';
import { importOpenApi } from '../src/commands/import-openapi.ts';

/** Read a generated capability and parse it through `CapabilitySchema`. */
async function readCapability(path: string): Promise<Capability> {
  const raw = await readFile(path, 'utf8');
  return CapabilitySchema.parse(JSON.parse(raw));
}

// -----------------------------------------------------------------------------
// Fixtures.
// -----------------------------------------------------------------------------

interface MutableSpec {
  openapi: string;
  info: { title: string; version: string };
  components: { schemas: Record<string, unknown> };
  paths: Record<string, unknown>;
}

function petstoreFixture(): MutableSpec {
  return {
    openapi: '3.0.4',
    info: { title: 'Petstore', version: '1.2.3' },
    components: {
      schemas: {
        Pet: {
          type: 'object',
          required: ['id', 'name'],
          properties: {
            id: { type: 'integer', format: 'int64' },
            name: { type: 'string' },
            tag: { type: 'string' },
          },
        },
      },
    },
    paths: {
      '/pets': {
        get: {
          operationId: 'listPets',
          parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer' } }],
          responses: {
            '200': {
              description: 'pet list',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/Pet' },
                  },
                },
              },
            },
          },
          security: [{ petstore_auth: ['read:pets'] }],
        },
        post: {
          operationId: 'createPet',
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Pet' } },
            },
          },
          responses: {
            '201': {
              description: 'created',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/Pet' } },
              },
            },
          },
          security: [{ petstore_auth: ['write:pets'] }],
        },
      },
      '/pets/{id}': {
        delete: {
          operationId: 'deletePet',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: {
            '204': { description: 'gone' },
          },
          security: [{ petstore_auth: ['write:pets'] }],
        },
      },
    },
  };
}

async function writeSpec(dir: string, spec: unknown, name = 'spec.json'): Promise<string> {
  const p = join(dir, name);
  await writeFile(p, JSON.stringify(spec), 'utf8');
  return p;
}

// -----------------------------------------------------------------------------
// Suite.
// -----------------------------------------------------------------------------

describe('cir import openapi', () => {
  let workDir: string;
  let outDir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'cir-import-openapi-'));
    outDir = join(workDir, 'capabilities');
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errSpy.mockRestore();
    await rm(workDir, { recursive: true, force: true });
  });

  it('emits three files at the expected paths', async () => {
    const specPath = await writeSpec(workDir, petstoreFixture());
    await importOpenApi([specPath, '--out', outDir]);

    expect(existsSync(join(outDir, 'pets', 'list.json'))).toBe(true);
    expect(existsSync(join(outDir, 'pets', 'create.json'))).toBe(true);
    expect(existsSync(join(outDir, 'pets', 'delete.json'))).toBe(true);
  });

  it('emits files that validate against CapabilitySchema', async () => {
    const specPath = await writeSpec(workDir, petstoreFixture());
    await importOpenApi([specPath, '--out', outDir]);

    for (const rel of ['pets/list.json', 'pets/create.json', 'pets/delete.json']) {
      const raw = await readFile(join(outDir, rel), 'utf8');
      const parsed = CapabilitySchema.safeParse(JSON.parse(raw) as unknown);
      if (!parsed.success) {
        // surface the first issue for debuggability
        throw new Error(`${rel} failed validation: ${parsed.error.issues[0]?.message ?? '?'}`);
      }
      expect(parsed.success).toBe(true);
    }
  });

  it('GET maps to kind=data with empty side_effects', async () => {
    const specPath = await writeSpec(workDir, petstoreFixture());
    await importOpenApi([specPath, '--out', outDir]);
    const cap = await readCapability(join(outDir, 'pets', 'list.json'));
    expect(cap.kind).toBe('data');
    expect(cap.side_effects).toEqual([]);
    expect(cap.confirmation).toBe('none');
  });

  it('POST maps to kind=action with confirmation=inline (soft)', async () => {
    const specPath = await writeSpec(workDir, petstoreFixture());
    await importOpenApi([specPath, '--out', outDir]);
    const cap = await readCapability(join(outDir, 'pets', 'create.json'));
    expect(cap.kind).toBe('action');
    expect(cap.confirmation).toBe('inline');
    expect(cap.side_effects).toContain('mutates:pets');
    expect(cap.reversible).toBe(false);
  });

  it('DELETE maps to reversible=false with confirmation=modal (hard)', async () => {
    const specPath = await writeSpec(workDir, petstoreFixture());
    await importOpenApi([specPath, '--out', outDir]);
    const cap = await readCapability(join(outDir, 'pets', 'delete.json'));
    expect(cap.kind).toBe('action');
    expect(cap.confirmation).toBe('modal');
    expect(cap.reversible).toBe(false);
    expect(cap.side_effects).toContain('mutates:pets');
  });

  it('--dry-run writes nothing but prints the plan', async () => {
    const specPath = await writeSpec(workDir, petstoreFixture());
    await importOpenApi([specPath, '--out', outDir, '--dry-run']);

    expect(existsSync(outDir)).toBe(false);
    const planLines = logSpy.mock.calls.map((c) => String(c[0]));
    expect(planLines.some((l) => /^plan: 3 capabilit/.test(l))).toBe(true);
    expect(planLines.some((l) => l.includes('pets/list.json'))).toBe(true);
    expect(planLines.some((l) => l.includes('pets/create.json'))).toBe(true);
    expect(planLines.some((l) => l.includes('pets/delete.json'))).toBe(true);
  });

  it('skips existing files unless --force is passed', async () => {
    const specPath = await writeSpec(workDir, petstoreFixture());
    await importOpenApi([specPath, '--out', outDir]);

    // Tamper with an existing file so we can detect overwrite vs skip.
    const target = join(outDir, 'pets', 'create.json');
    await writeFile(target, '{"sentinel":true}\n', 'utf8');

    // Second run without --force: should warn & skip, leaving sentinel intact.
    warnSpy.mockClear();
    await importOpenApi([specPath, '--out', outDir]);
    expect((await readFile(target, 'utf8')).includes('"sentinel"')).toBe(true);
    const warnings = warnSpy.mock.calls.map((c) => String(c[0]));
    expect(warnings.some((w) => /skip:.*pets\/create\.json/.test(w))).toBe(true);

    // Third run with --force: overwrites the sentinel back to a valid capability.
    await importOpenApi([specPath, '--out', outDir, '--force']);
    const overwritten = await readCapability(target);
    expect(overwritten.id).toBeDefined();
  });

  it('rejects OpenAPI 2.0 / Swagger specs with a clear error', async () => {
    const swaggerSpec = {
      swagger: '2.0',
      info: { title: 'old', version: '1.0.0' },
      paths: {},
    };
    const specPath = await writeSpec(workDir, swaggerSpec, 'swagger.json');
    await expect(importOpenApi([specPath, '--out', outDir])).rejects.toThrow(/2\.0|Swagger/);
  });
});
