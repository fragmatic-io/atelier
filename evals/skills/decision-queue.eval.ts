// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Skill eval: `skills/decision-queue.skill.md` parses, validates against
 * `SkillSchema`, and the frontmatter expresses testable triggers — the
 * `when_to_use` prose mentions both "requires_decision" (the data signal
 * the skill keys off) and a row-cap heuristic (the number "25"), and the
 * `when_not_to_use` prose names a concrete fall-through ("flat list" or
 * "Table"). No LLM calls — purely a static contract check.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { defineEval } from '@cir/evals';
import { parseSkillMarkdown } from '@cir/schemas';

const here = dirname(fileURLToPath(import.meta.url));
const SKILL_PATH = resolve(here, '../../skills/decision-queue.skill.md');

export default defineEval({
  id: 'skill/decision-queue/contract',
  description:
    'decision-queue.skill.md parses, validates, and carries testable when_to_use triggers.',
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
      capability_count: parsed.skill.capabilities_used.length,
      mentions_requires_decision: w.includes('requires_decision'),
      mentions_row_cap: /\b25\b/.test(parsed.skill.when_to_use),
      negates_flat_list: n.includes('flat list') || n.includes('table'),
      failure_modes_present: parsed.skill.known_failure_modes.length >= 3,
    };
  },
  expected: {
    name: 'decision-queue',
    capability_count: 4,
    mentions_requires_decision: true,
    mentions_row_cap: true,
    negates_flat_list: true,
    failure_modes_present: true,
  },
});
