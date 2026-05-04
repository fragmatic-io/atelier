// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Unit tests for `runMarketplaceEval` against an in-memory marketplace.
 *
 * Three personas:
 *   1. `valid-a`     — clean recipe, every route validates.
 *   2. `valid-b`     — clean recipe (alphabetically second).
 *   3. `bad-policy`  — recipe with a known `empty_loading_error_handled`
 *                      violation: a `<List>` data binding without a
 *                      loading/empty state slot. The validator fires an
 *                      error-severity violation; the gate records it as
 *                      `failed`.
 *
 * Plus a snapshot test on the report shape with `generated_at` +
 * durations stripped.
 */

import { describe, expect, it } from 'vitest';

import type { Manifest, MarketplaceAddress } from '@atelier/schemas';

import { runMarketplaceEval } from '../src/runner.js';
import type {
  ApprovedPersonaList,
  BundleFetcher,
  EvalReport,
  ReferenceFixtures,
} from '../src/types.js';
import { REFERENCE_CAPABILITIES, REFERENCE_COMPONENTS } from '../src/fixtures/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FIXTURES: ReferenceFixtures = {
  capabilities: REFERENCE_CAPABILITIES,
  components: REFERENCE_COMPONENTS,
};

function addr(persona: string, version = '1.0.0'): MarketplaceAddress {
  return { scheme: 'atelier', author: 'acme', persona, version };
}

/** A fully-valid recipe — clean across baseline policies. */
function validRecipe(persona: string): Manifest {
  return {
    manifest_id: `m_${persona.replace(/-/g, '').padEnd(8, '0')}`,
    user_id: 'eval-user',
    app_id: `acme.${persona}`,
    compiled_from: {
      capability_version: '0.1.0',
      skill_versions: {},
      component_catalog_version: '0.1.0',
      intent_profile_version: 0,
      compiler_model: 'recipe-author',
      compiled_at: '2026-05-01T00:00:00Z',
    },
    ttl: null,
    invalidates_on: [],
    routes: [
      {
        path: '/',
        title: 'Home',
        layout: {
          component: 'Stack',
          props: { direction: 'vertical', gap: 'md' },
          children: [
            {
              component: 'Markdown',
              props: { content: '# Welcome' },
            },
          ],
        },
      },
    ],
    policies_satisfied: ['empty_loading_error_handled'],
  };
}

/**
 * Recipe that surfaces a destructive action (`dummyjson.cart.remove` has
 * `delete` in its side_effects) without a confirmation wrapper. The
 * baseline `confirmation_required_for_destructive` policy fires
 * error-severity, which is what the gate flags as `failed`.
 */
function badPolicyRecipe(): Manifest {
  return {
    manifest_id: 'm_badpolicy',
    user_id: 'eval-user',
    app_id: 'acme.bad-policy',
    compiled_from: {
      capability_version: '0.1.0',
      skill_versions: {},
      component_catalog_version: '0.1.0',
      intent_profile_version: 0,
      compiler_model: 'recipe-author',
      compiled_at: '2026-05-01T00:00:00Z',
    },
    ttl: null,
    invalidates_on: [],
    routes: [
      {
        path: '/inbox',
        title: 'Inbox',
        layout: {
          component: 'Stack',
          props: { direction: 'vertical', gap: 'md' },
          children: [
            {
              component: 'Button',
              // destructive action surfaced with no `confirmation: modal`
              // prop and no `<ConfirmDialog>` ancestor — policy fires.
              actions: ['dummyjson.cart.remove'],
              props: { label: 'Wipe cart' },
            },
          ],
        },
      },
    ],
    policies_satisfied: [],
  };
}

class StaticApproved implements ApprovedPersonaList {
  constructor(private readonly addresses: MarketplaceAddress[]) {}
  list() {
    return this.addresses;
  }
}

class InMemoryFetcher implements BundleFetcher {
  constructor(private readonly bundles: Map<string, unknown>) {}
  fetch(address: MarketplaceAddress): Promise<unknown> {
    const key = `${address.author}/${address.persona}@${address.version}`;
    return Promise.resolve(this.bundles.get(key) ?? null);
  }
}

function key(a: MarketplaceAddress): string {
  return `${a.author}/${a.persona}@${a.version}`;
}

// ---------------------------------------------------------------------------
// Specs
// ---------------------------------------------------------------------------

