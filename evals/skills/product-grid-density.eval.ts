// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Skill eval: product-grid-density.
 *
 * Asserts the skill file parses, the frontmatter satisfies SkillSchema, and
 * the cardinality rules in the prose body are present and testable. The
 * skill is a UX policy artifact, so the eval encodes the breakpoints
 * (≤12, 13–60, >60) as substring assertions over the body — that way a
 * silent edit that drops the rule trips the eval before a recipe trips
 * a user.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineEval } from '@cir/evals';
import { parseSkillMarkdown } from '@cir/schemas';

const SKILL_PATH = resolve(
  new URL('.', import.meta.url).pathname,
  '../../skills/product-grid-density.skill.md',
);

export default defineEval({
  id: 'skill/product-grid-density/density-rules-present',
  description:
    'product-grid-density.skill.md parses, frontmatter is valid, and the ≤12 / 13–60 / >60 cardinality rules are documented in the body.',
  kind: 'skill',
  tags: ['parser', 'ux-rules'],
  input: SKILL_PATH,
  run: (path: string) => {
    const source = readFileSync(path, 'utf8');
    const parsed = parseSkillMarkdown(source);
    return {
      name: parsed.skill.name,
      version: parsed.skill.version,
      capability_count: parsed.skill.capabilities_used.length,
      mentions_low_cardinality: parsed.skill.example_flow.includes('12'),
      mentions_mid_cardinality: parsed.skill.example_flow.includes('60'),
      mentions_skeleton: /skeleton/i.test(parsed.skill.example_flow),
      failure_mode_count: parsed.skill.known_failure_modes.length,
    };
  },
  expected: (output: unknown): boolean => {
    const o = output as {
      name: string;
      version: string;
      capability_count: number;
      mentions_low_cardinality: boolean;
      mentions_mid_cardinality: boolean;
      mentions_skeleton: boolean;
      failure_mode_count: number;
    };
    return (
      o.name === 'product-grid-density' &&
      o.version === '0.1.0' &&
      o.capability_count >= 1 &&
      o.mentions_low_cardinality &&
      o.mentions_mid_cardinality &&
      o.mentions_skeleton &&
      o.failure_mode_count >= 3
    );
  },
});
