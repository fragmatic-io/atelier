// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Skill eval — `empty-state-prose`. Verifies the cross-cutting
 * micro-skill parses, references real capabilities, and surfaces the
 * domain-aware-prose rule + CTA-when-available rule in its frontmatter.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineEval } from '@atelier/evals';
import { parseSkillMarkdown } from '@atelier/schemas';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SKILL_PATH = resolve(__dirname, '../../skills/empty-state-prose.skill.md');

export default defineEval({
  id: 'skill/empty-state-prose/contract',
  description:
    'empty-state-prose parses, names the domain instead of "no items", and requires a CTA when one exists.',
  kind: 'skill',
  tags: ['cross-cutting', 'sk-6'],
  input: SKILL_PATH,
  run: (path: string) => {
    const src = readFileSync(path, 'utf8');
    const { skill, body } = parseSkillMarkdown(src);
    const text = `${skill.when_to_use} ${skill.example_flow} ${body}`.toLowerCase();
    return {
      name: skill.name,
      capability_count: skill.capabilities_used.length,
      mentions_no_items_ban: /no items|nothing here/.test(text),
      mentions_cta: text.includes('cta'),
      title_cap_mentioned: /60 char/.test(text),
      body_cap_mentioned: /120 char/.test(text),
      failures_listed: skill.known_failure_modes.length >= 2,
    };
  },
  expected: {
    name: 'empty-state-prose',
    capability_count: 2,
    mentions_no_items_ban: true,
    mentions_cta: true,
    title_cap_mentioned: true,
    body_cap_mentioned: true,
    failures_listed: true,
  },
});
