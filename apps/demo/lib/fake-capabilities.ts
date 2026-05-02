// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Capability metadata for the demo. Mirrors the `Capability` schema in
 * `@atelier/schemas`. The runtime's `ActionDispatcher` reads this to decide
 * whether confirmation is required, whether the action is reversible,
 * and what side effects to declare on the audit event.
 *
 * In a real Atelier app the registry is published per-app under
 * `/.well-known/cir.json` -> `capabilities_url` and the compiler signs it.
 */

import type { Capability } from '@atelier/schemas';

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
    // Wave 11 / Int-8 — surface an undo toast for 5s after archive.
    undoable: true,
    undo_window_ms: 5000,
  },
  'thread.unarchive': {
    id: 'thread.unarchive',
    kind: 'action',
    version: '1.0.0',
    input: { thread_id: 'string' },
    output: { unarchived_at: 'datetime' },
    side_effects: ['mutates:thread_state'],
    permissions: ['thread:write'],
    confirmation: 'none',
    reversible: true,
    rollback: 'thread.archive',
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
    // Wave 11 / Int-8 — completion is reversible; surface the undo toast.
    undoable: true,
    undo_window_ms: 5000,
  },
  'task.reopen': {
    id: 'task.reopen',
    kind: 'action',
    version: '1.0.0',
    input: { task_id: 'string' },
    output: {},
    side_effects: ['mutates:task_state'],
    permissions: ['task:write'],
    confirmation: 'none',
    reversible: true,
    rollback: 'task.complete',
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
    // Wave 11 / Int-8 — snooze is reversible; surface the undo toast.
    undoable: true,
    undo_window_ms: 5000,
  },
  'task.unsnooze': {
    id: 'task.unsnooze',
    kind: 'action',
    version: '1.0.0',
    input: { task_id: 'string' },
    output: {},
    side_effects: ['mutates:task_state'],
    permissions: ['task:write'],
    confirmation: 'none',
    reversible: true,
    rollback: 'task.snooze',
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
    // Wave 11 / Int-8 — newly-created task can be deleted within the window.
    undoable: true,
    undo_window_ms: 5000,
  },
  'task.delete': {
    id: 'task.delete',
    kind: 'action',
    version: '1.0.0',
    input: { task_id: 'string' },
    output: {},
    side_effects: ['mutates:task_state'],
    permissions: ['task:write'],
    confirmation: 'none',
    reversible: true,
    rollback: 'task.create_from_thread',
  },
};
