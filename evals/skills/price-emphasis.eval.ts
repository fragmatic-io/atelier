// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Skill eval: price-emphasis.
 *
 * Asserts the skill parses and that the two anti-patterns it explicitly
 * forbids — current-then-original ordering and deferring shipping cost
 * to the final checkout step — are documented as failure modes. These
 * are the trust-load-bearing rules; the eval pins them.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineEval } from '@atelier/evals';
import { parseSkillMarkdown } from '@atelier/schemas';

const SKILL_PATH = resolve(
  new URL('.', import.meta.url).pathname,
  '../../skills/price-emphasis.skill.md',
);

export default defineEval({
  id: 'skill/price-emphasis/anti-patterns-documented',
  description:
    'price-emphasis.skill.md parses, names Intl.NumberFormat for currency, and documents the shipping-cost-hide and price-order anti-patterns.',
  kind: 'skill',
  tags: ['parser', 'i18n', 'ux-rules'],
  input: SKILL_PATH,
  run: (path: string) => {
    const source = readFileSync(path, 'utf8');
    const parsed = parseSkillMarkdown(source);
    const body = parsed.body + parsed.skill.example_flow;
    const failures = parsed.skill.known_failure_modes.join('\n');
    return {
      name: parsed.skill.name,
      mentions_intl: /Intl\.NumberFormat/.test(body),
      flags_shipping_anti_pattern: /shipping/i.test(failures),
      flags_price_order: /current-then-original|original-then-current/i.test(failures),
      failure_mode_count: parsed.skill.known_failure_modes.length,
    };
  },
  expected: (output: unknown): boolean => {
    const o = output as {
      name: string;
      mentions_intl: boolean;
      flags_shipping_anti_pattern: boolean;
      flags_price_order: boolean;
      failure_mode_count: number;
    };
    return (
      o.name === 'price-emphasis' &&
      o.mentions_intl &&
      o.flags_shipping_anti_pattern &&
      o.flags_price_order &&
      o.failure_mode_count >= 3
    );
  },
});
