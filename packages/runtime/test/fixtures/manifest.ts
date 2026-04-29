// Fixture manifest mirroring docs/artifacts.md §Render. Shared by render
// plan tests and resolver tests.

import type { Capability, Manifest } from '@cir/schemas';

export function fixtureManifest(): Manifest {
  return {
    manifest_id: 'm_8f3a2b1c',
    user_id: 'vid',
    app_id: 'mail.example.com',
    compiled_from: {
      capability_version: '2.1.0',
      skill_versions: { 'email-triage': '1.4.0', 'smart-reply': '0.9.2' },
      component_catalog_version: '3.0.0',
      intent_profile_version: 47,
      compiler_model: 'claude-opus-4-7',
      compiled_at: '2026-04-29T12:00:00Z',
    },
    ttl: null,
    invalidates_on: [
      'capability_schema_change:mail.example.com:>=2.2.0',
      'intent_profile_change:vid:lens.email',
      'explicit_user_request:m_8f3a2b1c',
    ],
    routes: [
      { path: '/', redirect: '/today' },
      {
        path: '/today',
        title: 'Today',
        layout: {
          component: 'Stack',
          children: [
            {
              component: 'DecisionQueue',
              data: {
                source: 'thread.list',
                filter: 'requires_decision = true AND received_after = today_start',
                sort: 'urgency desc',
              },
              actions: ['task.create_from_thread', 'thread.archive', 'draft.create'],
            },
            {
              component: 'TaskQueue',
              data: {
                source: 'task.list',
                filter: 'due_within = 7d AND status != done',
                group_by: 'due_date',
              },
              actions: ['task.complete', 'task.snooze'],
            },
          ],
        },
        refresh: {
          data: 'on_focus + 60s_interval',
          structure: 'never_unless_invalidated',
        },
      },
    ],
    policies_satisfied: [
      'no_destructive_actions_without_confirm',
      'no_send_without_review',
      'data_scope_within_grant',
    ],
    rollback_to: 'm_8f3a2b1b',
  };
}

export function fixtureCapabilities(): Record<string, Capability> {
  return {
    'thread.archive': {
      id: 'thread.archive',
      kind: 'action',
      version: '2.1.0',
      input: { thread_id: 'string' },
      output: { archived_at: 'string' },
      side_effects: ['archive', 'mutates:thread_state'],
      permissions: ['thread:write'],
      confirmation: 'none',
      reversible: true,
      rollback: 'thread.unarchive',
    },
    'thread.unarchive': {
      id: 'thread.unarchive',
      kind: 'action',
      version: '2.1.0',
      input: { thread_id: 'string' },
      output: {},
      side_effects: ['mutates:thread_state'],
      permissions: ['thread:write'],
      confirmation: 'none',
      reversible: true,
      rollback: 'thread.archive',
    },
    'mail.send': {
      id: 'mail.send',
      kind: 'action',
      version: '1.0.0',
      input: { draft_id: 'string' },
      output: { message_id: 'string' },
      side_effects: ['send'],
      permissions: ['mail:send'],
      confirmation: 'modal',
      rate_limit: '100/min/user',
      reversible: false,
    },
    'task.delete': {
      id: 'task.delete',
      kind: 'action',
      version: '1.0.0',
      input: { task_id: 'string' },
      output: {},
      side_effects: ['delete'],
      permissions: ['task:write'],
      confirmation: 'modal',
      reversible: false,
    },
    'task.read': {
      id: 'task.read',
      kind: 'data',
      version: '1.0.0',
      input: {},
      output: {},
      side_effects: [],
      permissions: ['task:read'],
      confirmation: 'none',
      reversible: false,
    },
  };
}
