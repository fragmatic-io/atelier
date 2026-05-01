// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Hand-written manifests for `apps/demo-github`. The compiler's fallback
 * compiler delegates to `manifestForRoute()` when no LLM is configured.
 *
 * Each manifest exercises Wave 6/7 features the demo showcases:
 *  - `/today`: <List> with `data-emphasis="hero"` on the top 3 (hierarchy
 *    treatment), bulk-action bar wrapping the rows, status bar pill
 *    surfacing rate-limit health.
 *  - `/repos`: <Table> with hover-card popovers (HoverCard wraps each
 *    row's name).
 *  - `/issue/[id]`: <DetailView> with comments timeline + action bar; the
 *    body field renders mentions as hover cards.
 *  - `/issue/new`: compact <Form> for creating issues.
 *  - `/inbox`: notifications surface using the inbox-zero skill.
 *
 * The manifests intentionally do NOT exercise the full breadth of the
 * compiler's possible outputs — they are shaped to match the prose in
 * the showcase README so reviewers can map prose to manifest one-to-one.
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

function navNode(): LayoutNode {
  return {
    component: 'NavBar',
    props: {
      title: 'GitHub Reviewer',
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
    manifest_id: 'm_demo_github_today',
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
            {
              component: 'KPIRow',
              props: {
                stats: [
                  { label: 'Open issues', value: '12', delta: { tone: 'down', value: '-2' } },
                  { label: 'Assigned to me', value: '6' },
                  { label: 'High priority', value: '2', delta: { tone: 'up', value: '+1' } },
                ],
              },
              children: [],
            },
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
            {
              component: 'EmptyState',
              props: {
                title: 'Queue clear',
                body: 'Nothing needs a decision right now.',
              },
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
    manifest_id: 'm_demo_github_repos',
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
              },
              data: {
                source: 'github.repo.list',
                sort: 'stargazers_count desc',
              },
              actions: ['github.issue.create'],
              children: [],
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
    manifest_id: `m_demo_github_issue_${id}`,
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
              children: [],
            },
            {
              component: 'ButtonGroup',
              props: {
                buttons: [
                  { id: 'github.issue.close', label: 'Close issue', variant: 'destructive' },
                  { id: 'github.issue.archive', label: 'Archive', variant: 'secondary' },
                ],
              },
              children: [],
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
    manifest_id: 'm_demo_github_issue_new',
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
              },
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
    manifest_id: 'm_demo_github_inbox',
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
            {
              component: 'EmptyState',
              props: {
                title: 'Inbox zero',
                body: "You're caught up. Last sync just now.",
              },
              children: [],
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
