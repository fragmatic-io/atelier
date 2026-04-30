// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Skill eval — `rate-limit-feedback`. Verifies the skill encodes the
 * countdown affordance, the suggested-wait line, and the upgrade-link
 * conditional.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineEval } from '@cir/evals';
import { parseSkillMarkdown } from '@cir/schemas';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SKILL_PATH = resolve(__dirname, '../../skills/rate-limit-feedback.skill.md');

export default defineEval({
  id: 'skill/rate-limit-feedback/contract',
  description:
    'rate-limit-feedback parses, surfaces a countdown, and gates the upgrade link on a commercial tier.',
  kind: 'skill',
  tags: ['cross-cutting', 'sk-6'],
  input: SKILL_PATH,
  run: (path: string) => {
    const src = readFileSync(path, 'utf8');
    const { skill, body } = parseSkillMarkdown(src);
    const text = `${skill.example_flow} ${body}`.toLowerCase();
    return {
      name: skill.name,
      mentions_countdown: text.includes('countdown'),
      mentions_retry_after: text.includes('retry-after') || text.includes('retry in'),
      mentions_upgrade: text.includes('upgrade'),
      forbids_grey_out: text.includes('grey') || text.includes('gray'),
      forbids_auto_retry: text.includes('auto-retry') || text.includes('not auto-retry'),
      failures_listed: skill.known_failure_modes.length >= 2,
    };
  },
  expected: {
    name: 'rate-limit-feedback',
    mentions_countdown: true,
    mentions_retry_after: true,
    mentions_upgrade: true,
    forbids_grey_out: true,
    forbids_auto_retry: true,
    failures_listed: true,
  },
});
