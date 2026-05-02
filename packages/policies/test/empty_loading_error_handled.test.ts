// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for the `empty_loading_error_handled` baseline policy.
 *
 * The policy walks every layout node and, for each data-bound component
 * (`List`, `Table`, `Grid`, `KPIRow`, `DetailView`, `Chart`, `Calendar`,
 * `Kanban`, `Timeline`, `Gallery`, `Tree`) that carries a `data` binding,
 * asserts the manifest declares an empty / loading / error state for it via
 * one of three slots (binding fields, props, or sibling components).
 *
 * Phase 2 #4 — the policy now defaults to `info`-severity violations because
 * the React render walker supplies an `<EmptyState>` / `<Skeleton>` /
 * `<Alert>` default at runtime. Bindings whose `componentId` appears in
 * `PolicyContext.requires_explicit_state_slots` keep the strict
 * `error`-severity check.
 */

import { describe, expect, it } from 'vitest';
import { emptyLoadingErrorHandled } from '../src/baseline/empty_loading_error_handled.js';
import type { LayoutNode, Manifest } from '@atelier/schemas';
import type { PolicyContext } from '../src/result.js';

function ctxFor(
  routes: Manifest['routes'],
  opts: {
    composition_roles?: Record<string, 'list' | 'grid' | 'table'>;
    requires_explicit_state_slots?: ReadonlySet<string>;
  } = {},
): PolicyContext {
  return {
    manifest: {
      manifest_id: 'm_eltest001',
      user_id: 'u',
      app_id: 'a',
      compiled_from: {
        capability_version: '1.0.0',
        skill_versions: {},
        component_catalog_version: '1.0.0',
        intent_profile_version: 1,
        compiler_model: 'test',
        compiled_at: '2026-04-29T12:00:00Z',
      },
      ttl: null,
      invalidates_on: [],
      routes,
      policies_satisfied: [],
    },
    capabilities: {},
    intent: { user_id: 'u', global_preferences: {}, granted_fields: [] },
    rate_limited_capability_ids: new Set(),
    pii_fields: new Set(),
    ...(opts.composition_roles !== undefined ? { composition_roles: opts.composition_roles } : {}),
    ...(opts.requires_explicit_state_slots !== undefined
      ? { requires_explicit_state_slots: opts.requires_explicit_state_slots }
      : {}),
  };
}

function singleRoute(layout: LayoutNode): Manifest['routes'] {
  return [{ path: '/today', title: 'Today', layout }];
}

const FULL_BINDING_STATES = {
  empty_state: { component: 'EmptyState', props: { title: 'No items', body: 'Nothing here yet' } },
  loading_state: { component: 'Spinner' },
  error_state: { component: 'Alert', props: { title: 'Could not load' } },
} as const;

