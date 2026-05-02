// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Pure helpers behind the `/admin/patterns` admin route.
 *
 * The admin page surfaces graduation candidates produced by a real
 * `SequenceDetector` so a PM / engineer can promote one to a recipe.
 *
 * This module is server-side only by intent (it touches the filesystem to
 * scaffold a recipe stub) but is purely synchronous and dep-free apart
 * from Node `fs` / `path`. Splitting it from the route file lets vitest
 * exercise it without bringing up Next.
 *
 * What lives here:
 *  - `seedDemoSequenceDetector` — feeds a deterministic synthetic stream
 *    into a fresh `SequenceDetector` so the route renders something
 *    interesting on first load (no real audit pipeline outside the
 *    monorepo yet).
 *  - `renderPatternRows` — translates the detector snapshot into a
 *    JSON-serializable shape the page component renders.
 *  - `buildRecipeStub` — pure: pattern → minimal recipe-stub JSON.
 *  - `proposeRecipePath` / `writeRecipeStub` — file-system scaffolding for
 *    `recipes/_proposed/<pattern_id>.json`. NOT a real promotion workflow;
 *    a human still reviews the stub before merging.
 *
 * Out of scope here (V-6 territory): merging the stub, bumping versions,
 * notifying an owner, running the full compile path on the proposed
 * recipe.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { SequenceDetector, type DetectedPattern, type ObservedAction } from '@atelier/policies';

export interface AdminPatternRow {
  pattern_id: string;
  description: string;
  occurrences: number;
  capability_ids: readonly string[];
  per_user: ReadonlyArray<{ user_id: string; count: number }>;
}

/**
 * Synthetic stream used to populate the admin route on first load.
 *
 * Two users converge on the `thread.archive` → `task.create` workaround
 * (the canonical workaround pattern from the README). A third user adds
 * a `mail.send` → `task.create` pair to demonstrate multi-pattern
 * surfacing, but only twice — below the default threshold of 3.
 *
 * Deterministic; same stream → same snapshot, every time.
 */
export const DEMO_OBSERVATIONS: readonly ObservedAction[] = [
  // u1 — repeats the workaround three times.
  {
    user_id: 'u1',
    app_id: 'cir.demo',
    capability_id: 'thread.archive',
    args_fingerprint: 'fp1',
    occurred_at: '2026-04-30T09:00:00Z',
  },
  {
    user_id: 'u1',
    app_id: 'cir.demo',
    capability_id: 'task.create',
    args_fingerprint: 'fp2',
    occurred_at: '2026-04-30T09:00:01Z',
  },
  {
    user_id: 'u1',
    app_id: 'cir.demo',
    capability_id: 'thread.archive',
    args_fingerprint: 'fp3',
    occurred_at: '2026-04-30T09:00:02Z',
  },
  {
    user_id: 'u1',
    app_id: 'cir.demo',
    capability_id: 'task.create',
    args_fingerprint: 'fp4',
    occurred_at: '2026-04-30T09:00:03Z',
  },
  // u2 — repeats the same workaround twice.
  {
    user_id: 'u2',
    app_id: 'cir.demo',
    capability_id: 'thread.archive',
    args_fingerprint: 'fp5',
    occurred_at: '2026-04-30T09:01:00Z',
  },
  {
    user_id: 'u2',
    app_id: 'cir.demo',
    capability_id: 'task.create',
    args_fingerprint: 'fp6',
    occurred_at: '2026-04-30T09:01:01Z',
  },
  // u3 — different pattern, only one occurrence; should not surface.
  {
    user_id: 'u3',
    app_id: 'cir.demo',
    capability_id: 'mail.send',
    args_fingerprint: 'fp7',
    occurred_at: '2026-04-30T09:02:00Z',
  },
  {
    user_id: 'u3',
    app_id: 'cir.demo',
    capability_id: 'task.create',
    args_fingerprint: 'fp8',
    occurred_at: '2026-04-30T09:02:01Z',
  },
];

