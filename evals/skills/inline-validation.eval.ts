// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Skill eval: `inline-validation` ships the three-bucket cadence
 * (cheap_local per-keystroke, server_checked on-blur with debounce,
 * cross_field on-submit) and the hard rule that a field's error never
 * renders before its first blur. The eval pins each bucket and the
 * blur-gate against the skill body so a regression is caught.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineEval } from '@cir/evals';
import { parseSkillMarkdown } from '@cir/schemas';

const here = dirname(fileURLToPath(import.meta.url));
const SKILL_PATH = resolve(here, '../../skills/inline-validation.skill.md');

export default defineEval({
  id: 'skill/inline-validation/three-bucket-cadence',
  description:
    'inline-validation pins the per-keystroke / on-blur / on-submit buckets and the first-blur gate.',
  kind: 'skill',
  tags: ['forms', 'validation'],
  input: SKILL_PATH,
  run: async (path: string) => {
    const raw = await readFile(path, 'utf8');
    const parsed = parseSkillMarkdown(raw);
    const blob = `${parsed.skill.when_to_use}\n${parsed.skill.example_flow}`;
    return {
      name: parsed.skill.name,
      mentions_cheap_local: /cheap_local/.test(blob),
      mentions_server_checked: /server_checked/.test(blob),
      mentions_cross_field: /cross_field/.test(blob),
      mentions_debounce: /debounce/i.test(blob),
      first_blur_gate: /blurred at least once/i.test(blob),
      failure_count: parsed.skill.known_failure_modes.length,
    };
  },
  expected: (output: unknown): boolean => {
    const o = output as {
      name: string;
      mentions_cheap_local: boolean;
      mentions_server_checked: boolean;
      mentions_cross_field: boolean;
      mentions_debounce: boolean;
      first_blur_gate: boolean;
      failure_count: number;
    };
    return (
      o.name === 'inline-validation' &&
      o.mentions_cheap_local &&
      o.mentions_server_checked &&
      o.mentions_cross_field &&
      o.mentions_debounce &&
      o.first_blur_gate &&
      o.failure_count >= 3
    );
  },
});
