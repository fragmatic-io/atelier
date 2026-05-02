// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Reference manifests for `apps/demo` — kept as a host-authored example of
 * what a baseline-only composition looks like, exercised by
 * `test/fake-manifests.test.ts`.
 *
 * Marketplace pivot: every node here is a baseline component shipped in
 * `@atelier/components`. The previous Aurora demo wired four custom bindings
 * (`DecisionQueue`, `TaskQueue`, `ThreadView`, `UndoBar`) — they're gone:
 *
 *   - `DecisionQueue` / `TaskQueue` → `<Queue>` baseline (capability binding +
 *     declarative `actions` array per row).
 *   - `ThreadView` → `<Stack>` + `<NavBar>` + `<Markdown>` + `<ChatThread>`
 *     pure composition.
 *   - `UndoBar` → ambient runtime service (mounted in `atelier-providers.tsx`,
 *     declared via `ambient_policy_satisfiers`).
 *
 * Headers compose as `<Stack direction="horizontal">` of `<Logo>` (brand
 * mark + wordmark) + `<NavBar>` (nav items). Both are baseline.
 *
 * The runtime never serves these manifests — Gemini compiles every route,
 * with the framework's `GenericFallbackCompiler` as the cascade tail. Hosts
 * inspect this file as a worked example of "what a zero-custom demo looks
 * like" and the test suite uses it as a fixture.
 */

import type { Manifest, LayoutNode } from '@atelier/schemas';
import { getStore } from './fake-data';

const COMPILED_FROM = {
  capability_version: '1.0.0',
  skill_versions: {},
  component_catalog_version: '1.0.0',
  intent_profile_version: 1,
  compiler_model: 'reference-baseline-composition',
  compiled_at: '2026-04-29T12:00:00Z',
};

const INVALIDATES_ON = [
  'capability_schema_change:cir.demo:>=1.1.0',
  'intent_profile_change:demo-user:lens.email',
];

const POLICIES_SATISFIED = ['data_access_within_grant', 'confirmation_required_for_destructive'];

/** Snapshot the in-memory store for the KPI row. Pure read; no mutation. */
function todayKpiStats(): { open: number; dueToday: number; mentions: number } {
  const store = getStore();
  const open = store.threads.filter((t) => t.requires_decision && !t.archived).length;
  const today = new Date().toISOString().slice(0, 10);
  const dueToday = store.tasks.filter((t) => t.status === 'open' && t.due_date <= today).length;
  // The fake store has no concept of "mentions" — we surface a stable
  // pseudo-count derived from the open thread set so the row has variety
  // without leaking PII. Real apps would wire this to a notifications
  // capability.
  const mentions = store.threads.filter((t) => !t.archived).length - open;
  return { open, dueToday, mentions: Math.max(0, mentions) };
}

/**
 * Compose the Aurora header: `<Logo>` brand lockup on the left, `<NavBar>`
 * nav items on the right. Pure baseline — no `OctantHeader` / `MarigoldHeader`
 * / `Wordmark` per-host customs.
 */
function auroraHeader(activePath: '/today' | '/settings/intent' | 'thread'): LayoutNode {
  return {
    component: 'Stack',
    props: { direction: 'horizontal', gap: 'md', align: 'center' },
    children: [
      {
        component: 'Logo',
        props: {
          glyph: '\u{1F30C}', // Milky Way — Aurora's brand glyph
          wordmark: 'Aurora',
          size: 'md',
          href: '/today',
        },
        children: [],
      },
      {
        component: 'NavBar',
        props: {
          items: [
            { label: 'Today', href: '/today', active: activePath === '/today' },
            {
              label: 'Settings',
              href: '/settings/intent',
              active: activePath === '/settings/intent',
            },
          ],
        },
        children: [],
      },
    ],
  };
}

