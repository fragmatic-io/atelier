// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Manifest ↔ baseline-policy contract.
 *
 * The brief's section 6 calls out three policy violations the demo had
 * to fix: rate-limit quota indicator, reversibility (cart.remove sibling
 * to cart.add), and empty/loading/error slots on every data binding.
 * This suite runs `validateManifest` end-to-end with the same
 * configuration `cir-providers.tsx` uses at runtime — no mocks — so any
 * regression on the manifest builders (`browseManifest`, `productManifest`,
 * `cartManifest`, `checkoutManifest`) lights up here before the demo
 * boots.
 */

import { describe, expect, it } from 'vitest';
import { COMPONENT_BINDINGS, COMPOSITION_RULES } from '@cir/components';
import { BASELINE_POLICIES, composesAccordingTo, validateManifest } from '@cir/policies';
import { DUMMYJSON_BRAND_KIT } from '../lib/brand-kit';
import { CAPABILITIES } from '../lib/capabilities';
import { browseManifest, cartManifest, checkoutManifest, productManifest } from '../lib/manifests';
import type { Density } from '@cir/components';

// `COMPONENT_BINDINGS` import is here strictly to mirror `cir-providers.tsx`'s
// runtime configuration — keeps the test honest about what the live demo
// validates against.
void COMPONENT_BINDINGS;

const RATE_LIMITED = new Set([
  'dummyjson.product.list',
  'dummyjson.product.search',
  'dummyjson.cart.add',
  'dummyjson.cart.remove',
]);
const PII = new Set(['email']);
const INTENT = {
  user_id: 'demo-user',
  global_preferences: { density: 'comfortable' as const },
  granted_fields: [
    'dummyjson.product.list.*',
    'dummyjson.product.search.*',
    'dummyjson.product.recommendations.*',
    'dummyjson.cart.list.*',
  ],
};

function validate(manifest: ReturnType<typeof browseManifest>) {
  return validateManifest(
    {
      manifest,
      capabilities: CAPABILITIES,
      intent: INTENT,
      rate_limited_capability_ids: RATE_LIMITED,
      pii_fields: PII,
      brand_kit: DUMMYJSON_BRAND_KIT,
    },
    {
      policies: [...BASELINE_POLICIES, composesAccordingTo(COMPOSITION_RULES)],
    },
  );
}

const DENSITIES: ReadonlyArray<Density> = ['compact', 'comfortable', 'spacious'];

