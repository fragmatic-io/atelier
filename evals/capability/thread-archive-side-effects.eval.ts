// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The Atelier Authors
/**
 * Capability eval: `thread.archive` declares the right side effects and
 * confirmation policy.
 *
 * Per `apps/demo/lib/fake-capabilities.ts` and the AGENTS.md hard rule
 * "destructive actions require confirmation", `thread.archive` MUST:
 *  - emit `archive` and `mutates:thread_state` as side effects
 *  - declare `confirmation: 'modal'` so the dispatcher portal handles it
 *  - declare `permissions: ['thread:write']`
 */

import { defineEval } from '@atelier/evals';
import { CAPABILITIES } from '../../apps/demo/lib/fake-capabilities';

export default defineEval({
  id: 'capability/thread-archive/side-effects',
  description:
    'thread.archive declares archive + mutates:thread_state side effects with modal confirmation.',
  kind: 'capability',
  tags: ['thread', 'destructive'],
  input: 'thread.archive',
  run: (id: string) => CAPABILITIES[id],
  expected: (cap: unknown): boolean => {
    if (!cap || typeof cap !== 'object') return false;
    const c = cap as {
      side_effects?: readonly string[];
      confirmation?: string;
      permissions?: readonly string[];
      kind?: string;
    };
    const se = c.side_effects ?? [];
    return (
      c.kind === 'action' &&
      c.confirmation === 'modal' &&
      se.length === 2 &&
      se.includes('archive') &&
      se.includes('mutates:thread_state') &&
      Array.isArray(c.permissions) &&
      c.permissions.includes('thread:write')
    );
  },
});
