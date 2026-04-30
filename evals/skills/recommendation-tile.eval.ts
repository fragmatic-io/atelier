// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Skill eval: recommendation-tile.
 *
 * Asserts the skill parses and that the four constraints — 4-per-row,
 * 2-row max, algorithm uniqueness, disclosure of the basis — are
 * present in the prose. Confidence threshold is also pinned.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineEval } from '@cir/evals';
import { parseSkillMarkdown } from '@cir/schemas';

const SKILL_PATH = resolve(
  new URL('.', import.meta.url).pathname,
  '../../skills/recommendation-tile.skill.md',
);

export default defineEval({
  id: 'skill/recommendation-tile/four-constraints-present',
  description:
    'recommendation-tile.skill.md parses and documents 4-per-row, 2-row cap, algorithm uniqueness, disclosure, and confidence threshold.',
  kind: 'skill',
  tags: ['parser', 'ux-rules'],
  input: SKILL_PATH,
  run: (path: string) => {
    const source = readFileSync(path, 'utf8');
    const parsed = parseSkillMarkdown(source);
    const flow = parsed.skill.example_flow;
    const body = parsed.body;
    return {
      name: parsed.skill.name,
      mentions_4_per_row: /4\s*per\s*row|4 items per row|at most 4/i.test(flow + body),
      mentions_2_row_cap: /2\s*rows?|2 row max|2 rows max/i.test(flow + body),
      mentions_algorithm_uniqueness:
        /one algorithm|never two|never repeat|never the same|one surface per algorithm/i.test(
          flow + body,
        ),
      mentions_disclosure: /Because you viewed/i.test(flow + body),
      mentions_confidence: /confidence|score\s*>=|threshold/i.test(flow + body),
      failure_mode_count: parsed.skill.known_failure_modes.length,
    };
  },
  expected: (output: unknown): boolean => {
    const o = output as {
      name: string;
      mentions_4_per_row: boolean;
      mentions_2_row_cap: boolean;
      mentions_algorithm_uniqueness: boolean;
      mentions_disclosure: boolean;
      mentions_confidence: boolean;
      failure_mode_count: number;
    };
    return (
      o.name === 'recommendation-tile' &&
      o.mentions_4_per_row &&
      o.mentions_2_row_cap &&
      o.mentions_algorithm_uniqueness &&
      o.mentions_disclosure &&
      o.mentions_confidence &&
      o.failure_mode_count >= 3
    );
  },
});
