// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Skill eval — `tooltip-tone`. Verifies the skill caps prose at 80
 * chars, forbids terminal periods and label repetition, hides on click,
 * and provides a touch-device fallback.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineEval } from '@atelier/evals';
import { parseSkillMarkdown } from '@atelier/schemas';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SKILL_PATH = resolve(__dirname, '../../skills/tooltip-tone.skill.md');

export default defineEval({
  id: 'skill/tooltip-tone/contract',
  description:
    'tooltip-tone parses, caps prose at 80 chars, forbids label repetition, and provides a touch fallback.',
  kind: 'skill',
  tags: ['cross-cutting', 'sk-6'],
  input: SKILL_PATH,
  run: (path: string) => {
    const src = readFileSync(path, 'utf8');
    const { skill, body } = parseSkillMarkdown(src);
    const text = `${skill.example_flow} ${body}`.toLowerCase();
    return {
      name: skill.name,
      mentions_80: text.includes('80'),
      forbids_period: text.includes('no terminal period') || text.includes('no period'),
      forbids_label_repeat: text.includes('repeat') && text.includes('label'),
      mentions_hide_on_click: text.includes('hide on click'),
      mentions_long_press: text.includes('long-press') || text.includes('long press'),
      failures_listed: skill.known_failure_modes.length >= 2,
    };
  },
  expected: {
    name: 'tooltip-tone',
    mentions_80: true,
    forbids_period: true,
    forbids_label_repeat: true,
    mentions_hide_on_click: true,
    mentions_long_press: true,
    failures_listed: true,
  },
});
