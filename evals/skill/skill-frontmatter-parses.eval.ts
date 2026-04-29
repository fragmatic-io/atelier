// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
/**
 * Skill eval: a hand-written `.skill.md` source round-trips through
 * `parseSkillMarkdown` and produces a frontmatter object that satisfies
 * `SkillSchema`.
 *
 * Phase 5c is expected to ship real `.md` skill files under `skills/`.
 * Until then this eval pins the parser contract against a synthetic
 * skill that exercises every required field.
 */

import { defineEval } from '@cir/evals';
import { parseSkillMarkdown } from '@cir/schemas';

const SKILL_SOURCE = `---
name: thread-triage
version: 1.0.0
description: Decide whether an inbound thread becomes a task or is archived.
capabilities_used:
  - thread.list
  - thread.archive
  - task.create_from_thread
when_to_use: When the user opens /today and the inbox shows undecided threads.
when_not_to_use: Skip when the user is in a focused task view; do not interrupt.
example_flow: |
  1. Read thread.list filtered to requires_decision = true.
  2. For each thread offer "Make task" or "Archive".
  3. Confirm before archiving.
known_failure_modes:
  - Confuses follow-ups with new threads when subjects collide.
  - Archives noisy newsletters too aggressively without an undo prompt.
---

# Thread triage

The skill orchestrates the three thread/task capabilities the demo ships.
`;

export default defineEval({
  id: 'skill/thread-triage/frontmatter-parses',
  description: 'parseSkillMarkdown round-trips a hand-written skill into a Skill + body.',
  kind: 'skill',
  tags: ['parser'],
  input: SKILL_SOURCE,
  run: (source: string) => {
    const parsed = parseSkillMarkdown(source);
    return {
      name: parsed.skill.name,
      version: parsed.skill.version,
      capabilities_used: parsed.skill.capabilities_used,
      body_starts_with_heading: parsed.body.startsWith('# '),
      known_failure_count: parsed.skill.known_failure_modes.length,
    };
  },
  expected: {
    name: 'thread-triage',
    version: '1.0.0',
    capabilities_used: ['thread.list', 'thread.archive', 'task.create_from_thread'],
    body_starts_with_heading: true,
    known_failure_count: 2,
  },
});
