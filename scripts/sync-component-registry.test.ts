// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Tests for `scripts/sync-component-registry.ts`.
 *
 * Two tests exercise the build functions in-process (no subprocess), and a
 * third spawns the actual script under `--check` after temporarily moving
 * the on-disk artifact, asserting that the gate fails for missing /
 * tampered composition rules. The full script is also exercised end-to-end
 * by the repo-level `pnpm components:check` command in CI; this test pins
 * the contract close to the source.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { ComponentRegistrySchema, CompositionRulesSchema } from '@cir/schemas';

// Import without an extension — tsx resolves the `.ts` source at runtime,
// and the root tsconfig (`./tsconfig.json`) picks up scripts/** without
// `allowImportingTsExtensions`.
import { buildCompositionRules, buildRegistry } from './sync-component-registry.js';

const REPO = resolve(import.meta.dirname, '..');
const SCRIPT = join(REPO, 'scripts/sync-component-registry.ts');
const TSCONFIG = join(REPO, 'packages/components/tsconfig.json');
const RULES_PATH = join(REPO, 'components/composition-rules.json');
const RULES_BACKUP = `${RULES_PATH}.test-backup`;

interface RunResult {
  status: number;
  stderr: string;
}

function runScript(args: readonly string[]): RunResult {
  const result = spawnSync('tsx', ['--tsconfig', TSCONFIG, SCRIPT, ...args], {
    cwd: REPO,
    encoding: 'utf8',
  });
  return {
    status: result.status ?? -1,
    stderr: result.stderr ?? '',
  };
}

afterEach(() => {
  // Restore the canonical rules file if a test moved or tampered with it.
  // `RULES_BACKUP` carries the canonical bytes; we copy them back over
  // whatever the test left in place, then remove the backup.
  if (existsSync(RULES_BACKUP)) {
    writeFileSync(RULES_PATH, readFileSync(RULES_BACKUP, 'utf8'), 'utf8');
    unlinkSync(RULES_BACKUP);
  }
});

describe('sync-component-registry: builders', () => {
  it('buildRegistry produces a registry that parses through ComponentRegistrySchema', () => {
    const reg = buildRegistry('0.1.0');
    expect(() => ComponentRegistrySchema.parse(reg)).not.toThrow();
    // List has metadata: a known recipe-binding plus example paths.
    const list = reg['List'];
    expect(list).toBeDefined();
    expect(list?.examples.length).toBeGreaterThan(0);
    expect(list?.data_sources).toContain('github.repo.list');
  });

  it('buildCompositionRules produces a map that parses through CompositionRulesSchema', () => {
    const rules = buildCompositionRules();
    expect(() => CompositionRulesSchema.parse(rules)).not.toThrow();
    // The 'leaf' sentinel must round-trip — that's the bug Wave 4 P-Reg-1
    // fixes in `packages/schemas/src/component.ts`.
    expect(rules['Markdown']?.can_contain).toBe('leaf');
    expect(rules['Stack']?.can_contain).toBe('*');
  });
});

describe('sync-component-registry: --check gate', () => {
  it('fails when components/composition-rules.json is missing', () => {
    // Move the rules file aside (the rename also creates the backup the
    // afterEach hook restores from).
    expect(existsSync(RULES_PATH)).toBe(true);
    renameSync(RULES_PATH, RULES_BACKUP);
    const out = runScript(['--check']);
    expect(out.status).toBe(1);
    expect(out.stderr).toMatch(/composition-rules\.json|missing/i);
    // Materialize the rules file before afterEach (which copies, not
    // renames). Read from the backup so the restoration is a no-op.
    writeFileSync(RULES_PATH, readFileSync(RULES_BACKUP, 'utf8'), 'utf8');
  });

  it('fails when components/composition-rules.json has drifted', () => {
    expect(existsSync(RULES_PATH)).toBe(true);
    // Back up the canonical rules, then write a stale version.
    const original = readFileSync(RULES_PATH, 'utf8');
    writeFileSync(RULES_BACKUP, original, 'utf8');
    writeFileSync(RULES_PATH, '{"Stack":{"can_contain":"leaf"}}\n', 'utf8');
    const out = runScript(['--check']);
    expect(out.status).toBe(1);
    expect(out.stderr).toMatch(/drift|stale|composition-rules/i);
  });
});
