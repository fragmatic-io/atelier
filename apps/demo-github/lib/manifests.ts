// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Hand-written manifests for `apps/demo-github`. The compiler's fallback
 * compiler delegates to `manifestForRoute()` when no LLM is configured.
 *
 * Each manifest exercises Wave 6/7 features the demo showcases:
 *  - `/today`: <List> with `data-emphasis="hero"` on the top 3 (hierarchy
 *    treatment), bulk-action bar wrapping the rows, status bar pill
 *    surfacing rate-limit health, and a sibling `<StatCard>` exposing the
 *    `github.api.rate_limit` quota for `rate_limited_actions_show_state`.
 *  - `/repos`: <Table> with hover-card popovers (HoverCard wraps each
 *    row's name).
 *  - `/issue/[id]`: <DetailView> with comments timeline + action bar; the
 *    body field renders mentions as hover cards. The action bar pairs the
 *    destructive `github.issue.close` with its `github.issue.reopen`
 *    rollback sibling so `reversibility_surfaced` is satisfied.
 *  - `/issue/new`: compact <Form> for creating issues, with a sibling
 *    rate-limit chip for the `github.issue.create` quota.
 *  - `/inbox`: notifications surface using the inbox-zero skill.
 *
 * Every data-bound component (`List`, `Table`, `DetailView`, `KPIRow`,
 * `Timeline`) carries empty / loading / error sibling handlers so the
 * baseline `empty_loading_error_handled` policy is satisfied.
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

function statusBarNode(): LayoutNode {
  return {
    component: 'StatusBar',
    props: {
      status: 'operational',
      message: 'GitHub API · 5000 / 5000',
      detail: 'Authenticated rate-limit window resets hourly.',
      variant: 'compact',
    },
    children: [],
  };
}

/**
 * Rate-limit chip. Bound to `github.api.rate_limit` so the
 * `rate_limited_actions_show_state` policy sees a quota source as a
 * sibling of any node that dispatches `issue.create` / `issue.close` /
 * `issue.bulk_close`.
 *
 * The runtime resolves `github.api.rate_limit` from the GitHub
 * `X-RateLimit-Remaining` / `X-RateLimit-Limit` response headers (or
 * falls back to a hardcoded 5000 / 5000 when no token is configured —
 * see `lib/github-client.ts`).
 */
function rateLimitChipNode(): LayoutNode {
  return {
    component: 'StatCard',
    props: {
      label: 'API rate limit',
      hint: 'Remaining requests in the current window.',
      variant: 'compact',
    },
    data: {
      source: 'github.api.rate_limit',
    },
    children: [],
  };
}

function emptyStateNode(title: string, body: string): LayoutNode {
  return {
    component: 'EmptyState',
    props: { title, body },
    children: [],
  };
}

function loadingNode(): LayoutNode {
  return {
    component: 'Skeleton',
    props: { rows: 4, variant: 'list' },
    children: [],
  };
}

function errorAlertNode(): LayoutNode {
  return {
    component: 'Alert',
    props: {
      severity: 'error',
      title: 'Failed to load',
      body: 'Could not reach the GitHub API. Check your token in /settings/github.',
    },
    children: [],
  };
}

function navNode(): LayoutNode {
  return {
    component: 'NavBar',
    props: {
      title: 'Octant',
      links: [
        { label: 'Today', href: '/today' },
        { label: 'Repos', href: '/repos' },
        { label: 'Inbox', href: '/inbox' },
        { label: 'New issue', href: '/issue/new' },
        { label: 'Settings', href: '/settings/github' },
      ],
    },
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
            navNode(),
            statusBarNode(),
            rateLimitChipNode(),
            {
              component: 'KPIRow',
              props: {
                stats: [
                  { label: 'Open issues', value: '12', delta: { tone: 'down', value: '-2' } },
                  { label: 'Assigned to me', value: '6' },
                  { label: 'High priority', value: '2', delta: { tone: 'up', value: '+1' } },
                ],
              },
              data: { source: 'github.issue.summary' },
              children: [],
            },
            // Empty / loading / error siblings for KPIRow + List below.
            emptyStateNode('No metrics yet', 'KPIs populate after first sync.'),
            loadingNode(),
            errorAlertNode(),
            {
              component: 'BulkActionBar',
              props: {
                actions: [
                  {
                    id: 'github.issue.archive',
                    label: 'Archive',
                  },
                  {
                    id: 'github.issue.bulk_close',
                    label: 'Close',
                    variant: 'destructive',
                    confirmation: 'verbal_required',
                  },
                ],
              },
              children: [],
            },
            {
              component: 'List',
              props: {
                emphasis: 'hierarchy',
                hero_count: 3,
                selectable: true,
              },
              data: {
                source: 'github.issue.list',
                filter: 'state = "open" AND requires_decision = true',
                sort: 'salience desc',
              },
              actions: ['github.issue.archive', 'github.issue.close'],
              children: [],
            },
            // Reversibility — `UndoToast` is an ambient affordance the
            // `reversibility_surfaced` policy explicitly accepts. One node
            // covers every reversible action surfaced in this route.
            {
              component: 'UndoToast',
              props: { duration_ms: 5000, variant: 'inline' },
              children: [],
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
            navNode(),
            statusBarNode(),
            rateLimitChipNode(),
            {
              component: 'FilterBar',
              props: {
                filters: [
                  {
                    id: 'visibility',
                    label: 'Visibility',
                    type: 'select',
                    options: [
                      { value: 'all', label: 'All' },
                      { value: 'public', label: 'Public' },
                      { value: 'private', label: 'Private' },
                    ],
                  },
                ],
              },
              children: [],
            },
            {
              component: 'Table',
              props: {
                columns: [
                  { id: 'name', label: 'Repository' },
                  { id: 'description', label: 'Description' },
                  { id: 'open_issues_count', label: 'Open' },
                  { id: 'updated_at', label: 'Updated' },
                ],
                hoverCard: true,
                // `issue.create` carries the `post` side-effect; gate the
                // node-level dispatch behind a modal so
                // `confirmation_required_for_destructive` is satisfied.
                confirmation: 'modal',
              },
              data: {
                source: 'github.repo.list',
                sort: 'stargazers_count desc',
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
            emptyStateNode('No repositories', 'Connect a GitHub token to load your repos.'),
            loadingNode(),
            errorAlertNode(),
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
            navNode(),
            statusBarNode(),
            rateLimitChipNode(),
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
            // `UndoToast` covers the transitive case (reopen rolls back to
            // close, unarchive to archive — the policy accepts the ambient
            // toast as the rollback affordance for those too).
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
            emptyStateNode('Issue not found', 'The referenced issue may have been deleted.'),
            loadingNode(),
            errorAlertNode(),
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
            navNode(),
            statusBarNode(),
            rateLimitChipNode(),
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
                // `issue.create` is destructive (`post` side-effect); gate
                // it behind a modal at the form level.
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
            navNode(),
            statusBarNode(),
            rateLimitChipNode(),
            {
              component: 'List',
              props: {
                emphasis: 'inbox-zero',
                selectable: true,
              },
              data: {
                source: 'github.issue.list',
                filter: 'state = "open" AND mentioned_me = true',
                sort: 'updated_at desc',
              },
              actions: ['github.issue.archive'],
              children: [],
            },
            // Ambient reversibility affordance for issue.archive.
            {
              component: 'UndoToast',
              props: { duration_ms: 5000, variant: 'inline' },
              children: [],
            },
            emptyStateNode('Inbox zero', 'You are caught up. Last sync just now.'),
            loadingNode(),
            errorAlertNode(),
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
