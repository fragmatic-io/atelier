// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Skill eval: `skills/inbox-zero.skill.md` parses, validates against
 * `SkillSchema`, and the frontmatter expresses testable workflow gates —
 * `when_to_use` references the "inbox" workflow signal and `when_not_to_use`
 * names the `automation_trust === 'strict'` escape hatch. The eval runs
 * statically; no LLM calls.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { defineEval } from '@atelier/evals';
import { parseSkillMarkdown } from '@atelier/schemas';

const here = dirname(fileURLToPath(import.meta.url));
const SKILL_PATH = resolve(here, '../../skills/inbox-zero.skill.md');

export default defineEval({
  id: 'skill/inbox-zero/contract',
  description: 'inbox-zero.skill.md parses and gates on automation_trust + bulk-archive rules.',
  kind: 'skill',
  tags: ['inbox', 'parser', 'contract'],
  input: SKILL_PATH,
  run: (path: string) => {
    const source = readFileSync(path, 'utf8');
    const parsed = parseSkillMarkdown(source);
    const w = parsed.skill.when_to_use.toLowerCase();
    const n = parsed.skill.when_not_to_use.toLowerCase();
    return {
      name: parsed.skill.name,
      uses_thread_archive: parsed.skill.capabilities_used.includes('thread.archive'),
      mentions_inbox_workflow: w.includes('inbox'),
      strict_gates_skill: n.includes('strict'),
      flow_mentions_celebration:
        parsed.skill.example_flow.toLowerCase().includes('caught up') ||
        parsed.skill.example_flow.toLowerCase().includes('inbox zero'),
      failure_modes_present: parsed.skill.known_failure_modes.length >= 3,
    };
  },
  expected: {
    name: 'inbox-zero',
    uses_thread_archive: true,
    mentions_inbox_workflow: true,
    strict_gates_skill: true,
    flow_mentions_celebration: true,
    failure_modes_present: true,
  },
});