/**
 * Build a fresh detector and feed it the synthetic stream. Returns the
 * detector so the caller can call `snapshot()` / `perUserCounts()` directly.
 */
export function seedDemoSequenceDetector(
  observations: readonly ObservedAction[] = DEMO_OBSERVATIONS,
): SequenceDetector {
  const detector = new SequenceDetector({ sequenceLengths: [2], threshold: 3 });
  for (const o of observations) detector.observe(o);
  return detector;
}

/**
 * Translate a detector snapshot into rows the page component renders.
 * Preserves the snapshot's existing ordering (highest occurrences first).
 */
export function renderPatternRows(detector: SequenceDetector): AdminPatternRow[] {
  return detector.snapshot().map((p) => ({
    pattern_id: p.pattern_id,
    description: p.description,
    occurrences: p.occurrences,
    capability_ids: detector.capabilitiesFor(p.pattern_id),
    per_user: Array.from(detector.perUserCounts(p.pattern_id))
      .map(([user_id, count]) => ({ user_id, count }))
      .sort((a, b) => b.count - a.count || a.user_id.localeCompare(b.user_id)),
  }));
}

/**
 * Pure: produces the JSON-serializable recipe stub for a detected pattern.
 * The shape is intentionally minimal — just enough metadata for a human
 * reviewer to recognise the pattern and convert it to a real recipe.
 */
export function buildRecipeStub(
  pattern: DetectedPattern,
  capability_ids: readonly string[],
  options: { generated_at?: string } = {},
): Record<string, unknown> {
  return {
    proposed_recipe_id: pattern.pattern_id,
    status: 'proposed',
    source: 'sequence-detector',
    generated_at: options.generated_at ?? '2026-04-30T00:00:00Z',
    description: pattern.description,
    occurrences: pattern.occurrences,
    capability_ids,
    notes: [
      'Auto-generated stub. Human reviewer must:',
      '  - Confirm the capability chain reflects a real workflow.',
      '  - Add a manifest fragment / route to graduate to a recipe.',
      '  - Move this file out of `_proposed/` once approved.',
    ],
  };
}

/** Default location for proposed recipe stubs (relative to repo root). */
export const PROPOSED_RECIPES_DIR = 'recipes/_proposed';

/**
 * Resolve the on-disk path a recipe stub will be written to.
 * `repoRoot` defaults to `process.cwd()` when called from within the repo
 * (the demo's Next.js dev server is started from the repo root).
 */
export function proposeRecipePath(pattern_id: string, repoRoot: string = process.cwd()): string {
  const safe = pattern_id.replace(/[^a-zA-Z0-9._-]/g, '_');
  return resolve(repoRoot, PROPOSED_RECIPES_DIR, `${safe}.json`);
}

export interface WriteRecipeStubResult {
  path: string;
  bytes: number;
  created: boolean;
}

/**
 * Scaffold a recipe stub on disk. Idempotent — if the file already exists
 * the function returns `created: false` and does not touch it.
 *
 * NOT a real promotion workflow. The full review flow is V-6 territory.
 */
export function writeRecipeStub(
  pattern: DetectedPattern,
  capability_ids: readonly string[],
  options: { repoRoot?: string; generated_at?: string } = {},
): WriteRecipeStubResult {
  const path = proposeRecipePath(pattern.pattern_id, options.repoRoot ?? process.cwd());
  if (existsSync(path)) {
    return { path, bytes: 0, created: false };
  }
  mkdirSync(dirname(path), { recursive: true });
  const stubOptions: { generated_at?: string } = {};
  if (options.generated_at !== undefined) stubOptions.generated_at = options.generated_at;
  const body = `${JSON.stringify(buildRecipeStub(pattern, capability_ids, stubOptions), null, 2)}\n`;
  writeFileSync(path, body, 'utf8');
  return { path, bytes: body.length, created: true };
}
