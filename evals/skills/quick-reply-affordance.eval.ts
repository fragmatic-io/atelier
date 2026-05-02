// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Skill eval: `skills/quick-reply-affordance.skill.md` parses, validates
 * against `SkillSchema`, and the frontmatter pins the testable bounds —
 * 3 chips max, ≤140 char per chip, and the sensitive-content deny-list.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { defineEval } from '@atelier/evals';
import { parseSkillMarkdown } from '@atelier/schemas';

const here = dirname(fileURLToPath(import.meta.url));
const SKILL_PATH = resolve(here, '../../skills/quick-reply-affordance.skill.md');

export default defineEval({
  id: 'skill/quick-reply-affordance/contract',
  description: 'quick-reply-affordance pins chip count, length bound, and the sensitive deny-list.',
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
      mentions_three_chips: /\b3\b|\bthree\b/.test(all),
      mentions_140_char_bound: /140/.test(all),
      mentions_legal_denylist: all.includes('legal'),
      mentions_financial_denylist: all.includes('financial'),
      never_auto_send_in_failures: parsed.skill.known_failure_modes
        .join(' ')
        .toLowerCase()
        .includes('auto-send'),
      failure_modes_present: parsed.skill.known_failure_modes.length >= 3,
    };
  },
  expected: {
    name: 'quick-reply-affordance',
    mentions_three_chips: true,
    mentions_140_char_bound: true,
    mentions_legal_denylist: true,
    mentions_financial_denylist: true,
    never_auto_send_in_failures: true,
    failure_modes_present: true,
  },
});
