// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Skill eval: `skills/kanban-column-density.skill.md` parses cleanly,
 * declares the expected capability surface, and pins the density
 * breakpoints in the body so a refactor cannot silently drop them.
 *
 * Authored under Wave 6 / track SK-5 (Skill Library Breadth Pass) for
 * the project-management / kanban category.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineEval } from '@atelier/evals';
import { parseSkillMarkdown } from '@atelier/schemas';

const SKILL_PATH = resolve(process.cwd(), 'skills/kanban-column-density.skill.md');

interface Outcome {
  name: string;
  capabilities: readonly string[];
  failure_mode_count: number;
  body_mentions_wip_limit: boolean;
  body_mentions_empty_prose: boolean;
}

export default defineEval({
  id: 'skill/kanban-column-density/contract',
  description:
    'kanban-column-density skill parses, declares board.column.list + board.card.list, and pins WIP / empty-column behavior in the body.',
  kind: 'skill',
  tags: ['contract', 'project-management'],
  input: SKILL_PATH,
  run: async (path: string): Promise<Outcome> => {
    const raw = await readFile(path, 'utf8');
    const parsed = parseSkillMarkdown(raw);
    return {
      name: parsed.skill.name,
      capabilities: parsed.skill.capabilities_used,
      failure_mode_count: parsed.skill.known_failure_modes.length,
      body_mentions_wip_limit: /wip[_ -]?limit/i.test(parsed.body),
      body_mentions_empty_prose: /empty[_ -]?column|drop something/i.test(parsed.body),
    };
  },
  expected: (output: unknown): boolean => {
    const o = output as Outcome;
    return (
      o.name === 'kanban-column-density' &&
      o.capabilities.includes('board.column.list') &&
      o.capabilities.includes('board.card.list') &&
      o.failure_mode_count >= 3 &&
      o.body_mentions_wip_limit &&
      o.body_mentions_empty_prose
    );
  },
});
