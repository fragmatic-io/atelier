// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Skill eval — `optimistic-update`. Verifies the skill gates optimistic
 * UI on `reversible: true` AND low-stakes, references
 * `useOptimisticAction`, and forbids optimism on irreversible writes.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineEval } from '@cir/evals';
import { parseSkillMarkdown } from '@cir/schemas';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SKILL_PATH = resolve(__dirname, '../../skills/optimistic-update.skill.md');

export default defineEval({
  id: 'skill/optimistic-update/contract',
  description:
    'optimistic-update parses, requires reversible + low-stakes, and references useOptimisticAction.',
  kind: 'skill',
  tags: ['cross-cutting', 'sk-6'],
  input: SKILL_PATH,
  run: (path: string) => {
    const src = readFileSync(path, 'utf8');
    const { skill, body } = parseSkillMarkdown(src);
    const text = `${skill.when_to_use} ${skill.when_not_to_use} ${skill.example_flow} ${body}`;
    const lower = text.toLowerCase();
    return {
      name: skill.name,
      mentions_reversible: lower.includes('reversible'),
      mentions_irreversible_ban: lower.includes('irreversible'),
      mentions_useOptimisticAction: text.includes('useOptimisticAction'),
      mentions_revert: lower.includes('revert'),
      mentions_toast: lower.includes('toast'),
      failures_listed: skill.known_failure_modes.length >= 2,
    };
  },
  expected: {
    name: 'optimistic-update',
    mentions_reversible: true,
    mentions_irreversible_ban: true,
    mentions_useOptimisticAction: true,
    mentions_revert: true,
    mentions_toast: true,
    failures_listed: true,
  },
});
