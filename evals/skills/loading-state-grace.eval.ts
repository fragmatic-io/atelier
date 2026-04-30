// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Skill eval — `loading-state-grace`. Verifies the skill encodes the
 * 100ms / 500ms / 2s / 10s thresholds and the cancel-affordance rule
 * past the long-running threshold.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineEval } from '@cir/evals';
import { parseSkillMarkdown } from '@cir/schemas';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SKILL_PATH = resolve(__dirname, '../../skills/loading-state-grace.skill.md');

export default defineEval({
  id: 'skill/loading-state-grace/contract',
  description:
    'loading-state-grace parses, encodes the 100ms/500ms/2s/10s thresholds, and requires a cancel affordance past 10s.',
  kind: 'skill',
  tags: ['cross-cutting', 'sk-6'],
  input: SKILL_PATH,
  run: (path: string) => {
    const src = readFileSync(path, 'utf8');
    const { skill, body } = parseSkillMarkdown(src);
    const text = `${skill.example_flow} ${body}`.toLowerCase();
    return {
      name: skill.name,
      mentions_100: text.includes('100ms'),
      mentions_500: text.includes('500ms'),
      mentions_2s: text.includes('2s') || text.includes('2 s'),
      mentions_10s: text.includes('10s') || text.includes('10 s'),
      mentions_cancel: text.includes('cancel'),
      mentions_skeleton: text.includes('skeleton'),
      failures_listed: skill.known_failure_modes.length >= 2,
    };
  },
  expected: {
    name: 'loading-state-grace',
    mentions_100: true,
    mentions_500: true,
    mentions_2s: true,
    mentions_10s: true,
    mentions_cancel: true,
    mentions_skeleton: true,
    failures_listed: true,
  },
});
