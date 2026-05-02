// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Skill eval: `skills/time-range-selector.skill.md` parses cleanly and
 * the preset → filter-string convention from `when_to_use` produces the
 * documented `<time_field> >= now-<n>d` shape against a fixture intent.
 *
 * Pins the preset table so a future skill edit cannot silently change
 * the filter-string syntax the rest of the dashboards/* skills depend on.
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
const SKILL_PATH = resolve(__dirname, '../../skills/time-range-selector.skill.md');
const REGISTRY_PATH = resolve(__dirname, '../../components/registry.json');

type Preset = 'today' | '7d' | '30d';

interface Fixture {
  intent: { route: string; preset: Preset; time_field: string };
  manifest: { components: string[] };
}

const FIXTURE: Fixture = {
  intent: { route: 'dashboard', preset: '7d', time_field: 'received_at' },
  manifest: { components: ['FilterBar', 'ButtonGroup', 'Calendar'] },
};

const PRESET_DAYS: Record<Preset, number> = { today: 1, '7d': 7, '30d': 30 };

function buildFilter(preset: Preset, field: string): string {
  return `${field} >= now-${PRESET_DAYS[preset]}d`;
}

interface Outcome {
  name: string;
  version: string;
  filter_7d: string;
  filter_today: string;
  filter_30d: string;
  unknown_components: string[];
  body_mentions_default_7d: boolean;
  failure_mode_count: number;
}

export default defineEval({
  id: 'skill/time-range-selector/contract',
  description:
    'time-range-selector parses cleanly and the preset → filter-string predicate matches the documented shape for Today / 7d / 30d.',
  kind: 'skill',
  tags: ['contract', 'dashboards', 'sk-1'],
  input: FIXTURE,
  run: (fx: Fixture): Outcome => {
    const src = readFileSync(SKILL_PATH, 'utf8');
    const parsed = parseSkillMarkdown(src);
    const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8')) as Record<string, unknown>;
    const known = new Set(Object.keys(registry));
    const unknown_components = fx.manifest.components.filter((c) => !known.has(c));
    return {
      name: parsed.skill.name,
      version: parsed.skill.version,
      filter_7d: buildFilter(fx.intent.preset, fx.intent.time_field),
      filter_today: buildFilter('today', fx.intent.time_field),
      filter_30d: buildFilter('30d', fx.intent.time_field),
      unknown_components,
      body_mentions_default_7d: /default.*7d|7d.*default/i.test(parsed.skill.when_to_use),
      failure_mode_count: parsed.skill.known_failure_modes.length,
    };
  },
  expected: (output: unknown): boolean => {
    const o = output as Outcome;
    return (
      o.name === 'time-range-selector' &&
      o.version === '1.0.0' &&
      o.filter_7d === 'received_at >= now-7d' &&
      o.filter_today === 'received_at >= now-1d' &&
      o.filter_30d === 'received_at >= now-30d' &&
      o.unknown_components.length === 0 &&
      o.body_mentions_default_7d &&
      o.failure_mode_count >= 3
    );
  },
});
