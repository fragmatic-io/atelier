// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
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
import { ManifestSchema, type IntentProfile } from '@atelier/schemas';
import {
  BASELINE_POLICIES,
  resolveSalience,
  salienceResolved,
  validateManifest,
  RATE_LIMIT_CHIP_AMBIENT_SATISFIER,
  UNDO_TOAST_AMBIENT_SATISFIER,
  type AmbientPolicySatisfier,
} from '@atelier/policies';
import { compositionRolesFromBindings } from '@atelier/runtime';
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

  it('today manifest does not need an in-tree quota anchor (Phase 2 #5)', () => {
    // Pre-Phase-2-#5 the manifest carried a hidden `<StatCard>` with
    // `display: none` and a `github.api.rate_limit` data binding, solely
    // to satisfy the `rate_limited_actions_show_state` policy walker.
    // Quota is now declared as an `AmbientPolicySatisfier` on the
    // services bag — the chrome `<StatusBar>` (composed in the manifest as
    // a sibling of `<Logo>` + `<NavBar>`) lives on every route. The
    // hidden anchor card is gone.
    const m = todayManifest();
    expect(findFirst(m.routes[0]!.layout!, 'StatCard')).toBeNull();
    // The chrome IS still mounted — `<Stack(Logo, NavBar, StatusBar)>` —
    // post the marketplace pivot. The retired `<OctantHeader>` is gone.
    expect(findFirst(m.routes[0]!.layout!, 'Logo')).not.toBeNull();
    expect(findFirst(m.routes[0]!.layout!, 'NavBar')).not.toBeNull();
    expect(findFirst(m.routes[0]!.layout!, 'StatusBar')).not.toBeNull();
    expect(findFirst(m.routes[0]!.layout!, 'OctantHeader')).toBeNull();
  });

  it('today + inbox manifests use baseline <Queue>; IssueQueue is gone (marketplace pivot)', () => {
    // Marketplace pivot — Octant ships zero custom bindings. The two
    // queue-shaped routes (`/today`, `/inbox`) reference the baseline
    // `<Queue>` primitive directly, not the retired `<IssueQueue>` custom.
    for (const m of [todayManifest(), inboxManifest()]) {
      const layout = m.routes[0]!.layout!;
      expect(findFirst(layout, 'Queue'), `${m.manifest_id} has <Queue>`).not.toBeNull();
      expect(findFirst(layout, 'IssueQueue'), `${m.manifest_id} no <IssueQueue>`).toBeNull();
    }
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
    // Mirror of `AMBIENT_POLICY_SATISFIERS` in `lib/atelier-providers.tsx`.
    // Without these, the policy walkers would still flag the missing
    // in-tree quota anchor / rollback button — declaring the chrome's
    // ambient services lets the policies clear those obligations.
    const ambientSatisfiers: readonly AmbientPolicySatisfier[] = [
      UNDO_TOAST_AMBIENT_SATISFIER,
      RATE_LIMIT_CHIP_AMBIENT_SATISFIER,
    ];
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
          ambient_policy_satisfiers: ambientSatisfiers,
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

  it('P-9 — issue.list / issue.close / issue.archive carry salience_level: "high"', () => {
    expect(CAPABILITIES['github.issue.list']?.salience_level).toBe('high');
    expect(CAPABILITIES['github.issue.close']?.salience_level).toBe('high');
    expect(CAPABILITIES['github.issue.archive']?.salience_level).toBe('high');
    // Sanity: rate-limit / read-only metadata stays at the default level.
    expect(CAPABILITIES['github.api.rate_limit']?.salience_level).toBeUndefined();
  });

  it('P-9 — resolveSalience honours the demo intent priority_overrides', () => {
    // A user who promotes every github capability to high via onboarding.
    const intent: Pick<IntentProfile, 'priority_overrides'> = {
      priority_overrides: [
        { capability_pattern: 'github.**', salience: 'high', reason: 'onboarding' },
      ],
    };
    expect(resolveSalience(CAPABILITIES['github.repo.list']!, intent)).toBe('high');
    expect(resolveSalience(CAPABILITIES['github.api.rate_limit']!, intent)).toBe('high');
    // Without overrides, capability-declared levels apply.
    expect(resolveSalience(CAPABILITIES['github.issue.list']!, {})).toBe('high');
    expect(resolveSalience(CAPABILITIES['github.repo.list']!, {})).toBe('normal');
  });

  it('P-9 — todayManifest and inboxManifest pass salience_resolved (Queue is salience-aware)', () => {
    // The /today and /inbox routes both bind the high-salience
    // `github.issue.list` to a baseline `<Queue>`. The salience-aware
    // policy clears those routes — `<Queue>` is in the salience-aware
    // whitelist, so the per-row emphasis the resolver emits has a
    // visual surface.
    for (const m of [todayManifest(), inboxManifest()]) {
      const result = salienceResolved.evaluate({
        manifest: m,
        capabilities: CAPABILITIES,
        intent: INTENT,
        rate_limited_capability_ids: RATE_LIMITED,
        pii_fields: new Set(),
      });
      expect(result.ok, `${m.manifest_id} salience_resolved`).toBe(true);
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
      const dataBoundIds = new Set(['List', 'Table', 'Grid', 'KPIRow', 'DetailView', 'Queue']);
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
