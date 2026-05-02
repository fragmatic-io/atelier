// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Skill eval: `skills/calendar-day-week-month.skill.md` parses, declares
 * the calendar read capabilities, and pins the density-driven view-pick
 * thresholds plus the timezone-footer rule.
 *
 * Authored under Wave 6 / track SK-5 for the calendar category.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineEval } from '@atelier/evals';
import { parseSkillMarkdown } from '@atelier/schemas';

const SKILL_PATH = resolve(process.cwd(), 'skills/calendar-day-week-month.skill.md');

interface Outcome {
  name: string;
  capabilities: readonly string[];
  failure_mode_count: number;
  mentions_thresholds: boolean;
  mentions_timezone_footer: boolean;
}

export default defineEval({
  id: 'skill/calendar-day-week-month/contract',
  description:
    'calendar-day-week-month declares range.summary + event.list, pins density thresholds, and keeps the timezone-footer rule.',
  kind: 'skill',
  tags: ['contract', 'calendar', 'i18n'],
  input: SKILL_PATH,
  run: async (path: string): Promise<Outcome> => {
    const raw = await readFile(path, 'utf8');
    const parsed = parseSkillMarkdown(raw);
    return {
      name: parsed.skill.name,
      capabilities: parsed.skill.capabilities_used,
      failure_mode_count: parsed.skill.known_failure_modes.length,
      mentions_thresholds:
        />=\s*10|<\s*5/i.test(parsed.skill.example_flow) ||
        /events_per_day/i.test(parsed.skill.example_flow),
      mentions_timezone_footer:
        /timezone footer|times shown|user_tz|origin_tz/i.test(parsed.body) ||
        /timezone footer|times shown|user_tz|origin_tz/i.test(parsed.skill.example_flow),
    };
  },
  expected: (output: unknown): boolean => {
    const o = output as Outcome;
    return (
      o.name === 'calendar-day-week-month' &&
      o.capabilities.includes('calendar.event.list') &&
      o.capabilities.includes('calendar.range.summary') &&
      o.failure_mode_count >= 3 &&
      o.mentions_thresholds &&
      o.mentions_timezone_footer
    );
  },
});