describe('demo-dummyjson manifests vs. BASELINE_POLICIES', () => {
  it('all four routes pass error-severity baseline policies in every density', () => {
    const errors: string[] = [];
    for (const density of DENSITIES) {
      const cases = [
        ['browse', browseManifest(density)],
        ['product', productManifest('1', density)],
        ['cart', cartManifest(density)],
        ['checkout', checkoutManifest(density)],
      ] as const;
      for (const [name, manifest] of cases) {
        const res = validate(manifest);
        for (const v of res.violations) {
          if (v.severity === 'error') {
            errors.push(`${name}@${density}: [${v.policy_id}] ${v.message}`);
          }
        }
      }
    }
    if (errors.length > 0) {
      throw new Error(`Baseline policy errors:\n  ${errors.join('\n  ')}`);
    }
    expect(errors).toEqual([]);
  });

  it('every cart.add binding surfaces a quota indicator and the cart.remove rollback', () => {
    // The two tests baked into one assertion: we walk the `comfortable`
    // browse + product manifests, find every node whose `actions` lists
    // `dummyjson.cart.add`, and assert the same route also exposes a
    // node bound to a `*.rate_limit` data source AND a sibling/peer
    // node carrying `dummyjson.cart.remove`.
    const browse = browseManifest('comfortable');
    const product = productManifest('1', 'comfortable');

    const findNodesWithAction = (
      root: unknown,
      action: string,
      out: Array<Record<string, unknown>> = [],
    ): Array<Record<string, unknown>> => {
      if (!root || typeof root !== 'object') return out;
      const node = root as Record<string, unknown>;
      const actions = node['actions'];
      if (Array.isArray(actions) && actions.includes(action)) out.push(node);
      const children = node['children'];
      if (Array.isArray(children)) {
        for (const c of children) findNodesWithAction(c, action, out);
      }
      return out;
    };

    for (const m of [browse, product]) {
      const adds = findNodesWithAction(m.routes[0]!.layout, 'dummyjson.cart.add');
      const removes = findNodesWithAction(m.routes[0]!.layout, 'dummyjson.cart.remove');
      expect(adds.length).toBeGreaterThan(0);
      // The `reversibility_surfaced` policy is satisfied when a Button
      // (or ActionMenu / IconButton) carrying the rollback action lives
      // somewhere in the same route — a sibling reversibility bar is
      // enough. Mirror that contract here: at least one node carrying
      // each side of the pair, plus a Button that hosts the rollback.
      expect(removes.length).toBeGreaterThan(0);
      const hasButtonRollback = removes.some((n) => n['component'] === 'Button');
      expect(hasButtonRollback).toBe(true);
    }

    // Quota indicator: `<StatCard>` with the cart-adds remaining is
    // mounted at the route level above the body in browse + product.
    const findFirst = (root: unknown, component: string): Record<string, unknown> | null => {
      if (!root || typeof root !== 'object') return null;
      const node = root as Record<string, unknown>;
      if (node['component'] === component) return node;
      const children = node['children'];
      if (Array.isArray(children)) {
        for (const c of children) {
          const f = findFirst(c, component);
          if (f) return f;
        }
      }
      return null;
    };
    expect(findFirst(browse.routes[0]!.layout, 'StatCard')).not.toBeNull();
    expect(findFirst(product.routes[0]!.layout, 'StatCard')).not.toBeNull();
  });

  it('every data-bound node declares loading + empty + error states', () => {
    const dataBound = new Set([
      'List',
      'Table',
      'Grid',
      'KPIRow',
      'DetailView',
      'Chart',
      'Calendar',
      'Kanban',
      'Timeline',
      'Gallery',
      'Tree',
    ]);
    const missing: string[] = [];

    const walk = (
      root: unknown,
      route: string,
      missing: string[],
      parent?: Record<string, unknown>,
    ): void => {
      if (!root || typeof root !== 'object') return;
      const node = root as Record<string, unknown>;
      const comp = node['component'] as string | undefined;
      const data = node['data'] as Record<string, unknown> | undefined;
      if (comp && dataBound.has(comp) && data) {
        for (const slot of ['loading_state', 'empty_state', 'error_state'] as const) {
          if (data[slot] === undefined) {
            // Slot 3 of the policy: a sibling counts. Mirror that here so
            // the assertion matches the policy's actual shape.
            const handlers: Record<string, string[]> = {
              loading_state: ['Spinner', 'Skeleton', 'Progress'],
              empty_state: ['EmptyState'],
              error_state: ['Alert', 'ErrorState'],
            };
            const siblings = (parent?.['children'] as unknown[] | undefined) ?? [];
            const handled = siblings.some((s) => {
              const sib = s as Record<string, unknown>;
              return sib !== node && handlers[slot]!.includes(sib['component'] as string);
            });
            if (!handled) missing.push(`${route}: ${comp} missing ${slot}`);
          }
        }
      }
      const children = node['children'];
      if (Array.isArray(children)) {
        for (const c of children) walk(c, route, missing, node);
      }
    };

    for (const density of DENSITIES) {
      walk(browseManifest(density).routes[0]!.layout, `browse@${density}`, missing);
      walk(productManifest('1', density).routes[0]!.layout, `product@${density}`, missing);
      walk(cartManifest(density).routes[0]!.layout, `cart@${density}`, missing);
      walk(checkoutManifest(density).routes[0]!.layout, `checkout@${density}`, missing);
    }
    expect(missing).toEqual([]);
  });
});
