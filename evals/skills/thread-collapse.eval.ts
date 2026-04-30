// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Skill eval: `skills/thread-collapse.skill.md` parses, validates against
 * `SkillSchema`, and the frontmatter encodes the three collapse triggers
 * (count > 5, age > 24h, single-sender) in testable form. No LLM calls.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { defineEval } from '@cir/evals';
import { parseSkillMarkdown } from '@cir/schemas';

const here = dirname(fileURLToPath(import.meta.url));
const SKILL_PATH = resolve(here, '../../skills/thread-collapse.skill.md');

export default defineEval({
  id: 'skill/thread-collapse/contract',
  description: 'thread-collapse.skill.md encodes the three collapse triggers in when_to_use.',
  kind: 'skill',
  tags: ['inbox', 'parser', 'contract'],
  input: SKILL_PATH,
  run: (path: string) => {
    const source = readFileSync(path, 'utf8');
    const parsed = parseSkillMarkdown(source);
    const w = parsed.skill.when_to_use;
    return {
      name: parsed.skill.name,
      uses_thread_get: parsed.skill.capabilities_used.includes('thread.get'),
      mentions_message_count_trigger: /\b5\b/.test(w),
      mentions_age_trigger: /24\s*hour/i.test(w),
      mentions_single_sender_trigger: /same sender|single[- ]sender/i.test(w),
      mentions_quoted_trim: parsed.skill.example_flow.toLowerCase().includes('quoted'),
      failure_modes_present: parsed.skill.known_failure_modes.length >= 3,
    };
  },
  expected: {
    name: 'thread-collapse',
    uses_thread_get: true,
    mentions_message_count_trigger: true,
    mentions_age_trigger: true,
    mentions_single_sender_trigger: true,
    mentions_quoted_trim: true,
    failure_modes_present: true,
  },
});
