// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Skill eval: out-of-stock-handling.
 *
 * Asserts the skill parses and that the intent fork (browse vs
 * purchase-now) and the silent-disable failure mode are both present.
 * The silent-disable rule is the affordance contract — if a future
 * edit drops it, an OOS card could ship with a dead button.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineEval } from '@atelier/evals';
import { parseSkillMarkdown } from '@atelier/schemas';

const SKILL_PATH = resolve(
  new URL('.', import.meta.url).pathname,
  '../../skills/out-of-stock-handling.skill.md',
);

export default defineEval({
  id: 'skill/out-of-stock-handling/intent-fork-present',
  description:
    'out-of-stock-handling.skill.md parses, encodes the dim-but-show vs filter-out intent fork, and flags silent-disable as a failure mode.',
  kind: 'skill',
  tags: ['parser', 'ux-rules'],
  input: SKILL_PATH,
  run: (path: string) => {
    const source = readFileSync(path, 'utf8');
    const parsed = parseSkillMarkdown(source);
    const flow = parsed.skill.example_flow;
    const failures = parsed.skill.known_failure_modes.join('\n').toLowerCase();
    return {
      name: parsed.skill.name,
      mentions_dim_but_show: /dim-but-show|dim but show/i.test(flow),
      mentions_filter_out: /filter[- ]out|filter out_of_stock|filter the out_of_stock/i.test(flow),
      mentions_notify_me: /notify[- ]me/i.test(flow),
      flags_silent_disable: failures.includes('silent') || failures.includes('without a reason'),
      failure_mode_count: parsed.skill.known_failure_modes.length,
    };
  },
  expected: (output: unknown): boolean => {
    const o = output as {
      name: string;
      mentions_dim_but_show: boolean;
      mentions_filter_out: boolean;
      mentions_notify_me: boolean;
      flags_silent_disable: boolean;
      failure_mode_count: number;
    };
    return (
      o.name === 'out-of-stock-handling' &&
      o.mentions_dim_but_show &&
      o.mentions_filter_out &&
      o.mentions_notify_me &&
      o.flags_silent_disable &&
      o.failure_mode_count >= 3
    );
  },
});
