// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Skill eval — `live-search-debounce`. Verifies the skill encodes the
 * 250ms debounce, 200ms inflight-spinner, cancel-previous-on-keystroke
 * rule, and the keep-results-visible-during-refetch directive.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineEval } from '@atelier/evals';
import { parseSkillMarkdown } from '@atelier/schemas';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SKILL_PATH = resolve(__dirname, '../../skills/live-search-debounce.skill.md');

export default defineEval({
  id: 'skill/live-search-debounce/contract',
  description:
    'live-search-debounce parses, encodes 250ms / 200ms thresholds, and forbids blank-then-replace.',
  kind: 'skill',
  tags: ['cross-cutting', 'sk-6'],
  input: SKILL_PATH,
  run: (path: string) => {
    const src = readFileSync(path, 'utf8');
    const { skill, body } = parseSkillMarkdown(src);
    const text = `${skill.example_flow} ${body}`.toLowerCase();
    return {
      name: skill.name,
      mentions_250: text.includes('250'),
      mentions_200: text.includes('200'),
      mentions_cancel: text.includes('cancel') || text.includes('abort'),
      mentions_keep_visible: text.includes('keep') && text.includes('visible'),
      forbids_blank: text.includes('blank-then-replace') || text.includes('blanking'),
      failures_listed: skill.known_failure_modes.length >= 2,
    };
  },
  expected: {
    name: 'live-search-debounce',
    mentions_250: true,
    mentions_200: true,
    mentions_cancel: true,
    mentions_keep_visible: true,
    forbids_blank: true,
    failures_listed: true,
  },
});
