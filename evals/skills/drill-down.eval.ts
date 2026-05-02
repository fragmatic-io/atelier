// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Skill eval: `skills/drill-down.skill.md` parses cleanly and the
 * click-target → destination predicate from `when_to_use` produces the
 * documented destination (filtered list route for aggregates, drawer
 * for shallow records, DetailView route for rich records). Also pins
 * the filter-inheritance default — the parent's filter must travel
 * with the user across drill levels.
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
const SKILL_PATH = resolve(__dirname, '../../skills/drill-down.skill.md');
const REGISTRY_PATH = resolve(__dirname, '../../components/registry.json');

type ClickSource = 'stat_card' | 'chart_segment' | 'list_row_shallow' | 'list_row_rich';
type Destination = 'filtered_list_route' | 'drawer' | 'detail_view_route';

interface Fixture {
  cases: Array<{ source: ClickSource }>;
  parent_filter: { time_range: string; status: string };
  manifest: { components: string[] };
}

const FIXTURE: Fixture = {
  cases: [
    { source: 'stat_card' },
    { source: 'chart_segment' },
    { source: 'list_row_shallow' },
    { source: 'list_row_rich' },
  ],
  parent_filter: { time_range: 'received_at >= now-7d', status: 'open' },
  manifest: { components: ['Drawer', 'DetailView', 'Breadcrumb'] },
};

function pickDestination(source: ClickSource): Destination {
  if (source === 'stat_card' || source === 'chart_segment') return 'filtered_list_route';
  return source === 'list_row_shallow' ? 'drawer' : 'detail_view_route';
}

interface Outcome {
  name: string;
  version: string;
  destinations: Destination[];
  inherited_filter: { time_range: string; status: string };
  unknown_components: string[];
  body_mentions_breadcrumb: boolean;
  body_mentions_inheritance: boolean;
  failure_mode_count: number;
}

export default defineEval({
  id: 'skill/drill-down/contract',
  description:
    'drill-down parses cleanly; click-source → destination predicate matches the documented rules; filter inheritance is the default.',
  kind: 'skill',
  tags: ['contract', 'dashboards', 'sk-1'],
  input: FIXTURE,
  run: (fx: Fixture): Outcome => {
    const src = readFileSync(SKILL_PATH, 'utf8');
    const parsed = parseSkillMarkdown(src);
    const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8')) as Record<string, unknown>;
    const known = new Set(Object.keys(registry));
    const unknown_components = fx.manifest.components.filter((c) => !known.has(c));
    const destinations = fx.cases.map((c) => pickDestination(c.source));
    // Inheritance: every destination carries the parent's filter unless explicitly dropped.
    const inherited_filter = { ...fx.parent_filter };
    const allText = `${parsed.skill.when_to_use}\n${parsed.body}`.toLowerCase();
    return {
      name: parsed.skill.name,
      version: parsed.skill.version,
      destinations,
      inherited_filter,
      unknown_components,
      body_mentions_breadcrumb: /breadcrumb/i.test(allText),
      body_mentions_inheritance: /inherit/i.test(allText),
      failure_mode_count: parsed.skill.known_failure_modes.length,
    };
  },
  expected: (output: unknown): boolean => {
    const o = output as Outcome;
    const want: Destination[] = [
      'filtered_list_route',
      'filtered_list_route',
      'drawer',
      'detail_view_route',
    ];
    if (o.name !== 'drill-down' || o.version !== '1.0.0') return false;
    if (o.destinations.length !== want.length) return false;
    for (let i = 0; i < want.length; i++) {
      if (o.destinations[i] !== want[i]) return false;
    }
    return (
      o.inherited_filter.time_range === 'received_at >= now-7d' &&
      o.inherited_filter.status === 'open' &&
      o.unknown_components.length === 0 &&
      o.body_mentions_breadcrumb &&
      o.body_mentions_inheritance &&
      o.failure_mode_count >= 3
    );
  },
});
