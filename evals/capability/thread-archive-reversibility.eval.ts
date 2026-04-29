// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
/**
 * Capability eval: `thread.archive` is reversible and rolls back via
 * `thread.unarchive`.
 *
 * The dispatcher consults `capability.reversible` and `capability.rollback`
 * to decide whether to push an undo entry. If those drift the UndoBar
 * stops working — that's the failure mode this eval guards against.
 */

import { defineEval } from '@cir/evals';
import { CAPABILITIES } from '../../apps/demo/lib/fake-capabilities';

export default defineEval({
  id: 'capability/thread-archive/reversibility',
  description: 'thread.archive is reversible and points to thread.unarchive as its rollback.',
  kind: 'capability',
  tags: ['thread', 'reversibility'],
  input: 'thread.archive',
  run: (id: string) => {
    const cap = CAPABILITIES[id];
    return {
      reversible: cap?.reversible,
      rollback: cap?.rollback,
    };
  },
  expected: { reversible: true, rollback: 'thread.unarchive' },
});
