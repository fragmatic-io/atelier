// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Skill eval: `skills/assignee-affordance.skill.md` parses, declares
 * `assignee.update` as a capability the skill orchestrates, and the
 * body still gates the assign menu on a capability grant — that gate
 * is the load-bearing safety property of this skill.
 *
 * Authored under Wave 6 / track SK-5 for the project-management
 * category.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineEval } from '@atelier/evals';
import { parseSkillMarkdown } from '@atelier/schemas';

const SKILL_PATH = resolve(process.cwd(), 'skills/assignee-affordance.skill.md');

interface Outcome {
  name: string;
  capabilities: readonly string[];
  failure_mode_count: number;
  declares_update: boolean;
  body_gates_on_grant: boolean;
  body_mentions_overflow: boolean;
}

export default defineEval({
  id: 'skill/assignee-affordance/contract',
  description:
    'assignee-affordance gates the assign menu on capability grants, declares assignee.update, and pins the +N overflow rule.',
  kind: 'skill',
  tags: ['contract', 'project-management', 'permissions'],
  input: SKILL_PATH,
  run: async (path: string): Promise<Outcome> => {
    const raw = await readFile(path, 'utf8');
    const parsed = parseSkillMarkdown(raw);
    return {
      name: parsed.skill.name,
      capabilities: parsed.skill.capabilities_used,
      failure_mode_count: parsed.skill.known_failure_modes.length,
      declares_update: parsed.skill.capabilities_used.includes('assignee.update'),
      body_gates_on_grant: /capability grants|capabilities_granted|granted/i.test(parsed.body),
      body_mentions_overflow: /\+N|overflow/i.test(parsed.body),
    };
  },
  expected: (output: unknown): boolean => {
    const o = output as Outcome;
    return (
      o.name === 'assignee-affordance' &&
      o.declares_update &&
      o.failure_mode_count >= 3 &&
      o.body_gates_on_grant &&
      o.body_mentions_overflow
    );
  },
});
