// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
/**
 * Hand-written manifests that stand in for the Phase 5 LLM-backed compiler.
 * Returned from `app/api/manifest/[...slug]/route.ts` so the runtime's
 * fetcher exercises the real cold-path flow.
 */

import type { Manifest } from '@cir/schemas';

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

export function todayManifest(): Manifest {
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

export function manifestForRoute(route: string): Manifest | null {
  if (route === '/today') return todayManifest();
  return null;
}
