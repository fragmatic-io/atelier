// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Skill eval: `skills/kpi-row-density.skill.md` parses cleanly and the
 * per-card shape predicate from `when_to_use` produces the documented
 * shape (stat-only / stat + delta / stat + sparkline) for fixture stats.
 *
 * Critically, this eval pins the delta-color override semantics: when
 * `intent.global_preferences.delta_color_semantics` flags a metric as
 * `negative_is_good`, a negative delta is GREEN (good news), not red.
 * That single rule is the most common dashboard correctness bug this
 * skill exists to prevent.
 *
 * Authored under Wave 6 / track SK-1 (dashboards / analytics).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineEval } from '@atelier/evals';
import { parseSkillMarkdown } from '@atelier/schemas';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SKILL_PATH = resolve(__dirname, '../../skills/kpi-row-density.skill.md');

interface Stat {
  label: string;
  value: number;
  delta?: number;
  series?: number[];
}

interface Fixture {
  intent: { delta_color_semantics: Record<string, 'positive_is_good' | 'negative_is_good'> };
  manifest: { stats: Array<{ id: string; stat: Stat }>; row_density: 'comfortable' | 'compact' };
}

const FIXTURE: Fixture = {
  intent: {
    delta_color_semantics: {
      error_rate: 'negative_is_good',
      revenue: 'positive_is_good',
    },
  },
  manifest: {
    row_density: 'comfortable',
    stats: [
      {
        id: 'revenue',
        stat: { label: 'Revenue', value: 1234, delta: 12, series: [1, 2, 3, 4, 5, 6] },
      },
      { id: 'error_rate', stat: { label: 'Error rate', value: 0.02, delta: -3 } },
      { id: 'status', stat: { label: 'Status', value: 1 } },
    ],
  },
};

type Shape = 'sparkline' | 'delta' | 'stat-only';
type Color = 'green' | 'red' | 'neutral';

function pickShape(s: Stat, density: 'comfortable' | 'compact'): Shape {
  if (density === 'comfortable' && s.series && s.series.length >= 5) return 'sparkline';
  if (typeof s.delta === 'number') return 'delta';
  return 'stat-only';
}

function deltaColor(
  id: string,
  delta: number | undefined,
  semantics: Record<string, 'positive_is_good' | 'negative_is_good'>,
): Color {
  if (typeof delta !== 'number' || delta === 0) return 'neutral';
  const semantic = semantics[id] ?? 'positive_is_good';
  const isGood =
    (delta > 0 && semantic === 'positive_is_good') ||
    (delta < 0 && semantic === 'negative_is_good');
  return isGood ? 'green' : 'red';
}

interface Outcome {
  name: string;
  version: string;
  shapes: Shape[];
  colors: Color[];
  body_mentions_demote: boolean;
  failure_mode_count: number;
}

export default defineEval({
  id: 'skill/kpi-row-density/contract',
  description:
    'kpi-row-density parses cleanly; shape and delta-color predicates match documented rules including the negative_is_good override.',
  kind: 'skill',
  tags: ['contract', 'dashboards', 'sk-1'],
  input: FIXTURE,
  run: (fx: Fixture): Outcome => {
    const src = readFileSync(SKILL_PATH, 'utf8');
    const parsed = parseSkillMarkdown(src);
    const shapes = fx.manifest.stats.map((s) => pickShape(s.stat, fx.manifest.row_density));
    const colors = fx.manifest.stats.map((s) =>
      deltaColor(s.id, s.stat.delta, fx.intent.delta_color_semantics),
    );
    return {
      name: parsed.skill.name,
      version: parsed.skill.version,
      shapes,
      colors,
      body_mentions_demote: /demote/i.test(parsed.body),
      failure_mode_count: parsed.skill.known_failure_modes.length,
    };
  },
  expected: (output: unknown): boolean => {
    const o = output as Outcome;
    return (
      o.name === 'kpi-row-density' &&
      o.version === '1.0.0' &&
      o.shapes[0] === 'sparkline' &&
      o.shapes[1] === 'delta' &&
      o.shapes[2] === 'stat-only' &&
      // revenue +12 → positive_is_good → green
      // error_rate -3 → negative_is_good → green (the override)
      // status no delta → neutral
      o.colors[0] === 'green' &&
      o.colors[1] === 'green' &&
      o.colors[2] === 'neutral' &&
      o.body_mentions_demote &&
      o.failure_mode_count >= 3
    );
  },
});
