// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Skill eval: `skills/event-creation-flow.skill.md` parses, declares
 * the create + conflict-check capabilities, and pins the timezone-in-
 * confirmation contract plus the vocabulary-driven duration default.
 *
 * Authored under Wave 6 / track SK-5 for the calendar category.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineEval } from '@cir/evals';
import { parseSkillMarkdown } from '@cir/schemas';

const SKILL_PATH = resolve(process.cwd(), 'skills/event-creation-flow.skill.md');

interface Outcome {
  name: string;
  capabilities: readonly string[];
  failure_mode_count: number;
  declares_conflict_check: boolean;
  mentions_timezone_in_confirm: boolean;
  mentions_vocabulary_durations: boolean;
}

export default defineEval({
  id: 'skill/event-creation-flow/contract',
  description:
    'event-creation-flow declares conflict_check + create, keeps the timezone-in-confirmation rule, and pins the vocabulary-driven duration default.',
  kind: 'skill',
  tags: ['contract', 'calendar', 'writes'],
  input: SKILL_PATH,
  run: async (path: string): Promise<Outcome> => {
    const raw = await readFile(path, 'utf8');
    const parsed = parseSkillMarkdown(raw);
    return {
      name: parsed.skill.name,
      capabilities: parsed.skill.capabilities_used,
      failure_mode_count: parsed.skill.known_failure_modes.length,
      declares_conflict_check: parsed.skill.capabilities_used.includes(
        'calendar.event.conflict_check',
      ),
      mentions_timezone_in_confirm: /\{\{user_tz\}\}|timezone.{0,40}confirmation/i.test(
        parsed.body + ' ' + parsed.skill.example_flow,
      ),
      mentions_vocabulary_durations: /vocabulary|deep work|standup/i.test(
        parsed.body + ' ' + parsed.skill.example_flow,
      ),
    };
  },
  expected: (output: unknown): boolean => {
    const o = output as Outcome;
    return (
      o.name === 'event-creation-flow' &&
      o.capabilities.includes('calendar.event.create') &&
      o.declares_conflict_check &&
      o.failure_mode_count >= 3 &&
      o.mentions_timezone_in_confirm &&
      o.mentions_vocabulary_durations
    );
  },
});
