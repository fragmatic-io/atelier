// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Skill eval: checkout-progressive.
 *
 * Asserts the skill parses and that the per-step confirmation policy
 * uses only values from CapabilitySchema's `confirmation` enum
 * (`'inline' | 'modal' | 'verbal_required'`). A drift to a custom
 * value would silently bypass the runtime's confirmation gate.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineEval } from '@atelier/evals';
import { parseSkillMarkdown } from '@atelier/schemas';

const SKILL_PATH = resolve(
  new URL('.', import.meta.url).pathname,
  '../../skills/checkout-progressive.skill.md',
);

const ALLOWED_CONFIRMATIONS = ['inline', 'modal', 'verbal_required'] as const;

export default defineEval({
  id: 'skill/checkout-progressive/confirmation-enum-respected',
  description:
    'checkout-progressive.skill.md parses and only uses allowed CapabilitySchema confirmation values (inline | modal | verbal_required).',
  kind: 'skill',
  tags: ['parser', 'contract'],
  input: SKILL_PATH,
  run: (path: string) => {
    const source = readFileSync(path, 'utf8');
    const parsed = parseSkillMarkdown(source);
    const body = parsed.body + parsed.skill.example_flow;
    // Find every `confirmation: '<token>'` occurrence in the body and
    // example_flow; assert each token is in the allowed set.
    const re = /confirmation:\s*['"]([a-z_]+)['"]/g;
    const found: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
      found.push(m[1]!);
    }
    const allowed = new Set<string>(ALLOWED_CONFIRMATIONS);
    const unknown = found.filter((t) => !allowed.has(t));
    return {
      name: parsed.skill.name,
      mentions_stepper: /Stepper/.test(body),
      total_confirmation_tokens: found.length,
      unknown_tokens: unknown,
    };
  },
  expected: (output: unknown): boolean => {
    const o = output as {
      name: string;
      mentions_stepper: boolean;
      total_confirmation_tokens: number;
      unknown_tokens: string[];
    };
    return (
      o.name === 'checkout-progressive' &&
      o.mentions_stepper &&
      o.total_confirmation_tokens >= 3 &&
      o.unknown_tokens.length === 0
    );
  },
});
