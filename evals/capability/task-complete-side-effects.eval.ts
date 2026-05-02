// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The Atelier Authors
/**
 * Capability eval: `task.complete` declares the right side effects and a
 * `task.reopen` rollback.
 *
 * `task.complete` is reversible but NOT destructive — its confirmation is
 * `none` because completing a task can be undone in one click via UndoBar.
 * This eval pins both invariants so a careless edit can't promote it to
 * a destructive action without surfacing the change here.
 */

import { defineEval } from '@atelier/evals';
import { CAPABILITIES } from '../../apps/demo/lib/fake-capabilities';

export default defineEval({
  id: 'capability/task-complete/side-effects',
  description: 'task.complete is reversible, has no confirmation gate, rolls back to task.reopen.',
  kind: 'capability',
  tags: ['task', 'reversibility'],
  input: 'task.complete',
  run: (id: string) => {
    const cap = CAPABILITIES[id];
    return {
      kind: cap?.kind,
      side_effects: cap?.side_effects,
      confirmation: cap?.confirmation,
      reversible: cap?.reversible,
      rollback: cap?.rollback,
      permissions: cap?.permissions,
    };
  },
  expected: {
    kind: 'action',
    side_effects: ['mutates:task_state'],
    confirmation: 'none',
    reversible: true,
    rollback: 'task.reopen',
    permissions: ['task:write'],
  },
});
