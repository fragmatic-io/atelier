// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Skill eval — `error-prose`. Verifies the skill forbids bare "Error",
 * forbids stack-trace exposure, splits client vs server tone, and
 * requires both "what failed" and "what to try".
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineEval } from '@atelier/evals';
import { parseSkillMarkdown } from '@atelier/schemas';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SKILL_PATH = resolve(__dirname, '../../skills/error-prose.skill.md');

export default defineEval({
  id: 'skill/error-prose/contract',
  description:
    'error-prose parses, forbids bare "Error" and stack traces, and requires both what-failed and what-to-try.',
  kind: 'skill',
  tags: ['cross-cutting', 'sk-6'],
  input: SKILL_PATH,
  run: (path: string) => {
    const src = readFileSync(path, 'utf8');
    const { skill, body } = parseSkillMarkdown(src);
    const text = `${skill.example_flow} ${body}`.toLowerCase();
    return {
      name: skill.name,
      forbids_bare_error: text.includes('"error"') || text.includes('bare word'),
      forbids_stack_trace: text.includes('stack trace'),
      mentions_what_to_try: text.includes('what to try'),
      mentions_server_vs_client: text.includes('server') && text.includes('client'),
      mentions_audit: text.includes('audit') || text.includes('action_failed'),
      failures_listed: skill.known_failure_modes.length >= 2,
    };
  },
  expected: {
    name: 'error-prose',
    forbids_bare_error: true,
    forbids_stack_trace: true,
    mentions_what_to_try: true,
    mentions_server_vs_client: true,
    mentions_audit: true,
    failures_listed: true,
  },
});
