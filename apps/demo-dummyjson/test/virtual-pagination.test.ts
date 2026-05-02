// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Wave 10 / S-2 showcase — cursor pagination + virtualization advisory wired
 * against the dummyjson product catalog.
 *
 * The shipping `dummyjson.product.list` capability returns 30 products in
 * one shot, so the existing `<Grid>` binding is fine. This fixture
 * demonstrates the S-2 contract for a hypothetical "huge catalog"
 * capability:
 *
 *   1. The resolver returns a `CursorPaginatedResult` envelope, and
 *      `paginate()` walks every page to completion.
 *   2. When a `<List>` binding to a capability with `expected_count > 500`
 *      lands in a manifest, the `composes_hierarchy_for_long_lists` policy
 *      emits a `warn` advising the swap to `<VirtualList>`.
 *
 * No marketplace customs touched; this is a baseline-additions showcase
 * that the policy + cursor protocol behave end-to-end.
 */

import { describe, expect, it } from 'vitest';
import { composesHierarchyForLongLists, VIRTUAL_THRESHOLD } from '@atelier/policies';
import { paginate, type CursorPaginatedResult } from '@atelier/data-resolvers';
import type { Capability, Manifest } from '@atelier/schemas';

interface Product {
  id: number;
  title: string;
}

/**
 * A pretend "huge product catalog" capability. Carries an explicit
 * `expected_count` so the policy can advise virtualization without an
 * inline binding hint.
 */
const HUGE_CATALOG_CAPABILITY: Capability = {
  id: 'dummyjson.product.list_all',
  kind: 'data',
  version: '0.1.0',
  input: { cursor: 'string', limit: 'number' },
  output: { products: 'array<Product>', next_cursor: 'string', total: 'number' },
  side_effects: ['reads:dummyjson_catalog'],
  permissions: ['catalog:read'],
  confirmation: 'none',
  reversible: true,
  expected_count: 1640, // Real dummyjson "/products?limit=0" returns ~194; we
  // pretend it's the full upstream catalog size for the showcase.
  salience_default: 'rating desc',
};

describe('Wave 10 / S-2 showcase — cursor pagination + virtualization advisory', () => {
  it('paginate() walks a chunked product catalog to completion', async () => {
    // Ten "pages" of 200 products each = 2000 products total. Each page
    // returns a `CursorPaginatedResult` envelope with the next cursor; the
    // last page omits the cursor to terminate.
    const PAGES = 10;
    const PER_PAGE = 200;
    const totalProducts = PAGES * PER_PAGE;
    let calls = 0;
    const resolver = async (b: { cursor?: string }): Promise<unknown> => {
      const pageIndex = b.cursor ? Number(b.cursor) : 0;
      calls += 1;
      const items: Product[] = Array.from({ length: PER_PAGE }, (_, i) => ({
        id: pageIndex * PER_PAGE + i,
        title: `Product ${String(pageIndex * PER_PAGE + i)}`,
      }));
      const next: number | undefined = pageIndex + 1 < PAGES ? pageIndex + 1 : undefined;
      const out: CursorPaginatedResult<Product> = {
        items,
        next_cursor: next !== undefined ? String(next) : undefined,
        total: totalProducts,
      };
      return out;
    };
    const all = await paginate<Product>(resolver, {
      source: 'dummyjson.product.list_all',
      pagination: 'cursor',
      limit: PER_PAGE,
    });
    expect(all.length).toBe(totalProducts);
    expect(calls).toBe(PAGES);
    // Spot-check that the last page's items are present.
    expect(all[totalProducts - 1]?.id).toBe(totalProducts - 1);
  });

  it('the long-list policy nudges <List> → <VirtualList> for the huge catalog binding', () => {
    const manifest: Manifest = {
      manifest_id: 'm_browse_all001',
      user_id: 'demo-user',
      app_id: 'cir.demo-dummyjson',
      compiled_from: {
        capability_version: '0.1.0',
        skill_versions: {},
        component_catalog_version: '1.0.0',
        intent_profile_version: 1,
        compiler_model: 'showcase',
        compiled_at: '2026-05-02T00:00:00Z',
      },
      ttl: null,
      invalidates_on: [],
      policies_satisfied: [],
      routes: [
        {
          path: '/browse-all',
          title: 'All products',
          layout: {
            component: 'List',
            data: { source: HUGE_CATALOG_CAPABILITY.id },
            // Already declares hierarchy treatment so the salience-hierarchy
            // check passes; the virtualization advisory is what we care
            // about for this showcase.
            props: { density: 'compact' },
          },
        },
      ],
    };

    const result = composesHierarchyForLongLists.evaluate({
      manifest,
      capabilities: { [HUGE_CATALOG_CAPABILITY.id]: HUGE_CATALOG_CAPABILITY },
      intent: { user_id: 'demo-user', global_preferences: {}, granted_fields: [] },
      rate_limited_capability_ids: new Set(),
      pii_fields: new Set(),
    });

    expect(result.ok).toBe(false);
    const v = result.violations[0]!;
    expect(v.severity).toBe('warn');
    expect(v.message).toContain('VirtualList');
    expect(v.hint).toContain("'List' for 'VirtualList'");
    // Sanity: the threshold the policy uses matches the exported constant.
    expect(HUGE_CATALOG_CAPABILITY.expected_count).toBeGreaterThan(VIRTUAL_THRESHOLD);
  });

  it('does NOT advise virtualization for the existing /browse Grid binding', () => {
    // The shipping product.list capability returns 30 products. Even if a
    // future capability declares expected_count, <Grid> doesn't get the
    // advisory (tile grids virtualize differently — see policy doc).
    const smallCatalog: Capability = {
      ...HUGE_CATALOG_CAPABILITY,
      id: 'dummyjson.product.list',
      expected_count: 30,
    };
    const manifest: Manifest = {
      manifest_id: 'm_browse001',
      user_id: 'demo-user',
      app_id: 'cir.demo-dummyjson',
      compiled_from: {
        capability_version: '0.1.0',
        skill_versions: {},
        component_catalog_version: '1.0.0',
        intent_profile_version: 1,
        compiler_model: 'showcase',
        compiled_at: '2026-05-02T00:00:00Z',
      },
      ttl: null,
      invalidates_on: [],
      policies_satisfied: [],
      routes: [
        {
          path: '/browse',
          title: 'Browse',
          layout: {
            component: 'Grid',
            data: { source: smallCatalog.id },
            row_binding: 'Card',
            props: { columns: 3 },
          },
        },
      ],
    };
    const result = composesHierarchyForLongLists.evaluate({
      manifest,
      capabilities: { [smallCatalog.id]: smallCatalog },
      intent: { user_id: 'demo-user', global_preferences: {}, granted_fields: [] },
      rate_limited_capability_ids: new Set(),
      pii_fields: new Set(),
    });
    expect(result.ok).toBe(true);
  });
});
