// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Tests for `cir inspect`. Covers file-path mode, server mode (mocked fetch),
 * --json round-trip, --no-color stripping, and schema-invalid input.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  inspectCommand,
  looksLikeManifestId,
  renderManifest,
  runInspect,
  stripAnsi,
} from '../src/commands/inspect.js';
import type { Manifest } from '@cir/schemas';

function fixtureManifest(): Manifest {
  return {
    manifest_id: 'm_a7b3c9d1',
    user_id: 'demo-user',
    app_id: 'cir.demo',
    compiled_from: {
      capability_version: '1.0.0',
      skill_versions: { 'github-issue-triage': '1.4.0' },
      component_catalog_version: '1.0.0',
      intent_profile_version: 1,
      compiler_model: 'gemini-2.5-pro',
      compiled_at: '2026-04-30T12:34:56Z',
    },
    ttl: null,
    invalidates_on: ['capability_schema_change:>=2.2.0'],
    routes: [
      {
        path: '/today',
        title: 'Today',
        layout: {
          component: 'Stack',
          children: [
            { component: 'NavBar' },
            {
              component: 'List',
              data: { source: 'github.repo.list', filter: 'stars > 0' },
            },
          ],
        },
      },
    ],
    policies_satisfied: [
      'data_access_within_grant',
      'confirmation_required_for_destructive',
      'reversibility_surfaced',
    ],
  };
}

describe('looksLikeManifestId', () => {
  it('matches m_<token> shape', () => {
    expect(looksLikeManifestId('m_a7b3c9d1')).toBe(true);
    expect(looksLikeManifestId('m_demo_today')).toBe(true);
  });
  it('rejects file paths', () => {
    expect(looksLikeManifestId('./fixtures/manifest.json')).toBe(false);
    expect(looksLikeManifestId('/abs/path/manifest.json')).toBe(false);
    expect(looksLikeManifestId('manifest.json')).toBe(false);
  });
});

describe('renderManifest', () => {
  it('uses box-drawing characters and lists key sections', () => {
    const out = renderManifest(fixtureManifest(), true);
    expect(out).toContain('manifest m_a7b3c9d1');
    expect(out).toContain('app: cir.demo');
    expect(out).toContain('compiled_from');
    expect(out).toContain('compiler_model: gemini-2.5-pro');
    expect(out).toContain('routes (1)');
    expect(out).toContain('/today');
    expect(out).toContain('└─ Stack');
    expect(out).toContain('├─ NavBar');
    expect(out).toContain('└─ List');
    expect(out).toContain('data: github.repo.list');
    expect(out).toContain('filter: stars > 0');
    expect(out).toContain('reversibility_surfaced');
    expect(out).toContain('ttl: null');
  });

  it('emits ANSI escapes when noColor is false', () => {
    const out = renderManifest(fixtureManifest(), false);
    const ESC = String.fromCharCode(27);
    expect(out.includes(ESC)).toBe(true);
    // And stripping yields the noColor variant text.
    expect(stripAnsi(out)).toContain('manifest m_a7b3c9d1');
  });

  it('omits ANSI escapes when noColor is true', () => {
    const out = renderManifest(fixtureManifest(), true);
    const ESC = String.fromCharCode(27);
    expect(out.includes(ESC)).toBe(false);
  });
});

describe('runInspect (file-path mode)', () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'cir-inspect-'));
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('reads + renders a valid manifest file', async () => {
    const file = join(tmp, 'manifest.json');
    await writeFile(file, JSON.stringify(fixtureManifest()), 'utf8');
    const result = await runInspect({ target: file, noColor: true });
    expect(result.manifest.manifest_id).toBe('m_a7b3c9d1');
    expect(result.output).toContain('manifest m_a7b3c9d1');
    expect(result.output).toContain('└─ Stack');
  });

  it('round-trips with --json', async () => {
    const file = join(tmp, 'manifest.json');
    await writeFile(file, JSON.stringify(fixtureManifest()), 'utf8');
    const result = await runInspect({ target: file, json: true, noColor: true });
    const parsed = JSON.parse(result.output) as Manifest;
    expect(parsed.manifest_id).toBe('m_a7b3c9d1');
    expect(parsed.routes[0]?.layout?.component).toBe('Stack');
  });

  it('rejects schema-invalid input', async () => {
    const file = join(tmp, 'bad.json');
    await writeFile(file, JSON.stringify({ manifest_id: 'm_x' }), 'utf8');
    await expect(runInspect({ target: file, noColor: true })).rejects.toBeTruthy();
  });
});

describe('runInspect (server mode)', () => {
  it('builds the lookup URL from the configured server', async () => {
    const seen: string[] = [];
    const fakeFetch = ((url: string): Promise<Response> => {
      seen.push(url);
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve(JSON.stringify(fixtureManifest())),
      } as unknown as Response);
    }) as unknown as typeof fetch;

    const result = await runInspect({
      target: 'm_a7b3c9d1',
      server: 'http://localhost:9001/',
      noColor: true,
      fetchImpl: fakeFetch,
    });
    expect(seen).toEqual(['http://localhost:9001/api/cir/manifest/m_a7b3c9d1']);
    expect(result.manifest.manifest_id).toBe('m_a7b3c9d1');
  });

  it('throws on non-2xx responses', async () => {
    const fakeFetch = ((): Promise<Response> =>
      Promise.resolve({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: () => Promise.resolve(''),
      } as unknown as Response)) as unknown as typeof fetch;
    await expect(
      runInspect({
        target: 'm_a7b3c9d1',
        server: 'http://localhost:9001',
        fetchImpl: fakeFetch,
      }),
    ).rejects.toThrow(/404/);
  });
});

describe('inspectCommand', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  let tmp: string;
  beforeEach(async () => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    tmp = await mkdtemp(join(tmpdir(), 'cir-inspect-cli-'));
  });
  afterEach(async () => {
    logSpy.mockRestore();
    errSpy.mockRestore();
    await rm(tmp, { recursive: true, force: true });
  });

  it('prints the rendered manifest and returns 0', async () => {
    const file = join(tmp, 'm.json');
    await writeFile(file, JSON.stringify(fixtureManifest()), 'utf8');
    const code = await inspectCommand([file], { 'no-color': 'true' }, tmp);
    expect(code).toBe(0);
    const printed = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(printed).toContain('manifest m_a7b3c9d1');
  });

  it('prints usage and returns 1 when no positional', async () => {
    const code = await inspectCommand([], {}, tmp);
    expect(code).toBe(1);
    const errOut = errSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(errOut).toContain('usage: cir inspect');
  });

  it('returns 1 with a clear message for a bad manifest', async () => {
    const file = join(tmp, 'bad.json');
    await writeFile(file, JSON.stringify({ manifest_id: 'm_x' }), 'utf8');
    const code = await inspectCommand([file], { 'no-color': 'true' }, tmp);
    expect(code).toBe(1);
    const errOut = errSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(errOut).toContain('cir inspect:');
  });

  it('--help prints usage and returns 0', async () => {
    const code = await inspectCommand([], { help: 'true' }, tmp);
    expect(code).toBe(0);
    const printed = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(printed).toContain('usage: cir inspect');
  });
});
