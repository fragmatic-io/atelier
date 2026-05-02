// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for `atelier-schemas validate-data --strict`.
 *
 * The strict mode is the CI gate: any capability with a non-empty
 * `_review.needs` array must fail validation. Hand-authored capabilities
 * (no `_review` envelope) must continue to pass.
 *
 * We invoke the CLI as a subprocess via `tsx` so the test exercises the real
 * exit-code contract that `pnpm validate:data --strict` depends on.
 */

import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const CLI_PATH = resolve(__dirname, '../../src/cli/index.ts');

function runCli(args: string[]): { code: number; stdout: string; stderr: string } {
  const result = spawnSync('node', ['--import=tsx/esm', CLI_PATH, ...args], {
    encoding: 'utf8',
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  });
  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

interface CapabilityFixture {
  id: string;
  kind: 'action' | 'data';
  version: string;
  input: Record<string, string>;
  output: Record<string, string>;
  side_effects: string[];
  permissions: string[];
  confirmation: 'none' | 'inline' | 'modal' | 'verbal_required';
  rate_limit?: string;
  reversible: boolean;
  _review?: {
    needs: string[];
    imported_from: string;
    imported_at: string;
    importer_version: string;
  };
}

function baseCapability(id: string): CapabilityFixture {
  return {
    id,
    kind: 'action',
    version: '1.0.0',
    input: { x: 'string' },
    output: { y: 'string' },
    side_effects: ['mutates:x'],
    permissions: ['x:write'],
    confirmation: 'inline',
    rate_limit: '100/min/user',
    reversible: false,
  };
}

describe('atelier-schemas validate-data --strict', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'atelier-schemas-strict-'));
    await mkdir(join(root, 'capabilities'), { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('passes a hand-authored capability with no _review field', () => {
    const cap = baseCapability('hand.authored');
    return writeFile(
      join(root, 'capabilities', 'hand.authored.json'),
      `${JSON.stringify(cap, null, 2)}\n`,
      'utf8',
    ).then(() => {
      const r = runCli(['validate-data', '--root', root, '--strict']);
      expect(r.code, `stderr: ${r.stderr}`).toBe(0);
      expect(r.stdout).toMatch(/0 failure/);
    });
  });

  it('passes an imported capability whose _review.needs is empty', async () => {
    const cap: CapabilityFixture = {
      ...baseCapability('cleared.draft'),
      _review: {
        needs: [],
        imported_from: 'openapi:/tmp/x.json',
        imported_at: '2026-04-30T00:00:00.000Z',
        importer_version: '0.1.0',
      },
    };
    await writeFile(
      join(root, 'capabilities', 'cleared.json'),
      `${JSON.stringify(cap, null, 2)}\n`,
      'utf8',
    );
    const r = runCli(['validate-data', '--root', root, '--strict']);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });

  it('fails an imported capability whose _review.needs has items, listing them', async () => {
    const cap: CapabilityFixture = {
      ...baseCapability('draft.unreviewed'),
      _review: {
        needs: ['side_effects', 'permissions', 'pii:input.email'],
        imported_from: 'openapi:/tmp/x.json',
        imported_at: '2026-04-30T00:00:00.000Z',
        importer_version: '0.1.0',
      },
    };
    await writeFile(
      join(root, 'capabilities', 'draft.json'),
      `${JSON.stringify(cap, null, 2)}\n`,
      'utf8',
    );
    const r = runCli(['validate-data', '--root', root, '--strict']);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/3 review item\(s\) outstanding/);
    expect(r.stderr).toMatch(/side_effects/);
    expect(r.stderr).toMatch(/permissions/);
    expect(r.stderr).toMatch(/pii:input\.email/);
  });

  it('without --strict, the same draft capability passes (permissive mode)', async () => {
    const cap: CapabilityFixture = {
      ...baseCapability('draft.permissive'),
      _review: {
        needs: ['side_effects'],
        imported_from: 'openapi:/tmp/x.json',
        imported_at: '2026-04-30T00:00:00.000Z',
        importer_version: '0.1.0',
      },
    };
    await writeFile(
      join(root, 'capabilities', 'draft-permissive.json'),
      `${JSON.stringify(cap, null, 2)}\n`,
      'utf8',
    );
    const r = runCli(['validate-data', '--root', root]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });
});
