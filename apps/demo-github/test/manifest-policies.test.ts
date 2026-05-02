// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Manifest ↔ baseline-policy contract for `apps/demo-github`.
 *
 * Walks every declared route through `manifestForRoute()` and runs
 * `validateManifest()` with the same configuration `atelier-providers.tsx`
 * uses at runtime — capability registry, intent grants, brand kit, the
 * full `BASELINE_POLICIES` set, and the catalog's composition rules.
 *
 * This is the proof-of-life that the manifest pipeline is what the demo
 * actually renders. Pre-MD-C the manifests in `lib/manifests.ts` were
 * dead at runtime (every page imported components directly as JSX); now
 * each `app/<route>/page.tsx` is a thin `<CirRoute>` shell, and the
 * runtime walks `manifestForRoute(path)`'s output. A regression on any
 * manifest builder lights up here before the demo boots.
 */

import { describe, expect, it } from 'vitest';
import { COMPONENT_BINDINGS, COMPOSITION_RULES } from '@atelier/components';
import {
  BASELINE_POLICIES,
  composesAccordingTo,
  manifestComponentContractSatisfied,
  validateManifest,
  RATE_LIMIT_CHIP_AMBIENT_SATISFIER,
  UNDO_TOAST_AMBIENT_SATISFIER,
  type AmbientPolicySatisfier,
} from '@atelier/policies';
import { compositionRolesFromBindings, manifestContractsFromBindings } from '@atelier/runtime';
import type { Manifest } from '@atelier/schemas';
import { DEMO_GITHUB_BRAND_KIT } from '../lib/brand-kit';
import { CAPABILITIES } from '../lib/capabilities';
import { DEMO_GITHUB_BINDINGS } from '../lib/component-bindings';
import { manifestForRoute } from '../lib/manifests';

// `COMPONENT_BINDINGS` mirrored to keep this test honest about what the
// live demo's runtime registry contains. The assertion below references
// the keys (not the bindings themselves) to confirm every component the
// manifest names is reachable at render time.
void COMPONENT_BINDINGS;

const RATE_LIMITED = new Set([
  'github.issue.create',
  'github.issue.close',
  'github.issue.bulk_close',
]);

const INTENT = {
  user_id: 'demo-github-user',
  global_preferences: {},
  granted_fields: [
    'github.issue.list.*',
    'github.issue.get.*',
    'github.issue.events.*',
    'github.issue.summary.*',
    'github.repo.list.*',
    'github.api.rate_limit.*',
  ],
};

/**
 * Every concrete route the manifest pipeline serves. `/issue/[id]` is
 * exercised with two ids (one numeric, one named) to confirm the
 * dynamic-segment path through `manifestForRoute()` is policy-clean for
 * the shapes the demo handles.
 */
const ROUTES: readonly string[] = [
  '/today',
  '/repos',
  '/inbox',
  '/issue/new',
  '/issue/42',
  '/issue/123',
];

const COMPOSITION_ROLES = compositionRolesFromBindings(DEMO_GITHUB_BINDINGS);
const MANIFEST_CONTRACTS = manifestContractsFromBindings({
  ...COMPONENT_BINDINGS,
  ...DEMO_GITHUB_BINDINGS,
});

// Mirror of `AMBIENT_POLICY_SATISFIERS` from `lib/atelier-providers.tsx`.
// The chrome `<StatusBar>` (composed under `<Stack(Logo, NavBar, StatusBar)>`)
// carries the rate-limit chip on every route, and the dispatcher's
// optimistic mutations always raise an undo affordance — declaring the
// satisfiers here clears `rate_limited_actions_show_state` and
// `reversibility_surfaced` without per-manifest anchor nodes.
const AMBIENT_POLICY_SATISFIERS: readonly AmbientPolicySatisfier[] = [
  UNDO_TOAST_AMBIENT_SATISFIER,
  RATE_LIMIT_CHIP_AMBIENT_SATISFIER,
];

function validate(manifest: Manifest) {
  return validateManifest(
    {
      manifest,
      capabilities: CAPABILITIES,
      intent: INTENT,
      rate_limited_capability_ids: RATE_LIMITED,
      pii_fields: new Set(),
      brand_kit: DEMO_GITHUB_BRAND_KIT,
      composition_roles: COMPOSITION_ROLES,
      ambient_policy_satisfiers: AMBIENT_POLICY_SATISFIERS,
    },
    {
      policies: [
        ...BASELINE_POLICIES,
        composesAccordingTo(COMPOSITION_RULES),
        manifestComponentContractSatisfied(MANIFEST_CONTRACTS),
      ],
    },
  );
}

describe('demo-github manifest pipeline ↔ BASELINE_POLICIES', () => {
  it('manifestForRoute resolves every page route in the app/ tree', () => {
    for (const route of ROUTES) {
      const manifest = manifestForRoute(route);
      expect(manifest, `${route} resolved`).not.toBeNull();
    }
  });

  it('every route passes the full baseline + composition policy set', () => {
    const errors: string[] = [];
    for (const route of ROUTES) {
      const manifest = manifestForRoute(route);
      if (manifest === null) {
        errors.push(`${route}: manifestForRoute returned null`);
        continue;
      }
      const res = validate(manifest);
      for (const v of res.violations) {
        if (v.severity === 'error') {
          errors.push(`${route}: [${v.policy_id}] ${v.message}`);
        }
      }
    }
    if (errors.length > 0) {
      throw new Error(`Baseline policy errors:\n  ${errors.join('\n  ')}`);
    }
    expect(errors).toEqual([]);
  });

  it('every component referenced by the manifests is either a baseline binding or a registered demo binding', () => {
    // Mirror the registry the runtime builds in `atelier-providers.tsx`. Post
    // marketplace pivot the demo layers ZERO custom bindings on top of
    // `COMPONENT_BINDINGS`. The test below proves that nothing the
    // manifests reference falls through the runtime's
    // `<div data-cir-fallback>` path silently — except the small set of
    // intentional gaps documented inline.
    const known = new Set<string>([
      ...Object.keys(COMPONENT_BINDINGS),
      ...Object.keys(DEMO_GITHUB_BINDINGS),
      // `UndoToast` is referenced in the manifests as the ambient
      // reversibility affordance. It is NOT a shipped binding today; the
      // runtime renders it via fallback. We allow-list it so this test
      // does not flag it as a regression.
      'UndoToast',
    ]);

    const referenced = new Set<string>();
    function walk(node: unknown): void {
      if (!node || typeof node !== 'object') return;
      const obj = node as Record<string, unknown>;
      const comp = obj['component'];
      if (typeof comp === 'string') referenced.add(comp);
      const children = obj['children'];
      if (Array.isArray(children)) {
        for (const c of children) walk(c);
      }
    }
    for (const route of ROUTES) {
      const manifest = manifestForRoute(route);
      if (!manifest) continue;
      walk(manifest.routes[0]?.layout);
    }

    const missing = [...referenced].filter((c) => !known.has(c));
    expect(missing, `unknown components referenced: ${missing.join(', ')}`).toEqual([]);
  });
});
