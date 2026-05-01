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
import { importOpenApi } from '../src/commands/import-openapi.js';

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

  // ---------------------------------------------------------------------------
  // Wave 4 P-Imp-4: _review envelope + PII detection + .review.md sidecars +
  // --strict gate. The importer now writes every capability as a draft.
  // ---------------------------------------------------------------------------

  it('imported capability includes a _review envelope with the 5 baseline needs', async () => {
    const specPath = await writeSpec(workDir, petstoreFixture());
    await importOpenApi([specPath, '--out', outDir]);
    const cap = await readCapability(join(outDir, 'pets', 'create.json'));
    expect(cap._review).toBeDefined();
    const review = cap._review;
    if (!review) throw new Error('expected _review');
    // The 5 baseline entries must all be present (PII matches may add more).
    for (const needed of [
      'side_effects',
      'permissions',
      'confirmation',
      'reversible',
      'rate_limit',
    ]) {
      expect(review.needs, `missing baseline need: ${needed}`).toContain(needed);
    }
    // The envelope metadata is fully populated.
    expect(review.imported_from).toMatch(/^openapi:/);
    expect(review.imported_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(review.importer_version.length).toBeGreaterThan(0);
  });

  it('detects PII property names and adds pii:input.* entries to _review.needs', async () => {
    // POST /users with email, ssn, password should yield three PII needs.
    const piiSpec = {
      openapi: '3.0.4',
      info: { title: 'pii', version: '1.0.0' },
      components: {
        schemas: {
          User: {
            type: 'object',
            properties: {
              email: { type: 'string' },
              ssn: { type: 'string' },
              password: { type: 'string' },
              item_count: { type: 'integer' },
            },
          },
        },
      },
      paths: {
        '/users': {
          post: {
            operationId: 'createUser',
            requestBody: {
              required: true,
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/User' } },
              },
            },
            responses: {
              '201': {
                description: 'created',
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/User' } },
                },
              },
            },
            security: [{ basic: ['users:write'] }],
          },
        },
      },
    };
    const specPath = await writeSpec(workDir, piiSpec, 'pii.json');
    await importOpenApi([specPath, '--out', outDir]);
    const cap = await readCapability(join(outDir, 'users', 'create.json'));
    expect(cap._review?.needs).toEqual(
      expect.arrayContaining(['pii:input.email', 'pii:input.ssn', 'pii:input.password']),
    );
    // item_count must NOT match — it isn't on the wordlist.
    expect(cap._review?.needs.some((n) => n.includes('item_count'))).toBe(false);
  });

  it('PII detector ignores non-PII property names like mail_template / total_amount', async () => {
    const benignSpec = {
      openapi: '3.0.4',
      info: { title: 'benign', version: '1.0.0' },
      paths: {
        '/notifications': {
          post: {
            operationId: 'sendNotification',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      mail_template: { type: 'string' },
                      item_count: { type: 'integer' },
                      total_amount: { type: 'number' },
                    },
                  },
                },
              },
            },
            responses: { '202': { description: 'queued' } },
            security: [{ basic: ['notify:send'] }],
          },
        },
      },
    };
    const specPath = await writeSpec(workDir, benignSpec, 'benign.json');
    await importOpenApi([specPath, '--out', outDir]);
    // operationId `sendNotification` is split to tokens ['send','notification'];
    // `send` is not in the verb set, so the id stays in declaration order
    // -> 'send.notification', and the file path is <resource>/<last-segment>.json
    // = notifications/notification.json.
    const cap = await readCapability(join(outDir, 'notifications', 'notification.json'));
    // No `pii:` entries — only the 5 baseline.
    const piiNeeds = cap._review?.needs.filter((n) => n.startsWith('pii:')) ?? [];
    expect(piiNeeds).toEqual([]);
  });

  it('writes a .review.md sidecar next to every emitted JSON', async () => {
    const specPath = await writeSpec(workDir, petstoreFixture());
    await importOpenApi([specPath, '--out', outDir]);
    for (const stem of ['pets/list', 'pets/create', 'pets/delete']) {
      const md = join(outDir, `${stem}.review.md`);
      expect(existsSync(md), `missing sidecar ${md}`).toBe(true);
      const content = await readFile(md, 'utf8');
      expect(content).toMatch(/Source:.*openapi:/);
      expect(content).toMatch(/## Reviewer checklist/);
      expect(content).toMatch(/- \[ \] side_effects/);
      expect(content).toMatch(/How to clear this draft/);
    }
  });

  it('--strict refuses to import when PII is detected (exit non-zero, no files written)', async () => {
    const piiSpec = {
      openapi: '3.0.4',
      info: { title: 'pii', version: '1.0.0' },
      paths: {
        '/users': {
          post: {
            operationId: 'createUser',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { email: { type: 'string' } },
                  },
                },
              },
            },
            responses: {
              '201': {
                description: 'created',
                content: {
                  'application/json': {
                    schema: { type: 'object', properties: { id: { type: 'integer' } } },
                  },
                },
              },
            },
            security: [{ basic: ['users:write'] }],
          },
        },
      },
    };
    const specPath = await writeSpec(workDir, piiSpec, 'pii-strict.json');
    await expect(importOpenApi([specPath, '--out', outDir, '--strict'])).rejects.toThrow(
      /--strict refused/,
    );
    // No files written.
    expect(existsSync(join(outDir, 'users', 'create.json'))).toBe(false);
    expect(existsSync(join(outDir, 'users', 'create.review.md'))).toBe(false);
  });

  it('--strict refuses to import when a non-GET op has no security', async () => {
    const noSecSpec = {
      openapi: '3.0.4',
      info: { title: 'nosec', version: '1.0.0' },
      paths: {
        '/widgets': {
          post: {
            operationId: 'createWidget',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { type: 'object', properties: { label: { type: 'string' } } },
                },
              },
            },
            responses: {
              '201': {
                description: 'created',
                content: {
                  'application/json': {
                    schema: { type: 'object', properties: { id: { type: 'integer' } } },
                  },
                },
              },
            },
            // NO security declared
          },
        },
      },
    };
    const specPath = await writeSpec(workDir, noSecSpec, 'nosec.json');
    await expect(importOpenApi([specPath, '--out', outDir, '--strict'])).rejects.toThrow(
      /--strict refused/,
    );
    expect(existsSync(join(outDir, 'widgets', 'create.json'))).toBe(false);
  });

  it('matchesPii export is exhaustive on the wordlist boundary', async () => {
    // Sanity sweep that camel/snake forms match and non-PII names do not.
    const { matchesPii } = await import('../src/commands/import-openapi.js');
    expect(matchesPii('email')).toBe('email');
    expect(matchesPii('userEmail')).toBe('email');
    expect(matchesPii('email_address')).toBe('email');
    expect(matchesPii('EmailAddress')).toBe('email');
    expect(matchesPii('mail_template')).toBeNull();
    expect(matchesPii('item_count')).toBeNull();
    // `first_name` and `firstName` both match — the wordlist is scanned in
    // declaration order, and `name` precedes `first_name`, so the first hit
    // is `name`. We assert the match is non-null rather than the specific
    // token so wordlist reorderings don't bounce this test.
    expect(matchesPii('first_name')).not.toBeNull();
    expect(matchesPii('firstName')).not.toBeNull();
  });
});
