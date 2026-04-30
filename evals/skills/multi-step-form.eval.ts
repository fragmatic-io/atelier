// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Skill eval: `multi-step-form` parses, declares its capability, and
 * pins the threshold + draft-recovery rules in `when_to_use` /
 * `example_flow`. The skill teaches the compiler to fork a long form
 * into a `<Wizard>` only at >=4 sections OR field dependencies, and to
 * persist drafts to sessionStorage with a 30-minute TTL — these phrases
 * are load-bearing for retrieval.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineEval } from '@cir/evals';
import { parseSkillMarkdown } from '@cir/schemas';

const here = dirname(fileURLToPath(import.meta.url));
const SKILL_PATH = resolve(here, '../../skills/multi-step-form.skill.md');

export default defineEval({
  id: 'skill/multi-step-form/contract',
  description:
    'multi-step-form parses, declares the wizard threshold, and pins sessionStorage TTL.',
  kind: 'skill',
  tags: ['forms', 'wizard'],
  input: SKILL_PATH,
  run: async (path: string) => {
    const raw = await readFile(path, 'utf8');
    const parsed = parseSkillMarkdown(raw);
    const blob = `${parsed.skill.when_to_use}\n${parsed.skill.example_flow}`;
    return {
      name: parsed.skill.name,
      mentions_wizard_threshold: /four or more|>=\s*4|4 (or more|sections)/i.test(blob),
      mentions_session_storage: /sessionStorage/.test(blob),
      mentions_ttl: /TTL|30[- ]minute/i.test(blob),
      forbids_local_storage: /localStorage/.test(parsed.skill.known_failure_modes.join('\n')),
      capability_count: parsed.skill.capabilities_used.length,
    };
  },
  expected: {
    name: 'multi-step-form',
    mentions_wizard_threshold: true,
    mentions_session_storage: true,
    mentions_ttl: true,
    forbids_local_storage: true,
    capability_count: 1,
  },
});
