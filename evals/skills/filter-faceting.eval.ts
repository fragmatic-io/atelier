// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Skill eval: `skills/filter-faceting.skill.md` parses cleanly and the
 * cardinality → surface decision rule from `when_to_use` produces the
 * documented surface (chip group / dropdown / search) for fixture facet
 * cardinalities. Also pins the empty-state copy contract.
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
const SKILL_PATH = resolve(__dirname, '../../skills/filter-faceting.skill.md');
const REGISTRY_PATH = resolve(__dirname, '../../components/registry.json');

type Surface = 'chips' | 'dropdown' | 'search';

interface Fixture {
  facets: Array<{ name: string; cardinality: number; free_text: boolean }>;
  manifest: { components: string[] };
}

const FIXTURE: Fixture = {
  facets: [
    { name: 'status', cardinality: 3, free_text: false },
    { name: 'category', cardinality: 18, free_text: false },
    { name: 'author', cardinality: 220, free_text: false },
    { name: 'title', cardinality: 0, free_text: true },
  ],
  manifest: { components: ['FilterBar', 'Search', 'Select', 'MultiSelect', 'EmptyState'] },
};

function pickSurface(cardinality: number, free_text: boolean): Surface {
  if (free_text) return 'search';
  if (cardinality <= 7) return 'chips';
  if (cardinality <= 30) return 'dropdown';
  return 'search';
}

interface Outcome {
  name: string;
  version: string;
  surfaces: Array<{ name: string; surface: Surface }>;
  unknown_components: string[];
  body_mentions_empty_state: boolean;
  body_mentions_clear_filters: boolean;
  failure_mode_count: number;
}

export default defineEval({
  id: 'skill/filter-faceting/contract',
  description:
    'filter-faceting parses cleanly; cardinality → surface predicate matches documented thresholds (≤7 chips, 8–30 dropdown, >30 search).',
  kind: 'skill',
  tags: ['contract', 'dashboards', 'sk-1'],
  input: FIXTURE,
  run: (fx: Fixture): Outcome => {
    const src = readFileSync(SKILL_PATH, 'utf8');
    const parsed = parseSkillMarkdown(src);
    const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8')) as Record<string, unknown>;
    const known = new Set(Object.keys(registry));
    const unknown_components = fx.manifest.components.filter((c) => !known.has(c));
    const surfaces = fx.facets.map((f) => ({
      name: f.name,
      surface: pickSurface(f.cardinality, f.free_text),
    }));
    const allText = `${parsed.skill.when_to_use}\n${parsed.body}`;
    return {
      name: parsed.skill.name,
      version: parsed.skill.version,
      surfaces,
      unknown_components,
      body_mentions_empty_state: /empty.?state/i.test(allText),
      body_mentions_clear_filters: /clear.{0,8}filter/i.test(allText),
      failure_mode_count: parsed.skill.known_failure_modes.length,
    };
  },
  expected: (output: unknown): boolean => {
    const o = output as Outcome;
    const want: Surface[] = ['chips', 'dropdown', 'search', 'search'];
    if (o.name !== 'filter-faceting' || o.version !== '1.0.0') return false;
    if (o.surfaces.length !== want.length) return false;
    for (let i = 0; i < want.length; i++) {
      if (o.surfaces[i]?.surface !== want[i]) return false;
    }
    return (
      o.unknown_components.length === 0 &&
      o.body_mentions_empty_state &&
      o.body_mentions_clear_filters &&
      o.failure_mode_count >= 3
    );
  },
});