export function todayManifest(): Manifest {
  const stats = todayKpiStats();
  return {
    manifest_id: 'm_demo_today',
    user_id: 'demo-user',
    app_id: 'cir.demo',
    compiled_from: COMPILED_FROM,
    ttl: null,
    invalidates_on: INVALIDATES_ON,
    policies_satisfied: POLICIES_SATISFIED,
    routes: [
      {
        path: '/today',
        title: 'Today',
        layout: {
          component: 'Container',
          props: { maxWidth: 'md' },
          children: [
            {
              component: 'Stack',
              props: { direction: 'vertical', gap: 'lg' },
              children: [
                auroraHeader('/today'),
                {
                  component: 'KPIRow',
                  props: {
                    stats: [
                      { id: 'open', label: 'Open decisions', value: String(stats.open) },
                      { id: 'due', label: 'Due today', value: String(stats.dueToday) },
                      { id: 'mentions', label: 'Mentions', value: String(stats.mentions) },
                    ],
                  },
                  children: [],
                },
                {
                  component: 'Alert',
                  props: { severity: 'info', title: 'Welcome to the Atelier demo' },
                  children: [],
                },
                // Decision queue — Queue baseline, bound to thread.list with
                // declarative per-row actions. Replaces the old DecisionQueue
                // custom binding.
                //
                // Wave 7 / P-8 — exercises the new `loading_state` /
                // `empty_state` / `error_state` slots on the `data` binding.
                // The render walker substitutes these `LayoutNode`s in place
                // of the Queue while the resolver is loading, returns zero
                // rows, or errors; without them the framework's
                // `BASELINE_RESOLVER_DEFAULTS` (`<Skeleton>`, `<EmptyState>`,
                // `<Alert>`) would render instead.
                {
                  component: 'Queue',
                  props: {
                    title: 'Decisions to make today',
                    actions: [
                      {
                        id: 'task.create_from_thread',
                        label: 'Make task',
                        variant: 'secondary',
                      },
                      { id: 'thread.archive', label: 'Archive', variant: 'destructive' },
                    ],
                  },
                  data: {
                    source: 'thread.list',
                    filter: 'requires_decision = true',
                    loading_state: {
                      component: 'Skeleton',
                      props: { shape: 'card-row', count: 3 },
                      children: [],
                    },
                    empty_state: {
                      component: 'EmptyState',
                      props: {
                        title: 'Inbox zero',
                        description: 'No decisions waiting today. Check back after lunch.',
                      },
                      children: [],
                    },
                    error_state: {
                      component: 'Alert',
                      props: {
                        severity: 'error',
                        title: 'Couldn’t load decisions',
                      },
                      children: [],
                    },
                  },
                  actions: ['task.create_from_thread', 'thread.archive'],
                  children: [],
                },
                // Task queue — same Queue primitive, different binding +
                // actions. Replaces the old TaskQueue custom binding.
                {
                  component: 'Queue',
                  props: {
                    title: 'Your tasks',
                    actions: [
                      { id: 'task.complete', label: 'Done', variant: 'secondary' },
                      { id: 'task.snooze', label: 'Snooze', variant: 'ghost' },
                    ],
                  },
                  data: {
                    source: 'task.list',
                    filter: 'due_within = 7d',
                    group_by: 'due_date',
                  },
                  actions: ['task.complete', 'task.snooze'],
                  children: [],
                },
                // No `<UndoBar>` node any more — the Aurora app mounts an
                // ambient `<UndoBar>` at the React root and declares
                // `UNDO_TOAST_AMBIENT_SATISFIER` on the policy context, which
                // satisfies `reversibility_surfaced` for every reversible
                // action this route invokes.
              ],
            },
          ],
        },
        refresh: {
          data: 'on_focus + 60s_interval',
          structure: 'never_unless_invalidated',
        },
      },
    ],
  };
}

export function threadManifest(id: string): Manifest {
  return {
    manifest_id: `m_demo_thread_${id}`,
    user_id: 'demo-user',
    app_id: 'cir.demo',
    compiled_from: COMPILED_FROM,
    ttl: null,
    invalidates_on: INVALIDATES_ON,
    policies_satisfied: POLICIES_SATISFIED,
    routes: [
      {
        path: `/thread/${id}`,
        title: 'Thread',
        layout: {
          component: 'Container',
          props: { maxWidth: 'md' },
          children: [
            {
              component: 'Stack',
              props: { direction: 'vertical', gap: 'md' },
              children: [
                auroraHeader('thread'),
                {
                  component: 'Markdown',
                  props: { content: `# Thread \`${id}\`` },
                  children: [],
                },
                // Action row — pure ButtonGroup composition. Each Button
                // dispatches a capability via the manifest's `actions` array
                // (the runtime resolves the binding by id).
                {
                  component: 'ButtonGroup',
                  props: {},
                  children: [
                    {
                      component: 'Button',
                      props: { variant: 'secondary', children: 'Make task' },
                      actions: ['task.create_from_thread'],
                      children: [],
                    },
                    {
                      component: 'Button',
                      props: { variant: 'destructive', children: 'Archive' },
                      actions: ['thread.archive'],
                      children: [],
                    },
                  ],
                },
                // Messages — ChatThread baseline. Resolver threads
                // `data: thread.get` (whole thread) and the renderer feeds
                // `data.thread.messages` into ChatThread's `messages` prop.
                // For this reference manifest the binding is the whole
                // `thread.get` capability; production hosts can publish a
                // `thread.messages` capability that returns the array
                // directly.
                {
                  component: 'ChatThread',
                  data: {
                    source: 'thread.get',
                    filter: `id = "${id}"`,
                  },
                  children: [],
                },
                // Same ambient-undo coverage as /today.
              ],
            },
          ],
        },
        refresh: {
          data: 'on_focus',
          structure: 'never_unless_invalidated',
        },
      },
    ],
  };
}

const THREAD_ROUTE_RE = /^\/thread\/([\w-]+)$/;

export function manifestForRoute(route: string): Manifest | null {
  if (route === '/today') return todayManifest();
  const m = THREAD_ROUTE_RE.exec(route);
  if (m && m[1]) return threadManifest(m[1]);
  return null;
}
