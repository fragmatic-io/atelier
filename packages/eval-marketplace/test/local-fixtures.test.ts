// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for `loadLocalFixtures` + the `EvalOpts.localFixtures` path.
 *
 * Exercises the runner end-to-end against a fixture directory of recipe
 * files (3 valid + 1 malformed). Validates:
 *
 *   - synthetic `atelier://local/<file>@1.0.0` address shape on every
 *     persona slot;
 *   - `signature_verified === false` on every persona (gate didn't
 *     pretend to run V-1 verifier on unsigned local files);
 *   - the malformed recipe surfaces as `skipped` with a parse-error,
 *     not as `failed` (skipped-vs-failed bucket integrity).
 */

import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadLocalFixtures } from '../src/local-fixtures.js';
import { runMarketplaceEval } from '../src/runner.js';
import type { ReferenceFixtures } from '../src/types.js';
import { REFERENCE_CAPABILITIES, REFERENCE_COMPONENTS } from '../src/fixtures/index.js';

const FIXTURES: ReferenceFixtures = {
  capabilities: REFERENCE_CAPABILITIES,
  components: REFERENCE_COMPONENTS,
};

const RECIPES_DIR = resolve(__dirname, 'fixtures/local-recipes');

describe('loadLocalFixtures', () => {
  it('lists every *.json + *.recipe.json file in the directory', () => {
    const source = loadLocalFixtures({ directory: RECIPES_DIR });
    const names = source.entries.map((e) => e.name).sort();
    // 3 valid + 1 malformed = 4 entries. The `.recipe.json` extension
    // also matches the long form.
    expect(names).toEqual(['dashboard-grid', 'inbox-triage', 'malformed', 'welcome-shopper']);
  });

  it('synthesises atelier://local/<file>@1.0.0 addresses', () => {
    const source = loadLocalFixtures({ directory: RECIPES_DIR });
    for (const entry of source.entries) {
      expect(entry.address.scheme).toBe('atelier');
      expect(entry.address.author).toBe('local');
      expect(entry.address.version).toBe('1.0.0');
      expect(entry.address.persona).toBe(entry.name);
    }
  });

  it('throws a descriptive error when the directory does not exist', () => {
    expect(() => loadLocalFixtures({ directory: '/nope/does/not/exist' })).toThrow(
      /local-fixtures/,
    );
  });
});

describe('runMarketplaceEval with localFixtures', () => {
  it('runs every recipe through the gate and records signature_verified=false', async () => {
    const source = loadLocalFixtures({ directory: RECIPES_DIR });
    const report = await runMarketplaceEval({
      approved: source.approved,
      fetcher: source.fetcher,
      fixtures: FIXTURES,
      localFixtures: { directory: RECIPES_DIR },
      now: () => 0,
    });

    expect(report.summary.total).toBe(4);
    // Every persona — passed, failed, OR skipped — gets the explicit
    // `signature_verified: false` stamp. The runner can't pretend to
    // have run the V-1 verifier on files that aren't bundled.
    for (const persona of report.personas) {
      expect(persona.signature_verified).toBe(false);
    }
  });

  it('uses the synthetic atelier://local/<file>@1.0.0 address shape on personas[].address', async () => {
    const source = loadLocalFixtures({ directory: RECIPES_DIR });
    const report = await runMarketplaceEval({
      approved: source.approved,
      fetcher: source.fetcher,
      fixtures: FIXTURES,
      localFixtures: { directory: RECIPES_DIR },
      now: () => 0,
    });

    const addresses = report.personas.map((p) => p.address).sort();
    expect(addresses).toEqual([
      'atelier://local/dashboard-grid@1.0.0',
      'atelier://local/inbox-triage@1.0.0',
      'atelier://local/malformed@1.0.0',
      'atelier://local/welcome-shopper@1.0.0',
    ]);
  });

  it('puts malformed recipes in the skipped bucket, not failed', async () => {
    const source = loadLocalFixtures({ directory: RECIPES_DIR });
    const report = await runMarketplaceEval({
      approved: source.approved,
      fetcher: source.fetcher,
      fixtures: FIXTURES,
      localFixtures: { directory: RECIPES_DIR },
      now: () => 0,
    });

    // The 3 valid recipes pass; the 1 malformed file is skipped.
    expect(report.summary.passed).toBe(3);
    expect(report.summary.failed).toBe(0);
    expect(report.summary.skipped).toBe(1);

    const skipped = report.personas.find((p) => p.status === 'skipped');
    expect(skipped?.address).toBe('atelier://local/malformed@1.0.0');
    // Must record a parse-shaped error so the operator can tell "the
    // file didn't compile" from "the persona compiled into a broken
    // manifest". Our malformed.json is valid JSON but doesn't satisfy
    // ManifestSchema; the runner records that as "not a Manifest".
    expect(skipped?.error).toContain('not a Manifest');
  });

  it('forces signature_verified=false even when caller passes a verifier', async () => {
    // Caller-supplied verifier is a no-op success. Local-fixtures mode
    // overrides this — the verify step is forcibly skipped because the
    // recipes are not bundled / not signed.
    const source = loadLocalFixtures({ directory: RECIPES_DIR });
    let verifyCalled = false;
    const report = await runMarketplaceEval({
      approved: source.approved,
      fetcher: source.fetcher,
      fixtures: FIXTURES,
      localFixtures: { directory: RECIPES_DIR },
      verify: () => {
        verifyCalled = true;
        return { ok: true };
      },
      now: () => 0,
    });
    expect(verifyCalled).toBe(false);
    for (const persona of report.personas) {
      expect(persona.signature_verified).toBe(false);
    }
  });

  it('does NOT stamp signature_verified on the vault-fetch path (back-compat)', async () => {
    // No `localFixtures` set — runner stays in vault-shape behaviour,
    // and `signature_verified` is left undefined for back-compat with
    // pre-existing report consumers.
    const source = loadLocalFixtures({ directory: RECIPES_DIR });
    const report = await runMarketplaceEval({
      approved: source.approved,
      fetcher: source.fetcher,
      fixtures: FIXTURES,
      verify: null,
      now: () => 0,
    });
    for (const persona of report.personas) {
      expect(persona.signature_verified).toBeUndefined();
    }
  });
});
