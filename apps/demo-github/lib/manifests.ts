// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Hand-written manifests for `apps/demo-github`. The compiler's fallback
 * compiler delegates to `manifestForRoute()` when no LLM is configured.
 *
 * Each manifest exercises Wave 6/7 features the demo showcases:
 *  - `/today`: baseline `<Queue>` bound to `github.issue.list`, with
 *    declarative per-row `actions` (Archive ghost + Close destructive with
 *    inline confirm) and an ambient `<UndoToast>` for reversibility. Top
 *    salient rows surface as `data-emphasis="high"` via the resolver tagging
 *    the items. The previous `<IssueQueue>` custom binding was retired in
 *    the marketplace pivot — Octant now ships zero customs.
 *  - `/repos`: baseline `<Table>` with declared columns + per-row
 *    `Create issue` capability binding.
 *  - `/issue/[id]`: `<DetailView>` with comments timeline + paired
 *    close/reopen buttons (the latter satisfies `reversibility_surfaced`).
 *  - `/issue/new`: `<Form>` for creating issues, with the rate-limit chip
 *    in the header.
 *  - `/inbox`: `<Queue>` filtered to mentions, with optimistic archive +
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

/**
 * Octant header — `<Stack>` of `<Logo>` (octagon glyph + wordmark),
 * `<NavBar>` (nav items), and `<StatusBar>` (rate-limit chip). Pure
 * baseline composition — no `<OctantHeader>` / `<Wordmark>` / `<RateLimitStatusBar>`
 * customs (deleted in the marketplace pivot).
 */
function headerNode(activePath: string): LayoutNode {
  const navItems: { label: string; href: string; active: boolean }[] = [
    { label: 'Today', href: '/today', active: activePath === '/today' },
    { label: 'Repos', href: '/repos', active: activePath === '/repos' },
    { label: 'Inbox', href: '/inbox', active: activePath === '/inbox' },
    { label: 'New issue', href: '/issue/new', active: activePath === '/issue/new' },
  ];
  return {
    component: 'Stack',
    props: { direction: 'horizontal', gap: 'md', align: 'center' },
    children: [
      {
        component: 'Logo',
        props: {
          glyph: '\u{2B22}', // black medium octagon — the Octant mark
          wordmark: 'octant',
          size: 'md',
          href: '/today',
        },
        children: [],
      },
      {
        component: 'NavBar',
        props: { items: navItems },
        children: [],
      },
      // Rate-limit indicator. Bound to `github.api.rate_limit` so the chip
      // renders the live quota; ambient `RATE_LIMIT_CHIP_AMBIENT_SATISFIER`
      // covers the `rate_limited_actions_show_state` policy.
      {
        component: 'StatusBar',
        props: { variant: 'compact', status: 'operational', message: 'API' },
        data: { source: 'github.api.rate_limit' },
        children: [],
      },
    ],
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
                  // Marketplace pivot: the rich queue surface is now the
                  // baseline `<Queue>` primitive, bound to `github.issue.list`
                  // and dispatching declarative per-row capabilities. The old
                  // `<IssueQueue>` custom is gone — Octant ships zero customs.
                  // Top salient rows (the data resolver / fixture tags up to
                  // three with `emphasis: 'high'`) get `data-emphasis="high"`
                  // on the row; host CSS can tint accordingly.
                  component: 'Queue',
                  props: {
                    title: 'Today',
                    actions: [
                      { id: 'github.issue.archive', label: 'Archive', variant: 'ghost' },
                      {
                        id: 'github.issue.close',
                        label: 'Close',
                        variant: 'destructive',
                        confirmInline: 'Confirm close?',
                      },
                    ],
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
                  // Runtime resolver action list (separate from the Queue
                  // `props.actions` button declarations) — the dispatcher
                  // walks this to wire `onAction(actionId, item)`.
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
                  // `RepoTable` (the dense table with hover-card row previews
                  // and per-row "Create issue" deep-links) collapsed onto
                  // baseline `<Table>` in the marketplace pivot. The table's
                  // row template is the host's responsibility on the React
                  // side (cell renderers); the manifest declares structure +
                  // capability binding only.
                  component: 'Table',
                  props: {
                    caption: 'Repositories',
                    columns: [
                      { key: 'full_name', header: 'Repository' },
                      { key: 'stargazers_count', header: 'Stars' },
                      { key: 'open_issues_count', header: 'Open issues' },
                    ],
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
                  // Marketplace pivot: see `/today` above. The inbox is the
                  // same baseline `<Queue>` shape, just bound to a different
                  // filter on `github.issue.list`. Single declarative action
                  // (Archive); the close affordance is `/today`-only.
                  component: 'Queue',
                  props: {
                    title: 'Inbox',
                    actions: [{ id: 'github.issue.archive', label: 'Archive', variant: 'ghost' }],
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