describe('runMarketplaceEval', () => {
  it('reports passed/failed/skipped correctly across a 3-persona set', async () => {
    const a1 = addr('persona-a');
    const a2 = addr('persona-b');
    const a3 = addr('persona-bad');

    const bundles = new Map<string, unknown>([
      [key(a1), validRecipe('persona-a')],
      [key(a2), validRecipe('persona-b')],
      [key(a3), badPolicyRecipe()],
    ]);

    const report = await runMarketplaceEval({
      approved: new StaticApproved([a1, a2, a3]),
      fetcher: new InMemoryFetcher(bundles),
      fixtures: FIXTURES,
      verify: null, // skip signature verify in the in-memory harness
      now: () => 0,
    });

    expect(report.summary.total).toBe(3);
    expect(report.summary.passed).toBe(2);
    expect(report.summary.failed).toBe(1);
    expect(report.summary.skipped).toBe(0);

    const failed = report.personas.find((p) => p.status === 'failed');
    expect(failed?.address).toBe('atelier://acme/persona-bad@1.0.0');
    expect(
      failed?.violations?.some((v) => v.rule === 'confirmation_required_for_destructive'),
    ).toBe(true);
    expect(failed?.violations?.[0]?.route).toBe('/inbox');
  });

  it('records a missing bundle as skipped, not failed', async () => {
    const a1 = addr('persona-a');
    const report = await runMarketplaceEval({
      approved: new StaticApproved([a1]),
      fetcher: new InMemoryFetcher(new Map()), // empty — fetch returns null
      fixtures: FIXTURES,
      verify: null,
      now: () => 0,
    });
    expect(report.summary.skipped).toBe(1);
    expect(report.summary.failed).toBe(0);
    expect(report.personas[0]?.error).toContain('404');
  });

  it('records signature verification failures as skipped with the reason', async () => {
    const a1 = addr('persona-a');
    const bundles = new Map<string, unknown>([[key(a1), validRecipe('persona-a')]]);
    const report = await runMarketplaceEval({
      approved: new StaticApproved([a1]),
      fetcher: new InMemoryFetcher(bundles),
      fixtures: FIXTURES,
      verify: () => ({ ok: false, reason: 'forced fail' }),
      now: () => 0,
    });
    expect(report.summary.skipped).toBe(1);
    expect(report.personas[0]?.error).toContain('forced fail');
  });

  it('honours `top` to bound the eval set', async () => {
    const addresses = [addr('persona-a'), addr('persona-b'), addr('persona-c'), addr('persona-d')];
    const bundles = new Map<string, unknown>(
      addresses.map((a) => [key(a), validRecipe(a.persona)] as const),
    );
    const report = await runMarketplaceEval({
      approved: new StaticApproved(addresses),
      fetcher: new InMemoryFetcher(bundles),
      fixtures: FIXTURES,
      verify: null,
      top: 2,
      now: () => 0,
    });
    // Default rank is alphabetical → first two are persona-a + persona-b.
    expect(report.summary.total).toBe(2);
    expect(report.personas.map((p) => p.address)).toEqual([
      'atelier://acme/persona-a@1.0.0',
      'atelier://acme/persona-b@1.0.0',
    ]);
  });

  it('rejects malformed payloads as skipped (not crashing the run)', async () => {
    const a1 = addr('persona-a');
    const bundles = new Map<string, unknown>([[key(a1), { not: 'a manifest' }]]);
    const report = await runMarketplaceEval({
      approved: new StaticApproved([a1]),
      fetcher: new InMemoryFetcher(bundles),
      fixtures: FIXTURES,
      verify: null,
      now: () => 0,
    });
    expect(report.summary.skipped).toBe(1);
    expect(report.personas[0]?.error).toContain('not a Manifest');
  });

  it('matches the expected wire shape (snapshot, durations stripped)', async () => {
    const a1 = addr('persona-a');
    const bundles = new Map<string, unknown>([[key(a1), validRecipe('persona-a')]]);
    const report = await runMarketplaceEval({
      approved: new StaticApproved([a1]),
      fetcher: new InMemoryFetcher(bundles),
      fixtures: FIXTURES,
      verify: null,
      now: () => 0,
    });
    const stripped = stripVolatile(report);
    expect(stripped).toMatchInlineSnapshot(`
      {
        "personas": [
          {
            "address": "atelier://acme/persona-a@1.0.0",
            "routes_compiled": 1,
            "status": "passed",
          },
        ],
        "reference_versions": {
          "compiler_version": "eval-marketplace-fallback",
        },
        "summary": {
          "failed": 0,
          "passed": 1,
          "skipped": 0,
          "total": 1,
        },
      }
    `);
  });
});

/**
 * Drop fields that move every run — `generated_at`, the per-persona
 * `duration_ms`, the summary `duration_ms`, and the SHA-256 fixture
 * hashes (those move whenever a fixture is added). What remains is the
 * stable wire shape callers depend on.
 */
function stripVolatile(report: EvalReport): unknown {
  return {
    personas: report.personas.map((p) => {
      const out: Record<string, unknown> = {
        address: p.address,
        status: p.status,
      };
      if (p.routes_compiled !== undefined) out['routes_compiled'] = p.routes_compiled;
      if (p.violations !== undefined) out['violations'] = p.violations;
      if (p.error !== undefined) out['error'] = p.error;
      return out;
    }),
    reference_versions: {
      compiler_version: report.reference_versions.compiler_version,
    },
    summary: {
      total: report.summary.total,
      passed: report.summary.passed,
      failed: report.summary.failed,
      skipped: report.summary.skipped,
    },
  };
}
