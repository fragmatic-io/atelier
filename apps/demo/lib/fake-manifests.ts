// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Hand-written manifests that stand in for the Phase 5 LLM-backed compiler.
 * Returned from `app/api/manifest/[...slug]/route.ts` so the runtime's
 * fetcher exercises the real cold-path flow.
 *
 * DX-A polish: the `/today` manifest now opens with a `<NavBar>` and a
 * `<KPIRow>` (3 stats) above the existing decision queue + task queue.
 * The KPIRow values are inlined as static strings — production hosts wire
 * the same row to a `system.metrics` capability via a `data` binding so the
 * stats stay live.
 */

import type { Manifest } from '@cir/schemas';
import { getStore } from './fake-data';

const COMPILED_FROM = {
  capability_version: '1.0.0',
  skill_versions: {},
  component_catalog_version: '1.0.0',
  intent_profile_version: 1,
  compiler_model: 'fake-compiler-v0',
  compiled_at: '2026-04-29T12:00:00Z',
};

const INVALIDATES_ON = [
  'capability_schema_change:cir.demo:>=1.1.0',
  'intent_profile_change:demo-user:lens.email',
];

const POLICIES_SATISFIED = ['data_access_within_grant', 'confirmation_required_for_destructive'];

/**
 * Snapshot the in-memory store for the KPI row. Pure read; no mutation.
 * Returns plain strings so the manifest stays JSON-safe (the runtime
 * accepts `ReactNode` for `KPIStat.value` but the wire is JSON).
 */
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
                {
                  component: 'NavBar',
                  props: {
                    items: [
                      { label: 'Today', href: '/today', active: true },
                      { label: 'Settings', href: '/settings/intent' },
                    ],
                    brand: 'Decision queue',
                  },
                  children: [],
                },
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
                  props: {
                    severity: 'info',
                    title: 'Welcome to the CIR demo',
                  },
                  children: [],
                },
                {
                  component: 'DecisionQueue',
                  data: {
                    source: 'thread.list',
                    filter: 'requires_decision = true',
                  },
                  actions: ['task.create_from_thread', 'thread.archive'],
                  children: [],
                },
                {
                  component: 'TaskQueue',
                  data: {
                    source: 'task.list',
                    filter: 'due_within = 7d',
                    group_by: 'due_date',
                  },
                  actions: ['task.complete', 'task.snooze'],
                  children: [],
                },
                // Required by `reversibility_surfaced` policy: every reversible
                // action in this route needs an undo affordance somewhere in
                // the layout. UndoBar covers all four (thread.archive,
                // task.create_from_thread, task.complete, task.snooze).
                { component: 'UndoBar', children: [] },
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
              component: 'ThreadView',
              data: {
                source: 'thread.get',
                filter: `id = "${id}"`,
              },
              actions: ['thread.archive', 'task.create_from_thread'],
              children: [],
            },
            // Same reversibility coverage as /today.
            { component: 'UndoBar', children: [] },
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
