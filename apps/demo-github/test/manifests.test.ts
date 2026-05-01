// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Manifest sanity + baseline-policy compliance for `apps/demo-github`.
 *
 * The hand-written manifests power the fallback compiler when no LLM is
 * configured. We pin three guarantees:
 *
 *   1. Each route's manifest validates against `ManifestSchema`.
 *   2. The full baseline policy set passes (no `error` violations) when
 *      run against the demo's capability + intent context, including
 *      `empty_loading_error_handled` (Wave 7a P-8) and
 *      `respects_brand_kit` with the Octant kit attached.
 *   3. The destructive `github.issue.close` action surfaces its
 *      `github.issue.reopen` rollback as a sibling Button so
 *      `reversibility_surfaced` is satisfied.
 */

import { describe, expect, it } from 'vitest';
import { ManifestSchema } from '@cir/schemas';
import { BASELINE_POLICIES, validateManifest } from '@cir/policies';
import { compositionRolesFromBindings } from '@cir/runtime';
import {
  inboxManifest,
  issueDetailManifest,
  manifestForRoute,
  newIssueManifest,
  reposManifest,
  todayManifest,
} from '../lib/manifests';
import { CAPABILITIES } from '../lib/capabilities';
import { DEMO_GITHUB_BRAND_KIT } from '../lib/brand-kit';
import { DEMO_GITHUB_BINDINGS } from '../lib/component-bindings';

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

function findFirst(node: unknown, componentName: string): Record<string, unknown> | null {
  if (!node || typeof node !== 'object') return null;
  const obj = node as Record<string, unknown>;
  if (obj['component'] === componentName) return obj;
  const children = obj['children'];
  if (Array.isArray(children)) {
    for (const c of children) {
      const found = findFirst(c, componentName);
      if (found !== null) return found;
    }
  }
  return null;
}

describe('demo-github manifests', () => {
  it('every route validates against ManifestSchema', () => {
    const all = [
      todayManifest(),
      reposManifest(),
      issueDetailManifest('42'),
      newIssueManifest(),
      inboxManifest(),
    ];
    for (const m of all) {
      const r = ManifestSchema.safeParse(m);
      if (!r.success) {
        // eslint-disable-next-line no-console
        console.error(m.manifest_id, r.error.format());
      }
      expect(r.success, `${m.manifest_id} schema`).toBe(true);
    }
  });

  it('manifestForRoute resolves canonical paths and rejects unknowns', () => {
    expect(manifestForRoute('/today')).not.toBeNull();
    expect(manifestForRoute('/repos')).not.toBeNull();
    expect(manifestForRoute('/inbox')).not.toBeNull();
    expect(manifestForRoute('/issue/new')).not.toBeNull();
    expect(manifestForRoute('/issue/123')).not.toBeNull();
    expect(manifestForRoute('/nope')).toBeNull();
  });

  it('today manifest exposes a quota source so rate-limited actions show state', () => {
    const m = todayManifest();
    const stat = findFirst(m.routes[0]!.layout!, 'StatCard');
    expect(stat).not.toBeNull();
    const data = stat!['data'] as { source: string } | undefined;
    expect(data?.source).toBe('github.api.rate_limit');
    expect(data?.source.endsWith('.rate_limit')).toBe(true);
  });

  it('issue detail manifest pairs close with reopen for reversibility', () => {
    const m = issueDetailManifest('42');
    const layout = m.routes[0]!.layout!;
    // Walk all Buttons in the route and collect their actions.
    const actions: string[] = [];
    function collect(node: unknown): void {
      if (!node || typeof node !== 'object') return;
      const obj = node as Record<string, unknown>;
      if (obj['component'] === 'Button' && Array.isArray(obj['actions'])) {
        for (const a of obj['actions']) actions.push(String(a));
      }
      if (Array.isArray(obj['children'])) {
        for (const c of obj['children']) collect(c);
      }
    }
    collect(layout);
    expect(actions).toContain('github.issue.close');
    expect(actions).toContain('github.issue.reopen');
  });

  it('passes the full baseline policy set with the Octant brand kit attached', () => {
    const manifests = [
      todayManifest(),
      reposManifest(),
      issueDetailManifest('42'),
      newIssueManifest(),
      inboxManifest(),
    ];
    const compositionRoles = compositionRolesFromBindings(DEMO_GITHUB_BINDINGS);
    for (const manifest of manifests) {
      const result = validateManifest(
        {
          manifest,
          capabilities: CAPABILITIES,
          intent: INTENT,
          rate_limited_capability_ids: RATE_LIMITED,
          pii_fields: new Set(),
          brand_kit: DEMO_GITHUB_BRAND_KIT,
          composition_roles: compositionRoles,
        },
        { policies: BASELINE_POLICIES },
      );
      if (!result.ok) {
        // eslint-disable-next-line no-console
        console.error(manifest.manifest_id, result.violations);
      }
      expect(result.ok, `${manifest.manifest_id} baseline`).toBe(true);
    }
  });

  it('every data-bound list/table declares a DISTINCTIVE empty state inline (Phase 2 #4)', () => {
    // Phase 2 #4 — Resolver fallback contract. The runtime supplies sensible
    // loading / error defaults at render time, so manifests no longer have
    // to author them. Every github demo route, however, ships a distinctive
    // empty-state copy ("Inbox zero", "No repositories", "Issue not found",
    // etc.) — that copy is opt-in per route via `data.empty_state`.
    const manifests = [todayManifest(), reposManifest(), inboxManifest(), issueDetailManifest('1')];
    for (const m of manifests) {
      const layout = m.routes[0]!.layout!;
      // Walk every node; any data binding on a data-bound component MUST
      // carry an inline `empty_state` slot whose component is `EmptyState`.
      const dataBoundIds = new Set([
        'List',
        'Table',
        'Grid',
        'KPIRow',
        'DetailView',
        'IssueQueue',
        'RepoTable',
      ]);
      function walk(n: unknown): void {
        if (!n || typeof n !== 'object') return;
        const obj = n as Record<string, unknown>;
        const component = obj['component'] as string | undefined;
        const data = obj['data'] as Record<string, unknown> | undefined;
        if (component !== undefined && dataBoundIds.has(component) && data !== undefined) {
          const slot = data['empty_state'] as Record<string, unknown> | undefined;
          expect(slot, `${m.manifest_id} ${component} empty_state`).toBeDefined();
          expect(slot?.['component'], `${m.manifest_id} ${component} empty_state.component`).toBe(
            'EmptyState',
          );
        }
        if (Array.isArray(obj['children'])) {
          for (const c of obj['children']) walk(c);
        }
      }
      walk(layout);
    }
  });
});
