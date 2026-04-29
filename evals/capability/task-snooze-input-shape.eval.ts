// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
/**
 * Capability eval: `task.snooze` accepts the right input shape.
 *
 * `task.snooze` is the only demo capability that takes a non-id parameter
 * (`days: number`). This eval keeps the input contract pinned — if a caller
 * later removes `days` or renames it, the TaskQueue UI snooze affordance
 * silently breaks but this eval flags it.
 */

import { defineEval } from '@cir/evals';
import { CAPABILITIES } from '../../apps/demo/lib/fake-capabilities';

export default defineEval({
  id: 'capability/task-snooze/input-shape',
  description:
    'task.snooze accepts { task_id: string, days: number } and rolls back to task.unsnooze.',
  kind: 'capability',
  tags: ['task'],
  input: 'task.snooze',
  run: (id: string) => {
    const cap = CAPABILITIES[id];
    return {
      input: cap?.input,
      output: cap?.output,
      rollback: cap?.rollback,
    };
  },
  expected: {
    input: { task_id: 'string', days: 'number' },
    output: { new_due_date: 'string' },
    rollback: 'task.unsnooze',
  },
});
