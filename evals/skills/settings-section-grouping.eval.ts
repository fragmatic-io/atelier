// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Skill eval: `settings-section-grouping` pins the section-count target
 * (3–7), the layout fork threshold (>=4 sections OR >=30 fields → sidebar),
 * the in-page search threshold (>=40 fields), and the BrandKit
 * iconography rule. Compiler retrieval relies on these phrases living in
 * the skill body verbatim.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineEval } from '@cir/evals';
import { parseSkillMarkdown } from '@cir/schemas';

const here = dirname(fileURLToPath(import.meta.url));
const SKILL_PATH = resolve(here, '../../skills/settings-section-grouping.skill.md');

export default defineEval({
  id: 'skill/settings-section-grouping/thresholds',
  description:
    'settings-section-grouping pins 3-7 sections, sidebar at 4+/30+, search at 40+, BrandKit icons only.',
  kind: 'skill',
  tags: ['settings', 'layout'],
  input: SKILL_PATH,
  run: async (path: string) => {
    const raw = await readFile(path, 'utf8');
    const parsed = parseSkillMarkdown(raw);
    const blob = `${parsed.skill.when_to_use}\n${parsed.skill.example_flow}`;
    return {
      name: parsed.skill.name,
      mentions_section_target: /3[-–]7/.test(blob),
      mentions_sidebar_threshold: /sections\s*>=?\s*4|sections >= 4|>=\s*4/.test(blob),
      mentions_field_threshold: /fields\s*>=?\s*30|>=\s*30/.test(blob),
      mentions_search_threshold: /fields\s*>=?\s*40|>=\s*40/.test(blob),
      mentions_brand_iconography: /BrandKit/.test(blob) && /iconograph/i.test(blob),
    };
  },
  expected: {
    name: 'settings-section-grouping',
    mentions_section_target: true,
    mentions_sidebar_threshold: true,
    mentions_field_threshold: true,
    mentions_search_threshold: true,
    mentions_brand_iconography: true,
  },
});
