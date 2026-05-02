// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Skill eval: `skills/dashboard-with-stats.skill.md` parses cleanly,
 * references only real components in `components/registry.json`, and the
 * density rules from `when_to_use` (1–2 → hero, 3–5 → comfortable KPIRow,
 * 6+ → compact KPIRow) produce a testable predicate against a fixture
 * intent + manifest.
 *
 * Authored under Wave 6 / track SK-1 (Skill Library Breadth Pass) for
 * the dashboards / analytics / KPI category.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineEval } from '@atelier/evals';
import { parseSkillMarkdown } from '@atelier/schemas';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SKILL_PATH = resolve(__dirname, '../../skills/dashboard-with-stats.skill.md');
const REGISTRY_PATH = resolve(__dirname, '../../components/registry.json');

interface Fixture {
  intent: { route: string; stats_count: number };
  manifest: { components: string[] };
}

const FIXTURE: Fixture = {
  intent: { route: 'dashboard', stats_count: 4 },
  manifest: { components: ['Container', 'Stack', 'KPIRow', 'StatCard', 'Chart'] },
};

/** Density mode picked by the skill's `when_to_use` rules. */
function pickDensity(stats: number): 'hero' | 'comfortable' | 'compact' {
  if (stats <= 2) return 'hero';
  if (stats <= 5) return 'comfortable';
  return 'compact';
}

interface Outcome {
  name: string;
  version: string;
  capabilities_count: number;
  density_4: 'hero' | 'comfortable' | 'compact';
  density_8: 'hero' | 'comfortable' | 'compact';
  density_1: 'hero' | 'comfortable' | 'compact';
  unknown_components: string[];
  body_starts_with_heading: boolean;
  failure_mode_count: number;
}

export default defineEval({
  id: 'skill/dashboard-with-stats/contract',
  description:
    'dashboard-with-stats parses cleanly, references real components, and the density predicate matches the documented thresholds.',
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
      capabilities_count: parsed.skill.capabilities_used.length,
      density_4: pickDensity(fx.intent.stats_count),
      density_8: pickDensity(8),
      density_1: pickDensity(1),
      unknown_components,
      body_starts_with_heading: parsed.body.startsWith('# '),
      failure_mode_count: parsed.skill.known_failure_modes.length,
    };
  },
  expected: (output: unknown): boolean => {
    const o = output as Outcome;
    return (
      o.name === 'dashboard-with-stats' &&
      o.version === '1.0.0' &&
      o.capabilities_count >= 1 &&
      o.density_4 === 'comfortable' &&
      o.density_8 === 'compact' &&
      o.density_1 === 'hero' &&
      o.unknown_components.length === 0 &&
      o.body_starts_with_heading &&
      o.failure_mode_count >= 3
    );
  },
});
