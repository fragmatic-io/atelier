// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Skill eval: cart-feedback.
 *
 * Asserts the skill parses, references the cart-add capability, encodes
 * the 5-second undo window, and gates badge animation on the
 * motion_preference signal. The motion guard is the load-bearing
 * accessibility rule in this skill — if a future edit drops it, the
 * eval should fail loudly.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineEval } from '@cir/evals';
import { parseSkillMarkdown } from '@cir/schemas';

const SKILL_PATH = resolve(
  new URL('.', import.meta.url).pathname,
  '../../skills/cart-feedback.skill.md',
);

export default defineEval({
  id: 'skill/cart-feedback/motion-and-undo-rules-present',
  description:
    'cart-feedback.skill.md parses, references dummyjson.cart.add, names the 5s undo window, and gates badge animation on motion_preference.',
  kind: 'skill',
  tags: ['parser', 'a11y', 'ux-rules'],
  input: SKILL_PATH,
  run: (path: string) => {
    const source = readFileSync(path, 'utf8');
    const parsed = parseSkillMarkdown(source);
    return {
      name: parsed.skill.name,
      uses_cart_add: parsed.skill.capabilities_used.includes('dummyjson.cart.add'),
      mentions_undo_window: /5\s*(s|seconds|000ms)/i.test(parsed.skill.example_flow),
      mentions_motion_pref: /motion_preference|reduced motion|prefers_reduced_motion/i.test(
        parsed.skill.example_flow,
      ),
      failure_mode_count: parsed.skill.known_failure_modes.length,
    };
  },
  expected: (output: unknown): boolean => {
    const o = output as {
      name: string;
      uses_cart_add: boolean;
      mentions_undo_window: boolean;
      mentions_motion_pref: boolean;
      failure_mode_count: number;
    };
    return (
      o.name === 'cart-feedback' &&
      o.uses_cart_add &&
      o.mentions_undo_window &&
      o.mentions_motion_pref &&
      o.failure_mode_count >= 3
    );
  },
});
