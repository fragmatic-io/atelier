// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Skill eval — `motion-respect-reduced`. Verifies the skill checks both
 * the OS `prefers-reduced-motion` query and the intent override, caps
 * duration at 200ms in reduced mode, and forbids auto-play / parallax /
 * large translation.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineEval } from '@atelier/evals';
import { parseSkillMarkdown } from '@atelier/schemas';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SKILL_PATH = resolve(__dirname, '../../skills/motion-respect-reduced.skill.md');

export default defineEval({
  id: 'skill/motion-respect-reduced/contract',
  description:
    'motion-respect-reduced parses, checks both signals, caps reduced-mode duration at 200ms, and forbids auto-play / parallax.',
  kind: 'skill',
  tags: ['cross-cutting', 'sk-6'],
  input: SKILL_PATH,
  run: (path: string) => {
    const src = readFileSync(path, 'utf8');
    const { skill, body } = parseSkillMarkdown(src);
    const text = `${skill.example_flow} ${skill.when_to_use} ${body}`.toLowerCase();
    return {
      name: skill.name,
      mentions_media_query: text.includes('prefers-reduced-motion'),
      mentions_intent_override: text.includes('motion_preference'),
      forbids_auto_play: text.includes('auto-play') || text.includes('autoplay'),
      forbids_parallax: text.includes('parallax'),
      mentions_200ms_cap: text.includes('200ms'),
      mentions_cross_fade: text.includes('cross-fade') || text.includes('crossfade'),
      failures_listed: skill.known_failure_modes.length >= 2,
    };
  },
  expected: {
    name: 'motion-respect-reduced',
    mentions_media_query: true,
    mentions_intent_override: true,
    forbids_auto_play: true,
    forbids_parallax: true,
    mentions_200ms_cap: true,
    mentions_cross_fade: true,
    failures_listed: true,
  },
});
