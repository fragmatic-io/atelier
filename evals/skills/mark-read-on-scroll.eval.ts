// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Skill eval: `skills/mark-read-on-scroll.skill.md` parses, validates
 * against `SkillSchema`, and the frontmatter pins the dwell threshold
 * (2 seconds) and the strict-mode opt-out — both testable invariants.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { defineEval } from '@atelier/evals';
import { parseSkillMarkdown } from '@atelier/schemas';

const here = dirname(fileURLToPath(import.meta.url));
const SKILL_PATH = resolve(here, '../../skills/mark-read-on-scroll.skill.md');

export default defineEval({
  id: 'skill/mark-read-on-scroll/contract',
  description: 'mark-read-on-scroll pins the 2s dwell threshold and the strict-mode opt-out.',
  kind: 'skill',
  tags: ['inbox', 'parser', 'contract'],
  input: SKILL_PATH,
  run: (path: string) => {
    const source = readFileSync(path, 'utf8');
    const parsed = parseSkillMarkdown(source);
    const all =
      `${parsed.skill.when_to_use} ${parsed.skill.when_not_to_use} ${parsed.skill.example_flow}`.toLowerCase();
    return {
      name: parsed.skill.name,
      mentions_dwell_threshold: /2\s*second|2000\s*ms|>\s*2\s*s/i.test(all),
      mentions_strict_optout: all.includes("'strict'") || all.includes('strict'),
      mentions_always_confirm_setting:
        all.includes('always confirm') || all.includes('always_confirm'),
      uses_thread_list: parsed.skill.capabilities_used.includes('thread.list'),
      failure_modes_present: parsed.skill.known_failure_modes.length >= 3,
    };
  },
  expected: {
    name: 'mark-read-on-scroll',
    mentions_dwell_threshold: true,
    mentions_strict_optout: true,
    mentions_always_confirm_setting: true,
    uses_thread_list: true,
    failure_modes_present: true,
  },
});
