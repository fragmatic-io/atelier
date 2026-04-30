// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Skill eval: `skills/card-priority-emphasis.skill.md` parses, declares
 * the board read capabilities, and the body keeps the precedence rule
 * (blocked > priority > today) and the color-blind-safe palette
 * reference — both load-bearing for the visual contract.
 *
 * Authored under Wave 6 / track SK-5 for the project-management
 * category.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineEval } from '@cir/evals';
import { parseSkillMarkdown } from '@cir/schemas';

const SKILL_PATH = resolve(process.cwd(), 'skills/card-priority-emphasis.skill.md');

interface Outcome {
  name: string;
  capabilities: readonly string[];
  failure_mode_count: number;
  mentions_color_safe: boolean;
  mentions_precedence: boolean;
}

export default defineEval({
  id: 'skill/card-priority-emphasis/contract',
  description:
    'card-priority-emphasis declares board.card.list/get, mentions accent_safe palette, and pins the blocked/priority/today precedence.',
  kind: 'skill',
  tags: ['contract', 'project-management', 'a11y'],
  input: SKILL_PATH,
  run: async (path: string): Promise<Outcome> => {
    const raw = await readFile(path, 'utf8');
    const parsed = parseSkillMarkdown(raw);
    return {
      name: parsed.skill.name,
      capabilities: parsed.skill.capabilities_used,
      failure_mode_count: parsed.skill.known_failure_modes.length,
      mentions_color_safe: /accent_safe|color[- ]blind/i.test(parsed.body),
      mentions_precedence: /blocked\s*>\s*(top-three\s*)?priority\s*>\s*today/i.test(parsed.body),
    };
  },
  expected: (output: unknown): boolean => {
    const o = output as Outcome;
    return (
      o.name === 'card-priority-emphasis' &&
      o.capabilities.includes('board.card.list') &&
      o.failure_mode_count >= 3 &&
      o.mentions_color_safe &&
      o.mentions_precedence
    );
  },
});
