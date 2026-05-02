// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Skill eval: `skills/information-hierarchy.skill.md` parses cleanly via
 * `parseSkillMarkdown` and the body carries the load-bearing rules from
 * Wave 7b / track P-9:
 *
 *  - Cap N = 7 above the fold
 *  - Top 1–3 get emphasis treatment
 *  - List → bold + accent, Table → row tint, KPIRow → hero size, Grid → border accent
 *  - Fade below the cut by 10–15% (not heavier)
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineEval } from '@atelier/evals';
import { parseSkillMarkdown } from '@atelier/schemas';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SKILL_PATH = resolve(__dirname, '../../skills/information-hierarchy.skill.md');

interface Outcome {
  name: string;
  version: string;
  capability_count: number;
  failure_mode_count: number;
  mentions_cap_seven: boolean;
  mentions_top_three: boolean;
  mentions_list_rule: boolean;
  mentions_table_rule: boolean;
  mentions_kpirow_rule: boolean;
  mentions_grid_rule: boolean;
  mentions_fade_band: boolean;
}

export default defineEval({
  id: 'skill/information-hierarchy/contract',
  description:
    'information-hierarchy parses, mentions the cap-N=7 rule, the top-1–3 emphasis rule, the per-component treatments, and the 10–15% fade band.',
  kind: 'skill',
  tags: ['contract', 'cross-cutting', 'p-9', 'information-hierarchy'],
  input: SKILL_PATH,
  run: (path: string): Outcome => {
    const src = readFileSync(path, 'utf8');
    const parsed = parseSkillMarkdown(src);
    const text = `${parsed.skill.when_to_use}\n${parsed.skill.example_flow}\n${parsed.body}`;
    return {
      name: parsed.skill.name,
      version: parsed.skill.version,
      capability_count: parsed.skill.capabilities_used.length,
      failure_mode_count: parsed.skill.known_failure_modes.length,
      mentions_cap_seven: /(cap\s*n\s*=?\s*7|seven\s+items|>\s*7)/i.test(text),
      mentions_top_three: /top\s*1[–-]?3|top[- ]3|top\s*three/i.test(text),
      mentions_list_rule: /list[^\n]*(bold|left[- ]border|accent)/i.test(text),
      mentions_table_rule: /table[^\n]*(row[- ]?band|highlighted|tint)/i.test(text),
      mentions_kpirow_rule: /kpirow[^\n]*(hero|larger|hero size)/i.test(text),
      mentions_grid_rule: /grid[^\n]*(border|accent)/i.test(text),
      mentions_fade_band: /10[–-]?15\s*%/i.test(text),
    };
  },
  expected: (output: unknown): boolean => {
    const o = output as Outcome;
    return (
      o.name === 'information-hierarchy' &&
      o.version === '1.0.0' &&
      o.capability_count >= 1 &&
      o.failure_mode_count >= 3 &&
      o.mentions_cap_seven &&
      o.mentions_top_three &&
      o.mentions_list_rule &&
      o.mentions_table_rule &&
      o.mentions_kpirow_rule &&
      o.mentions_grid_rule &&
      o.mentions_fade_band
    );
  },
});
