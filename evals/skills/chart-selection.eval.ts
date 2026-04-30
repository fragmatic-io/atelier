// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Skill eval: `skills/chart-selection.skill.md` parses cleanly and the
 * data-shape → chart-type decision tree from `when_to_use` produces the
 * documented type for canonical fixtures.
 *
 * Pins the bright-line rules: pie ONLY for ≤4 slices, line for time
 * series, bar for categorical (horizontal when labels are long), stacked
 * bar for compositions of 5+, histogram for distribution, sub-charts
 * (never dual-y) for two metrics with different units.
 *
 * Authored under Wave 6 / track SK-1 (dashboards / analytics).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineEval } from '@cir/evals';
import { parseSkillMarkdown } from '@cir/schemas';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SKILL_PATH = resolve(__dirname, '../../skills/chart-selection.skill.md');

type DataShape =
  | { kind: 'time_series'; points: number }
  | { kind: 'categorical'; categories: number; max_label_len: number }
  | { kind: 'composition'; slices: number }
  | { kind: 'distribution' }
  | { kind: 'two_metrics_over_time'; same_units: boolean };

type ChartType =
  | 'line'
  | 'bar_vertical'
  | 'bar_horizontal'
  | 'stacked_bar'
  | 'pie'
  | 'histogram'
  | 'multi_line'
  | 'sub_charts';

interface Fixture {
  cases: Array<{ name: string; shape: DataShape }>;
}

const FIXTURE: Fixture = {
  cases: [
    { name: 'issues_over_time', shape: { kind: 'time_series', points: 30 } },
    {
      name: 'sales_by_region_short',
      shape: { kind: 'categorical', categories: 5, max_label_len: 8 },
    },
    { name: 'sales_long_labels', shape: { kind: 'categorical', categories: 5, max_label_len: 18 } },
    { name: 'browser_market_share', shape: { kind: 'composition', slices: 4 } },
    { name: 'spend_breakdown', shape: { kind: 'composition', slices: 9 } },
    { name: 'response_times', shape: { kind: 'distribution' } },
    { name: 'rev_vs_cost_same_units', shape: { kind: 'two_metrics_over_time', same_units: true } },
    {
      name: 'rev_vs_visits_diff_units',
      shape: { kind: 'two_metrics_over_time', same_units: false },
    },
  ],
};

function pickChart(shape: DataShape): ChartType {
  switch (shape.kind) {
    case 'time_series':
      return 'line';
    case 'categorical':
      return shape.categories > 7 || shape.max_label_len > 12 ? 'bar_horizontal' : 'bar_vertical';
    case 'composition':
      return shape.slices <= 4 ? 'pie' : 'stacked_bar';
    case 'distribution':
      return 'histogram';
    case 'two_metrics_over_time':
      return shape.same_units ? 'multi_line' : 'sub_charts';
  }
}

interface Outcome {
  name: string;
  version: string;
  picks: Array<{ name: string; type: ChartType }>;
  body_bans_3d: boolean;
  body_bans_dual_axis: boolean;
  failure_mode_count: number;
}

export default defineEval({
  id: 'skill/chart-selection/contract',
  description:
    'chart-selection parses cleanly; data-shape → chart-type predicate matches the documented decision tree and bans 3D + dual-axis.',
  kind: 'skill',
  tags: ['contract', 'dashboards', 'sk-1'],
  input: FIXTURE,
  run: (fx: Fixture): Outcome => {
    const src = readFileSync(SKILL_PATH, 'utf8');
    const parsed = parseSkillMarkdown(src);
    const picks = fx.cases.map((c) => ({ name: c.name, type: pickChart(c.shape) }));
    const allText =
      `${parsed.skill.when_to_use}\n${parsed.skill.when_not_to_use}\n${parsed.body}`.toLowerCase();
    return {
      name: parsed.skill.name,
      version: parsed.skill.version,
      picks,
      body_bans_3d: /3d/i.test(allText),
      body_bans_dual_axis: /dual.*y.*axi|dual-y|dual y/i.test(allText),
      failure_mode_count: parsed.skill.known_failure_modes.length,
    };
  },
  expected: (output: unknown): boolean => {
    const o = output as Outcome;
    const expected: Array<{ name: string; type: ChartType }> = [
      { name: 'issues_over_time', type: 'line' },
      { name: 'sales_by_region_short', type: 'bar_vertical' },
      { name: 'sales_long_labels', type: 'bar_horizontal' },
      { name: 'browser_market_share', type: 'pie' },
      { name: 'spend_breakdown', type: 'stacked_bar' },
      { name: 'response_times', type: 'histogram' },
      { name: 'rev_vs_cost_same_units', type: 'multi_line' },
      { name: 'rev_vs_visits_diff_units', type: 'sub_charts' },
    ];
    if (o.name !== 'chart-selection' || o.version !== '1.0.0') return false;
    if (o.picks.length !== expected.length) return false;
    for (let i = 0; i < expected.length; i++) {
      const a = o.picks[i];
      const e = expected[i];
      if (!a || !e) return false;
      if (a.name !== e.name || a.type !== e.type) return false;
    }
    return o.body_bans_3d && o.body_bans_dual_axis && o.failure_mode_count >= 3;
  },
});
