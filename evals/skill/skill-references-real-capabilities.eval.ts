// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
/**
 * Skill eval: every capability id a skill claims to use must exist in the
 * demo's CAPABILITIES record.
 *
 * If a skill drifts ahead of the capability registry (renames, deletions),
 * the compiler would call into a missing handler at orchestration time.
 * Catch that during evals — capability ids are part of the skill contract
 * and should never be aspirational.
 */

import { defineEval } from '@cir/evals';
import { parseSkillMarkdown } from '@cir/schemas';
import { CAPABILITIES } from '../../apps/demo/lib/fake-capabilities';

const SKILL_SOURCE = `---
name: task-management
version: 1.0.0
description: Move tasks forward — complete, snooze, or spin up from a thread.
capabilities_used:
  - task.list
  - task.complete
  - task.snooze
  - task.create_from_thread
when_to_use: When the user is on /today and wants to clear or defer near-term tasks.
when_not_to_use: Skip when the user is reviewing historical (completed) tasks.
example_flow: |
  1. Read task.list filtered to due_within = 7d.
  2. Offer Complete, Snooze, and Reopen affordances per row.
known_failure_modes:
  - Snoozing past due dates without surfacing the new due date.
---

# Task management

Wraps the four task capabilities the demo exposes.
`;

export default defineEval({
  id: 'skill/task-management/references-real-capabilities',
  description: 'Every capability id in capabilities_used resolves against CAPABILITIES.',
  kind: 'skill',
  tags: ['contract'],
  input: SKILL_SOURCE,
  run: (source: string) => {
    const parsed = parseSkillMarkdown(source);
    const known = new Set(Object.keys(CAPABILITIES));
    const missing = parsed.skill.capabilities_used.filter((id) => !known.has(id));
    return {
      missing,
      total: parsed.skill.capabilities_used.length,
    };
  },
  expected: (output: unknown): boolean => {
    const o = output as { missing: string[]; total: number };
    return o.missing.length === 0 && o.total > 0;
  },
});
