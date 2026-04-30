// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Skill eval — `progressive-disclosure`. Verifies the skill encodes the
 * 7-row threshold, the "never tooltip for crucial info" guard, and the
 * advanced-settings collapse rule.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineEval } from '@cir/evals';
import { parseSkillMarkdown } from '@cir/schemas';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SKILL_PATH = resolve(__dirname, '../../skills/progressive-disclosure.skill.md');

export default defineEval({
  id: 'skill/progressive-disclosure/contract',
  description:
    'progressive-disclosure parses, encodes the 7-row threshold, and forbids tooltip-only crucial info.',
  kind: 'skill',
  tags: ['cross-cutting', 'sk-6'],
  input: SKILL_PATH,
  run: (path: string) => {
    const src = readFileSync(path, 'utf8');
    const { skill, body } = parseSkillMarkdown(src);
    const text = `${skill.example_flow} ${skill.when_not_to_use} ${body}`.toLowerCase();
    return {
      name: skill.name,
      mentions_seven: /\b7\b|seven/.test(text),
      mentions_advanced: text.includes('advanced'),
      mentions_tooltip_guard: text.includes('tooltip') || text.includes('hover'),
      mentions_show_more: text.includes('show more'),
      failures_listed: skill.known_failure_modes.length >= 2,
    };
  },
  expected: {
    name: 'progressive-disclosure',
    mentions_seven: true,
    mentions_advanced: true,
    mentions_tooltip_guard: true,
    mentions_show_more: true,
    failures_listed: true,
  },
});
