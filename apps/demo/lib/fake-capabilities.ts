// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Capability metadata for the demo. Mirrors the `Capability` schema in
 * `@cir/schemas`. The runtime's `ActionDispatcher` reads this to decide
 * whether confirmation is required, whether the action is reversible,
 * and what side effects to declare on the audit event.
 *
 * In a real CIR app the registry is published per-app under
 * `/.well-known/cir.json` -> `capabilities_url` and the compiler signs it.
 */

import type { Capability } from '@cir/schemas';

export const CAPABILITIES: Record<string, Capability> = {
  'thread.list': {
    id: 'thread.list',
    kind: 'data',
    version: '1.0.0',
    input: {},
    output: {},
    side_effects: ['reads:thread_list'],
    permissions: ['thread:read'],
    confirmation: 'none',
    reversible: false,
  },
  'thread.get': {
    id: 'thread.get',
    kind: 'data',
    version: '1.0.0',
    input: { thread_id: 'string' },
    output: {},
    side_effects: ['reads:thread'],
    permissions: ['thread:read'],
    confirmation: 'none',
    reversible: false,
  },
  'thread.archive': {
    id: 'thread.archive',
    kind: 'action',
    version: '1.0.0',
    input: { thread_id: 'string' },
    output: { archived_at: 'datetime' },
    side_effects: ['archive', 'mutates:thread_state'],
    permissions: ['thread:write'],
    // The policy engine requires destructive actions to bind through
    // ConfirmDialog OR carry confirmation: 'modal'. We pick 'modal' so
    // the dispatcher's portal handles it without the manifest needing
    // a wrapping ConfirmDialog component.
    confirmation: 'modal',
    reversible: true,
    rollback: 'thread.unarchive',
  },
  'task.list': {
    id: 'task.list',
    kind: 'data',
    version: '1.0.0',
    input: {},
    output: {},
    side_effects: ['reads:task_list'],
    permissions: ['task:read'],
    confirmation: 'none',
    reversible: false,
  },
  'task.complete': {
    id: 'task.complete',
    kind: 'action',
    version: '1.0.0',
    input: { task_id: 'string' },
    output: { completed_at: 'datetime' },
    side_effects: ['mutates:task_state'],
    permissions: ['task:write'],
    confirmation: 'none',
    reversible: true,
    rollback: 'task.reopen',
  },
  'task.snooze': {
    id: 'task.snooze',
    kind: 'action',
    version: '1.0.0',
    input: { task_id: 'string', days: 'number' },
    output: { new_due_date: 'string' },
    side_effects: ['mutates:task_state'],
    permissions: ['task:write'],
    confirmation: 'none',
    reversible: true,
    rollback: 'task.unsnooze',
  },
  'task.create_from_thread': {
    id: 'task.create_from_thread',
    kind: 'action',
    version: '1.0.0',
    input: { thread_id: 'string' },
    output: { task_id: 'string' },
    side_effects: ['mutates:task_state'],
    permissions: ['task:write'],
    confirmation: 'none',
    reversible: true,
    rollback: 'task.delete',
  },
};