describe('empty_loading_error_handled', () => {
  it('passes when a List + data declares all three states inline on the binding', () => {
    const layout: LayoutNode = {
      component: 'List',
      data: {
        source: 'thread.list',
        ...FULL_BINDING_STATES,
      },
    };
    const result = emptyLoadingErrorHandled.evaluate(ctxFor(singleRoute(layout)));
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('emits an INFO advisory when empty_state is missing on a List + data (resolver supplies default)', () => {
    const layout: LayoutNode = {
      component: 'List',
      data: {
        source: 'thread.list',
        loading_state: FULL_BINDING_STATES.loading_state,
        error_state: FULL_BINDING_STATES.error_state,
      },
    };
    const result = emptyLoadingErrorHandled.evaluate(ctxFor(singleRoute(layout)));
    // ok === true: info violations are advisory, never gate compilation.
    expect(result.ok).toBe(true);
    const v = result.violations.find((x) => x.message.includes('empty_state'));
    expect(v).toBeDefined();
    expect(v?.severity).toBe('info');
    expect(v?.message).toContain('List at /routes/0/layout has data binding but no empty_state');
    expect(v?.message).toContain('resolver will supply a default');
    expect(v?.path).toBe('/routes/0/layout');
    expect(v?.hint).toContain('data.empty_state');
    expect(v?.hint).toContain('EmptyState');
  });

  it('emits INFO when loading_state is missing on a Table + data', () => {
    const layout: LayoutNode = {
      component: 'Table',
      data: {
        source: 'github.repo.list',
        empty_state: FULL_BINDING_STATES.empty_state,
        error_state: FULL_BINDING_STATES.error_state,
      },
    };
    const result = emptyLoadingErrorHandled.evaluate(ctxFor(singleRoute(layout)));
    expect(result.ok).toBe(true);
    const v = result.violations.find((x) => x.message.includes('loading_state'));
    expect(v).toBeDefined();
    expect(v?.severity).toBe('info');
  });

  it('emits INFO when error_state is missing on a Grid + data', () => {
    const layout: LayoutNode = {
      component: 'Grid',
      data: {
        source: 'dummyjson.product.list',
        empty_state: FULL_BINDING_STATES.empty_state,
        loading_state: FULL_BINDING_STATES.loading_state,
      },
    };
    const result = emptyLoadingErrorHandled.evaluate(ctxFor(singleRoute(layout)));
    expect(result.ok).toBe(true);
    const v = result.violations.find((x) => x.message.includes('error_state'));
    expect(v).toBeDefined();
    expect(v?.severity).toBe('info');
  });

  it('keeps the ERROR severity when the binding opts into strict explicit state slots', () => {
    const layout: LayoutNode = {
      component: 'IssueQueue',
      data: { source: 'thread.list' },
    };
    const result = emptyLoadingErrorHandled.evaluate(
      ctxFor(singleRoute(layout), {
        composition_roles: { IssueQueue: 'list' },
        requires_explicit_state_slots: new Set(['IssueQueue']),
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.violations).toHaveLength(3);
    for (const v of result.violations) {
      expect(v.severity).toBe('error');
      expect(v.message).toContain('strict empty/loading/error slots');
    }
  });

  it('passes when a List has NO data binding (no obligation)', () => {
    const layout: LayoutNode = {
      component: 'List',
      props: { items: [{ label: 'Hardcoded' }] },
    };
    const result = emptyLoadingErrorHandled.evaluate(ctxFor(singleRoute(layout)));
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('passes when a Stack contains both a data-bound List and EmptyState/Spinner/Alert siblings', () => {
    const layout: LayoutNode = {
      component: 'Stack',
      children: [
        {
          component: 'List',
          data: { source: 'thread.list' },
        },
        { component: 'EmptyState', props: { title: 'Inbox is clear' } },
        { component: 'Spinner' },
        { component: 'Alert', props: { title: 'Could not load' } },
      ],
    };
    const result = emptyLoadingErrorHandled.evaluate(ctxFor(singleRoute(layout)));
    expect(result.ok).toBe(true);
  });

  it('never requires states for non-data-bound components like Card or Button', () => {
    const layout: LayoutNode = {
      component: 'Stack',
      children: [
        { component: 'Card', data: { source: 'thread.list' } },
        { component: 'Button', actions: ['draft.create'] },
      ],
    };
    const result = emptyLoadingErrorHandled.evaluate(ctxFor(singleRoute(layout)));
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('flags every nested data-bound component independently (info severity)', () => {
    const layout: LayoutNode = {
      component: 'Stack',
      children: [
        {
          // Outer List: handled via siblings (EmptyState, Spinner, Alert).
          component: 'List',
          data: { source: 'thread.list' },
          children: [
            {
              // Inner Table: bound to data and DOES NOT handle its states.
              // Without a strict opt-in this is now an INFO advisory, not a
              // hard error — but it must still surface.
              component: 'Table',
              data: { source: 'task.list' },
            },
          ],
        },
        { component: 'EmptyState', props: { title: 'Inbox is clear' } },
        { component: 'Spinner' },
        { component: 'Alert', props: { title: 'Could not load' } },
      ],
    };
    const result = emptyLoadingErrorHandled.evaluate(ctxFor(singleRoute(layout)));
    expect(result.ok).toBe(true);
    const tableViolations = result.violations.filter((v) =>
      v.path.startsWith('/routes/0/layout/children/0/children/0'),
    );
    expect(tableViolations).toHaveLength(3);
    for (const v of tableViolations) expect(v.severity).toBe('info');
    expect(tableViolations.map((v) => v.message.split(';')[0]).sort()).toEqual([
      'Table at /routes/0/layout/children/0/children/0 has data binding but no empty_state',
      'Table at /routes/0/layout/children/0/children/0 has data binding but no error_state',
      'Table at /routes/0/layout/children/0/children/0 has data binding but no loading_state',
    ]);
  });

  it('handles an empty manifest (no routes) without crashing', () => {
    const result = emptyLoadingErrorHandled.evaluate(ctxFor([]));
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('handles a single-route manifest with multiple data-bound nodes', () => {
    const layout: LayoutNode = {
      component: 'Stack',
      children: [
        {
          component: 'List',
          data: { source: 'thread.list', ...FULL_BINDING_STATES },
        },
        {
          component: 'Grid',
          data: { source: 'dummyjson.product.list', ...FULL_BINDING_STATES },
        },
      ],
    };
    const result = emptyLoadingErrorHandled.evaluate(ctxFor(singleRoute(layout)));
    expect(result.ok).toBe(true);
  });

  it('handles a multi-route manifest where one route is fine and another emits info', () => {
    const okLayout: LayoutNode = {
      component: 'List',
      data: { source: 'thread.list', ...FULL_BINDING_STATES },
    };
    const badLayout: LayoutNode = {
      component: 'List',
      data: { source: 'task.list' }, // no states declared at all
    };
    const routes: Manifest['routes'] = [
      { path: '/ok', title: 'OK', layout: okLayout },
      { path: '/bad', title: 'BAD', layout: badLayout },
    ];
    const result = emptyLoadingErrorHandled.evaluate(ctxFor(routes));
    // Without a strict opt-in: 3 INFO advisories, ok stays true.
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(3);
    for (const v of result.violations) {
      expect(v.path).toBe('/routes/1/layout');
      expect(v.severity).toBe('info');
    }
  });

  it('passes when all required states are inline `props.emptyState`-style', () => {
    const layout: LayoutNode = {
      component: 'List',
      data: { source: 'thread.list' },
      props: {
        emptyState: { title: 'No threads', body: 'Inbox is clear today' },
        loadingState: { variant: 'skeleton' },
        errorState: { title: 'Could not load' },
      },
    };
    const result = emptyLoadingErrorHandled.evaluate(ctxFor(singleRoute(layout)));
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('exposes the expected metadata on the NamedPolicy', () => {
    expect(emptyLoadingErrorHandled.id).toBe('empty_loading_error_handled');
    expect(emptyLoadingErrorHandled.applies_to).toBe('manifest');
    // Reports the strictest case it can emit (when a binding opts into strict).
    expect(emptyLoadingErrorHandled.severity).toBe('error');
    expect(emptyLoadingErrorHandled.description).toContain('data-bound');
  });

  it('treats a Skeleton sibling as handling the loading state', () => {
    const layout: LayoutNode = {
      component: 'Stack',
      children: [
        {
          component: 'List',
          data: {
            source: 'thread.list',
            empty_state: FULL_BINDING_STATES.empty_state,
            error_state: FULL_BINDING_STATES.error_state,
          },
        },
        { component: 'Skeleton' },
      ],
    };
    const result = emptyLoadingErrorHandled.evaluate(ctxFor(singleRoute(layout)));
    expect(result.ok).toBe(true);
  });

  it('treats a host-registered list-role custom binding the same as <List> (info)', () => {
    // A custom `<IssueQueue compositionRole="list">` whose data binding has
    // no empty/loading/error states emits info advisories, just like a bare
    // `<List>` — the renderer supplies defaults at runtime.
    const layout: LayoutNode = {
      component: 'IssueQueue',
      data: { source: 'thread.list' },
    };
    const result = emptyLoadingErrorHandled.evaluate(
      ctxFor(singleRoute(layout), { composition_roles: { IssueQueue: 'list' } }),
    );
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(3);
    for (const v of result.violations) expect(v.severity).toBe('info');
  });

  it('does NOT apply to custom bindings without a registered composition role', () => {
    // Backwards compatibility: bindings without a role are unaffected.
    const layout: LayoutNode = {
      component: 'IssueQueue',
      data: { source: 'thread.list' },
    };
    const result = emptyLoadingErrorHandled.evaluate(ctxFor(singleRoute(layout)));
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('reports paths via JSON Pointer rooted at the manifest', () => {
    const layout: LayoutNode = {
      component: 'Stack',
      children: [
        { component: 'NavBar' },
        {
          component: 'Container',
          children: [
            {
              component: 'List',
              data: { source: 'thread.list' },
            },
          ],
        },
      ],
    };
    const result = emptyLoadingErrorHandled.evaluate(ctxFor(singleRoute(layout)));
    // Three info advisories for the inner List.
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(3);
    for (const v of result.violations) {
      expect(v.path).toBe('/routes/0/layout/children/1/children/0');
      expect(v.severity).toBe('info');
    }
  });
});
