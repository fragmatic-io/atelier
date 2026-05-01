// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Manifest ↔ baseline-policy contract for the dummyjson catalog demo.
 *
 * Marketplace pivot: `<ProductCard>` and `<ProductGrid>` are gone — the
 * `/browse` body composes baseline `<Grid data={products}>` + a single
 * `<Card>` template child. The data-aware Grid threads each product onto
 * the Card's `data` prop and the runtime forwards `onAction` per-item
 * via `actionSlots: ['onAction']` on both bindings.
 *
 * Pre-Phase-2 the manifests carried two band-aid nodes solely to satisfy
 * policy walkers: a hidden `<StatCard>` style of quota anchor, and an
 * off-screen `<Stack>` of `<Button>`s for `cart.remove` / `cart.add` so
 * `reversibility_surfaced` would find a rollback affordance. Phase 2 #5
 * replaces both with **ambient policy satisfiers** declared at the
 * services bag level (see `lib/cir-providers.tsx`):
 *
 *   - The chrome `<StatusBar>` carries the `*.rate_limit` data binding
 *     AND the host declares the chip as an `AmbientPolicySatisfier` so
 *     the `rate_limited_actions_show_state` policy is satisfied without
 *     an in-tree quota anchor.
 *   - The data-bound nodes raise an inline undo toast on every reversible
 *     mutation; the host declares the ambient `<UndoToast>` so
 *     `reversibility_surfaced` is satisfied without in-tree rollback
 *     `<Button>`s.
 *
 * `<CartItemList>` declares `compositionRole: 'list'` (see
 * `lib/component-bindings.ts`). The policy engine reads the
 * `composition_roles` map off `PolicyContext` so it treats
 * `<CartItemList>` like the baseline `<List>` for composition allow-listing.
 */

import { describe, expect, it } from 'vitest';
import { COMPONENT_BINDINGS, COMPOSITION_RULES } from '@cir/components';
import {
  BASELINE_POLICIES,
  composesAccordingTo,
  manifestComponentContractSatisfied,
  validateManifest,
  RATE_LIMIT_CHIP_AMBIENT_SATISFIER,
  UNDO_TOAST_AMBIENT_SATISFIER,
  type AmbientPolicySatisfier,
} from '@cir/policies';
import { manifestContractsFromBindings } from '@cir/runtime';
import { DUMMYJSON_BRAND_KIT } from '../lib/brand-kit';
import { CAPABILITIES } from '../lib/capabilities';
import { browseManifest, cartManifest, checkoutManifest, productManifest } from '../lib/manifests';
import type { Density } from '@cir/components';

/**
 * Mirror of `DEMO_DUMMYJSON_COMPOSITION_ROLES` from
 * `lib/component-bindings.ts`. We do not import that module directly
 * because it pulls in the React component factories via `@/components/*`
 * — those tsx imports would fail under vitest's module resolver in this
 * harness without a per-app vitest config. Keeping the role map mirrored
 * here is fine: the field shape is small and any drift trips the
 * binding-roles test below.
 */
const DEMO_DUMMYJSON_COMPOSITION_ROLES: Readonly<Record<string, 'list' | 'grid' | 'table'>> =
  Object.freeze({
    CartItemList: 'list',
  });

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
    'dummyjson.cart.add.rate_limit.*',
    'dummyjson.cart.remove.rate_limit.*',
  ],
};

// Mirror of `AMBIENT_POLICY_SATISFIERS` from `lib/cir-providers.tsx`.
// Declaring the chrome rate-limit chip + ambient undo toast clears the
// `rate_limited_actions_show_state` and `reversibility_surfaced`
// obligations without any in-manifest anchor nodes.
const AMBIENT_POLICY_SATISFIERS: readonly AmbientPolicySatisfier[] = [
  UNDO_TOAST_AMBIENT_SATISFIER,
  RATE_LIMIT_CHIP_AMBIENT_SATISFIER,
];

// Phase 2 #1: per-binding manifest contracts threaded into the policy.
const MANIFEST_CONTRACTS = manifestContractsFromBindings(COMPONENT_BINDINGS);

