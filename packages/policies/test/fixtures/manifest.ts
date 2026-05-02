// Test fixtures shared across policy specs.
// Mirror the manifest example from /Users/vid/cir/docs/artifacts.md §Render
// and a small set of capabilities/intent the policies need to evaluate it.

import type { Capability, Manifest } from '@atelier/schemas';
import type { PolicyContext } from '../../src/result.js';

export function baselineManifest(): Manifest {
  return {
    manifest_id: 'm_8f3a2b1c',
    user_id: 'vid',
    app_id: 'mail.example.com',
    compiled_from: {
      capability_version: '2.1.0',
      skill_versions: {
        'email-triage': '1.4.0',
        'smart-reply': '0.9.2',
      },
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
      {
        path: '/',
        redirect: '/today',
      },
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
            // Ambient undo affordance covers the reversible mutations
            // surfaced above. Mirrors the intent-vault contract that every
            // reversible action gets an undo path (ETHOS principle 8).
            { component: 'UndoBar' },
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

export function baselineCapabilities(): Record<string, Capability> {
  return {
    'thread.list': {
      id: 'thread.list',
      kind: 'data',
      version: '2.1.0',
      input: { filter: 'string' },
      output: { id: 'string', subject: 'string', sender: 'string' },
      side_effects: [],
      permissions: ['thread:read'],
      confirmation: 'none',
      reversible: false,
    },
    'task.list': {
      id: 'task.list',
      kind: 'data',
      version: '1.0.0',
      input: { filter: 'string' },
      output: { id: 'string', title: 'string', due_date: 'string' },
      side_effects: [],
      permissions: ['task:read'],
      confirmation: 'none',
      reversible: false,
    },
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
    'task.create_from_thread': {
      id: 'task.create_from_thread',
      kind: 'action',
      version: '1.0.0',
      input: { thread_id: 'string' },
      output: { task_id: 'string' },
      side_effects: ['mutates:tasks'],
      permissions: ['task:write'],
      confirmation: 'none',
      reversible: true,
      rollback: 'task.delete',
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
    'task.complete': {
      id: 'task.complete',
      kind: 'action',
      version: '1.0.0',
      input: { task_id: 'string' },
      output: {},
      side_effects: ['mutates:tasks'],
      permissions: ['task:write'],
      confirmation: 'none',
      reversible: true,
      rollback: 'task.uncomplete',
    },
    'task.snooze': {
      id: 'task.snooze',
      kind: 'action',
      version: '1.0.0',
      input: { task_id: 'string', until: 'string' },
      output: {},
      side_effects: ['mutates:tasks'],
      permissions: ['task:write'],
      confirmation: 'none',
      reversible: true,
      rollback: 'task.unsnooze',
    },
    'draft.create': {
      id: 'draft.create',
      kind: 'action',
      version: '1.0.0',
      input: { thread_id: 'string' },
      output: { draft_id: 'string' },
      side_effects: ['mutates:drafts'],
      permissions: ['mail:write'],
      confirmation: 'none',
      reversible: true,
      rollback: 'draft.discard',
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
  };
}

export function baselineIntent(): PolicyContext['intent'] {
  return {
    user_id: 'vid',
    global_preferences: {
      density: 'compact',
      color_mode: 'system',
    },
    granted_fields: [
      'thread.list.*',
      'task.list.*',
      // mutating capabilities project IDs/timestamps that the user has
      // implicitly granted by allowing the action; the policy still checks
      // explicit data sources, not action outputs.
    ],
  };
}

/**
 * A clean baseline context that should pass every baseline policy.
 * Tests mutate copies for negative cases.
 */
export function baselineContext(): PolicyContext {
  return {
    manifest: baselineManifest(),
    capabilities: baselineCapabilities(),
    intent: baselineIntent(),
    rate_limited_capability_ids: new Set(),
    pii_fields: new Set(),
  };
}
