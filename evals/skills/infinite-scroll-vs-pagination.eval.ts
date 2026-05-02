// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Skill eval — `infinite-scroll-vs-pagination`. Verifies the skill
 * encodes the chronological-vs-catalog decision, anchor-on-back-nav
 * for both modes, and explicit page-size guidance.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineEval } from '@atelier/evals';
import { parseSkillMarkdown } from '@atelier/schemas';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SKILL_PATH = resolve(__dirname, '../../skills/infinite-scroll-vs-pagination.skill.md');

export default defineEval({
  id: 'skill/infinite-scroll-vs-pagination/contract',
  description:
    'infinite-scroll-vs-pagination parses, encodes the chronological-vs-catalog rule, and requires anchor-on-back-nav.',
  kind: 'skill',
  tags: ['cross-cutting', 'sk-6'],
  input: SKILL_PATH,
  run: (path: string) => {
    const src = readFileSync(path, 'utf8');
    const { skill, body } = parseSkillMarkdown(src);
    const text = `${skill.example_flow} ${body}`.toLowerCase();
    return {
      name: skill.name,
      mentions_chronological: text.includes('chronological'),
      mentions_catalog: text.includes('catalog'),
      mentions_anchor: text.includes('anchor'),
      mentions_page_size: text.includes('page size') || text.includes('page-size'),
      mentions_back_nav: text.includes('back-nav') || text.includes('back nav'),
      failures_listed: skill.known_failure_modes.length >= 2,
    };
  },
  expected: {
    name: 'infinite-scroll-vs-pagination',
    mentions_chronological: true,
    mentions_catalog: true,
    mentions_anchor: true,
    mentions_page_size: true,
    mentions_back_nav: true,
    failures_listed: true,
  },
});
