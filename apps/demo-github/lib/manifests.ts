// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Hand-written manifests for `apps/demo-github`. The compiler's fallback
 * compiler delegates to `manifestForRoute()` when no LLM is configured.
 *
 * Each manifest exercises Wave 6/7 features the demo showcases:
 *  - `/today`: `<IssueQueue>` — the rich queue surface with optimistic
 *    archive, hover-card mentions, salience hierarchy, and bulk actions.
 *    Registered with `compositionRole: 'list'` so the policy engine treats
 *    it as equivalent to a `<List>` for the long-list and
 *    empty/loading/error obligations.
 *  - `/repos`: `<RepoTable>` — dense table with hover-card previews on
 *    each row's name and inline `Create issue` deep-links.
 *    `compositionRole: 'table'`.
 *  - `/issue/[id]`: `<DetailView>` with comments timeline + paired
 *    close/reopen buttons (the latter satisfies `reversibility_surfaced`).
 *  - `/issue/new`: `<Form>` for creating issues, with the rate-limit chip
 *    in the header.
 *  - `/inbox`: `<List>` filtered to mentions, with optimistic archive +
 *    `<UndoToast>`.
 *
 * The chrome — wordmark + nav + small rate-limit chip — is rendered by
 * `<OctantHeader>`, replacing the pre-E-A pair of full-size `<StatusBar>`
 * and `<StatCard>` blocks that were stacking visual weight at the top of
 * every page.
 *
 * Empty / loading / error states (Phase 2 #4 — resolver fallback contract):
 * the runtime supplies sensible defaults so the manifest only declares an
 * inline slot when the route wants a distinctive copy (e.g. `/today` and
 * `/inbox`'s "Inbox zero" empty state). The previous boilerplate
 * `loadingNode()` + `errorAlertNode()` siblings are gone — they were
 * duplicating the resolver default. The `empty_loading_error_handled`
 * policy is now an `info`-severity advisory; the manifest still satisfies
 * it via the inline distinctive empties.
 */

import type { LayoutNode, Manifest } from '@cir/schemas';

const COMPILED_FROM = {
  capability_version: '0.1.0',
  skill_versions: {
    'decision-queue': '0.1.0',
    'inbox-zero': '0.1.0',
    'information-hierarchy': '1.0.0',
    'confirm-on-destructive': '0.1.0',
    'bulk-edit-affordance': '0.1.0',
    'thread-collapse': '0.1.0',
    'quick-reply-affordance': '0.1.0',
  },
  component_catalog_version: '0.1.0',
  intent_profile_version: 1,
  compiler_model: 'fake-compiler-v0',
  compiled_at: '2026-04-30T12:00:00Z',
};

const INVALIDATES_ON: readonly string[] = [
  'capability_schema_change:github.issue.list:>=0.2.0',
  'capability_schema_change:github.issue.close:>=0.2.0',
  'capability_schema_change:github.issue.create:>=0.2.0',
  'capability_schema_change:github.repo.list:>=0.2.0',
  'skill.version_changed:decision-queue',
  'skill.version_changed:information-hierarchy',
];

const POLICIES_SATISFIED: readonly string[] = [
  'data_access_within_grant',
  'confirmation_required_for_destructive',
  'rate_limited_actions_show_state',
  'reversibility_surfaced',
  'empty_loading_error_handled',
  'respects_brand_kit',
  'composes_hierarchy_for_long_lists',
];

/** Octant header — wordmark + nav + small rate-limit chip. */
function headerNode(activePath: string): LayoutNode {
  return {
    component: 'OctantHeader',
    props: { activePath },
    children: [],
  };
}

// Pre-Phase-2-#5, this module exported a `rateLimitQuotaNode()` helper —
// a `<StatCard>` with `display: none` carrying a `github.api.rate_limit`
// data binding solely to satisfy the `rate_limited_actions_show_state`
// policy walker. That node was a band-aid: the actual rate-limit chip
// lives in `<OctantHeader>` and updates from `lib/github-client.ts`.
// Phase 2 #5 lets the host declare the chip as an `AmbientPolicySatisfier`
// in `cir-providers.tsx`, so the policy clears the obligation without an
// in-manifest hidden card. The helper is gone; the manifests below are
// the actual rendered tree.

/**
 * Distinctive empty-state node. Phase 2 #4 — only routes whose empty state
 * carries product-meaningful copy (`/today`, `/inbox`'s "Inbox zero" voice)
 * still author one. The other routes inherit the resolver default supplied
 * by the React render walker. Loading and error defaults always come from
 * the resolver (no per-route copy was distinctive enough to justify the
 * duplication).
 */
function emptyStateNode(title: string, body: string): LayoutNode {
  return {
    component: 'EmptyState',
    props: { title, description: body },
    children: [],
  };
}

export function todayManifest(): Manifest {
  return {
    manifest_id: 'm_ghdemotoday0001',
    user_id: 'demo-github-user',
    app_id: 'cir.demo-github',
    compiled_from: COMPILED_FROM,
    ttl: null,
    invalidates_on: [...INVALIDATES_ON],
    policies_satisfied: [...POLICIES_SATISFIED],
    routes: [
      {
        path: '/today',
        title: 'Today',
        layout: {
          component: 'Stack',
          props: { direction: 'vertical', gap: 'lg' },
          children: [
            headerNode('/today'),
            {
              component: 'Container',
              props: { maxWidth: 'lg' },
              children: [
                {
                  component: 'IssueQueue',
                  props: {
                    heading: 'Today',
                    subtitle:
                      '8 issues need a decision. Top three are highlighted by salience. Archive any issue with a 5-second undo.',
                    emphasizeTopN: 3,
                  },
                  data: {
                    source: 'github.issue.list',
                    filter: 'state = "open" AND requires_decision = true',
                    sort: 'salience desc',
                    // Distinctive empty: keep the "Inbox zero" voice. Loading
                    // and error fall through to the resolver default.
                    empty_state: emptyStateNode(
                      'Inbox zero',
                      'No issues need a decision right now.',
                    ),
                  },
                  actions: ['github.issue.archive', 'github.issue.close'],
                  children: [],
                },
                // Reversibility — `UndoToast` is the ambient affordance the
                // `reversibility_surfaced` policy explicitly accepts.
                {
                  component: 'UndoToast',
                  props: { duration_ms: 5000, variant: 'inline' },
                  children: [],
                },
              ],
            },
          ],
        },
        refresh: { data: 'on_focus + 60s_interval', structure: 'never_unless_invalidated' },
      },
    ],
  };
}

export function reposManifest(): Manifest {
  return {
    manifest_id: 'm_ghdemorepos0001',
    user_id: 'demo-github-user',
    app_id: 'cir.demo-github',
    compiled_from: COMPILED_FROM,
    ttl: null,
    invalidates_on: [...INVALIDATES_ON],
    policies_satisfied: [...POLICIES_SATISFIED],
    routes: [
      {
        path: '/repos',
        title: 'Repositories',
        layout: {
          component: 'Stack',
          props: { direction: 'vertical', gap: 'lg' },
          children: [
            headerNode('/repos'),
            {
              component: 'Container',
              props: { maxWidth: 'lg' },
              children: [
                {
                  component: 'RepoTable',
                  props: {
                    heading: 'Repositories',
                    subtitle:
                      'Hover a name for the description; "Create issue" deep-links per row.',
                    emphasizeTopN: 1,
                    // `issue.create` carries the `post` side-effect; gate
                    // the per-row dispatch behind a modal so
                    // `confirmation_required_for_destructive` is satisfied.
                    confirmation: 'modal',
                  },
                  data: {
                    source: 'github.repo.list',
                    sort: 'stargazers_count desc',
                    // Distinctive empty: prompt the user to connect a token.
                    empty_state: emptyStateNode(
                      'No repositories',
                      'Connect a GitHub token to load your repos.',
                    ),
                  },
                  actions: ['github.issue.create'],
                  children: [],
                },
                // Ambient reversibility affordance for issue.create.
                {
                  component: 'UndoToast',
                  props: { duration_ms: 5000, variant: 'inline' },
                  children: [],
                },
              ],
            },
          ],
        },
        refresh: { data: 'on_focus + 600s_interval', structure: 'never_unless_invalidated' },
      },
    ],
  };
}

export function issueDetailManifest(id: string): Manifest {
  return {
    manifest_id: `m_ghissue${id
      .replace(/[^a-z0-9]/gi, '')
      .toLowerCase()
      .padEnd(8, '0')
      .slice(0, 8)}`,
    user_id: 'demo-github-user',
    app_id: 'cir.demo-github',
    compiled_from: COMPILED_FROM,
    ttl: null,
    invalidates_on: [...INVALIDATES_ON],
    policies_satisfied: [...POLICIES_SATISFIED],
    routes: [
      {
        path: `/issue/${id}`,
        title: `Issue #${id}`,
        layout: {
          component: 'Stack',
          props: { direction: 'vertical', gap: 'lg' },
          children: [
            headerNode(''),
            {
              component: 'Container',
              props: { maxWidth: 'md' },
              children: [
                {
                  component: 'DetailView',
                  props: {
                    fields: [
                      { id: 'title', label: 'Title' },
                      { id: 'state', label: 'State' },
                      { id: 'body', label: 'Description', renderAs: 'mention-aware' },
                    ],
                  },
                  data: {
                    source: 'github.issue.get',
                    filter: `number = ${id}`,
                    // Distinctive: a "not found" voice for a deleted issue.
                    empty_state: emptyStateNode(
                      'Issue not found',
                      'The referenced issue may have been deleted.',
                    ),
                  },
                  actions: ['github.issue.close'],
                  children: [],
                },
                {
                  component: 'Timeline',
                  props: { density: 'comfortable' },
                  data: {
                    source: 'github.issue.events',
                    filter: `issue_number = ${id}`,
                  },
                  children: [],
                },
                // Action bar — paired Buttons live at the same Stack level so
                // `reversibility_surfaced` finds the sibling rollback for each.
                {
                  component: 'Button',
                  props: { label: 'Close issue', variant: 'destructive' },
                  actions: ['github.issue.close'],
                  children: [],
                },
                {
                  component: 'Button',
                  props: { label: 'Reopen', variant: 'secondary' },
                  actions: ['github.issue.reopen'],
                  children: [],
                },
                {
                  component: 'Button',
                  props: { label: 'Archive', variant: 'ghost' },
                  actions: ['github.issue.archive'],
                  children: [],
                },
                {
                  component: 'Button',
                  props: { label: 'Unarchive', variant: 'ghost' },
                  actions: ['github.issue.unarchive'],
                  children: [],
                },
                {
                  component: 'UndoToast',
                  props: { duration_ms: 5000, variant: 'inline' },
                  children: [],
                },
              ],
            },
          ],
        },
        refresh: { data: 'on_focus', structure: 'never_unless_invalidated' },
      },
    ],
  };
}

export function newIssueManifest(): Manifest {
  return {
    manifest_id: 'm_ghdemoissuenew',
    user_id: 'demo-github-user',
    app_id: 'cir.demo-github',
    compiled_from: COMPILED_FROM,
    ttl: null,
    invalidates_on: [...INVALIDATES_ON],
    policies_satisfied: [...POLICIES_SATISFIED],
    routes: [
      {
        path: '/issue/new',
        title: 'New issue',
        layout: {
          component: 'Stack',
          props: { direction: 'vertical', gap: 'lg' },
          children: [
            headerNode('/issue/new'),
            {
              component: 'Container',
              props: { maxWidth: 'sm' },
              children: [
                {
                  component: 'Form',
                  props: {
                    variant: 'compact',
                    fields: [
                      { id: 'repo', type: 'select', label: 'Repository' },
                      { id: 'title', type: 'text', label: 'Title' },
                      { id: 'body', type: 'textarea', label: 'Body' },
                      { id: 'labels', type: 'multiselect', label: 'Labels' },
                    ],
                    submit: { capability: 'github.issue.create', label: 'Create issue' },
                    confirmation: 'modal',
                  },
                  actions: ['github.issue.create'],
                  children: [],
                },
                // Ambient reversibility affordance — `issue.create`'s rollback
                // (`issue.close`) is surfaced via the toast.
                {
                  component: 'UndoToast',
                  props: { duration_ms: 5000, variant: 'inline' },
                  children: [],
                },
              ],
            },
          ],
        },
        refresh: { data: 'never', structure: 'never_unless_invalidated' },
      },
    ],
  };
}

export function inboxManifest(): Manifest {
  return {
    manifest_id: 'm_ghdemoinbox0001',
    user_id: 'demo-github-user',
    app_id: 'cir.demo-github',
    compiled_from: COMPILED_FROM,
    ttl: null,
    invalidates_on: [...INVALIDATES_ON],
    policies_satisfied: [...POLICIES_SATISFIED],
    routes: [
      {
        path: '/inbox',
        title: 'Inbox',
        layout: {
          component: 'Stack',
          props: { direction: 'vertical', gap: 'lg' },
          children: [
            headerNode('/inbox'),
            {
              component: 'Container',
              props: { maxWidth: 'lg' },
              children: [
                {
                  component: 'IssueQueue',
                  props: {
                    heading: 'Inbox',
                    subtitle: 'Issues that mention you, sorted by recency.',
                    emphasizeTopN: 3,
                  },
                  data: {
                    source: 'github.issue.list',
                    filter: 'state = "open" AND mentioned_me = true',
                    sort: 'updated_at desc',
                    // Distinctive: keep the "Inbox zero" voice.
                    empty_state: emptyStateNode(
                      'Inbox zero',
                      'You are caught up. Last sync just now.',
                    ),
                  },
                  actions: ['github.issue.archive'],
                  children: [],
                },
                {
                  component: 'UndoToast',
                  props: { duration_ms: 5000, variant: 'inline' },
                  children: [],
                },
              ],
            },
          ],
        },
        refresh: { data: 'on_focus + 120s_interval', structure: 'never_unless_invalidated' },
      },
    ],
  };
}

const ISSUE_ROUTE_RE = /^\/issue\/([\w.-]+)$/;

export function manifestForRoute(route: string): Manifest | null {
  if (route === '/today') return todayManifest();
  if (route === '/repos') return reposManifest();
  if (route === '/issue/new') return newIssueManifest();
  if (route === '/inbox') return inboxManifest();
  const m = ISSUE_ROUTE_RE.exec(route);
  if (m && m[1] && m[1] !== 'new') return issueDetailManifest(m[1]);
  return null;
}