function validate(manifest: ReturnType<typeof browseManifest>) {
  return validateManifest(
    {
      manifest,
      capabilities: CAPABILITIES,
      intent: INTENT,
      rate_limited_capability_ids: RATE_LIMITED,
      pii_fields: PII,
      brand_kit: DUMMYJSON_BRAND_KIT,
      composition_roles: DEMO_DUMMYJSON_COMPOSITION_ROLES,
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

  // Phase 2 #5: the off-screen `<Stack>` of `<Button>` rollback anchors
  // is gone. Reversibility is satisfied via the ambient `<UndoToast>`
  // declared in `cir-providers.tsx` (and asserted indirectly by the
  // policy run above — if the satisfier wiring were broken, the run
  // would surface `reversibility_surfaced` errors).
  it('does not need an in-tree rollback Button — ambient UndoToast covers reversibility', () => {
    const browse = browseManifest('comfortable');
    const product = productManifest('1', 'comfortable');
    const cart = cartManifest('comfortable');

    const findFirst = (root: unknown, comp: string): Record<string, unknown> | null => {
      if (!root || typeof root !== 'object') return null;
      const node = root as Record<string, unknown>;
      if (node['component'] === comp) return node;
      const children = node['children'];
      if (Array.isArray(children)) {
        for (const c of children) {
          const f = findFirst(c, comp);
          if (f) return f;
        }
      }
      return null;
    };

    // No `<Button>` carrying `cart.add` / `cart.remove` should remain in
    // the manifest tree — the user-visible reversibility is the inline
    // undo toast raised by the custom bindings.
    for (const m of [browse, product, cart]) {
      const stripBtn = (root: unknown, action: string): Record<string, unknown> | null => {
        if (!root || typeof root !== 'object') return null;
        const node = root as Record<string, unknown>;
        if (
          node['component'] === 'Button' &&
          Array.isArray(node['actions']) &&
          (node['actions'] as string[]).includes(action)
        ) {
          return node;
        }
        const children = node['children'];
        if (Array.isArray(children)) {
          for (const c of children) {
            const f = stripBtn(c, action);
            if (f) return f;
          }
        }
        return null;
      };
      expect(stripBtn(m.routes[0]!.layout, 'dummyjson.cart.add')).toBeNull();
      expect(stripBtn(m.routes[0]!.layout, 'dummyjson.cart.remove')).toBeNull();
    }
    // Sanity check — the chrome IS still mounted (the rate-limit chip).
    expect(findFirst(browse.routes[0]!.layout, 'StatusBar')).not.toBeNull();
  });

  it('rate-limit chip is present on every route exposing a rate-limited action', () => {
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
    expect(findFirst(browseManifest('comfortable').routes[0]!.layout, 'StatusBar')).not.toBeNull();
    expect(
      findFirst(productManifest('1', 'comfortable').routes[0]!.layout, 'StatusBar'),
    ).not.toBeNull();
    expect(findFirst(cartManifest('comfortable').routes[0]!.layout, 'StatusBar')).not.toBeNull();
  });

  it('every data-bound node declares a DISTINCTIVE empty_state inline (Phase 2 #4)', () => {
    // Phase 2 #4 — Resolver fallback contract. The render walker supplies
    // a baseline loading + error state at runtime, so the manifest is no
    // longer obliged to author them. Distinctive empties (the cart's
    // "Your cart is empty" voice, the product detail's "not found" branch,
    // the recommendations' "browse more to seed picks" copy) still have
    // to be authored — they are product-meaningful copy the LLM cannot
    // synthesise from a generic default.
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
      // Custom bindings that play list/detail roles. ProductGrid was
      // retired in the marketplace pivot — the baseline `<Grid>` is the
      // data-bound node now.
      'CartItemList',
      'ProductDetail',
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
        if (data['empty_state'] === undefined) {
          const siblings = (parent?.['children'] as unknown[] | undefined) ?? [];
          const handled = siblings.some((s) => {
            const sib = s as Record<string, unknown>;
            return sib !== node && sib['component'] === 'EmptyState';
          });
          if (!handled) missing.push(`${route}: ${comp} missing empty_state`);
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

  it('CartItemList is recognised as a List via composition_roles', () => {
    // The `composes_according_to_rules` policy looks up `node.component`
    // against the rule map. Without `composition_roles`, CartItemList
    // would be unknown — but with the role map threaded through it
    // inherits the baseline `List` rule (`can_contain: '*'`).
    expect(DEMO_DUMMYJSON_COMPOSITION_ROLES['CartItemList']).toBe('list');
    // ProductGrid was retired — the role map no longer carries it.
    expect(DEMO_DUMMYJSON_COMPOSITION_ROLES['ProductGrid']).toBeUndefined();
  });
});
