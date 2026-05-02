// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for `lib/admin-patterns.ts` — the pure helpers behind the
 * `/admin/patterns` admin route. We exercise the data path (detector
 * snapshot → renderable rows) and the recipe-stub scaffolding without
 * importing Next.js server machinery.
 *
 * The route file itself is a thin adapter on top of these helpers.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEMO_OBSERVATIONS,
  buildRecipeStub,
  proposeRecipePath,
  renderPatternRows,
  seedDemoSequenceDetector,
  writeRecipeStub,
} from '../lib/admin-patterns';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'cir-admin-patterns-'));
});

afterEach(() => {
  if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
});

describe('seedDemoSequenceDetector + renderPatternRows', () => {
  it('surfaces the canonical archive→task workaround as a graduation candidate', () => {
    const detector = seedDemoSequenceDetector();
    const rows = renderPatternRows(detector);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const top = rows[0]!;
    expect(top.capability_ids).toEqual(['thread.archive', 'task.create']);
    expect(top.occurrences).toBeGreaterThanOrEqual(3);
    expect(top.per_user.map((u) => u.user_id)).toContain('u1');
    expect(top.per_user.map((u) => u.user_id)).toContain('u2');
  });

  it('does not surface the single-occurrence mail.send → task.create pair', () => {
    const detector = seedDemoSequenceDetector();
    const rows = renderPatternRows(detector);
    for (const row of rows) {
      expect(row.capability_ids[0]).not.toBe('mail.send');
    }
  });

  it('per_user counts add up to the total occurrences', () => {
    const detector = seedDemoSequenceDetector();
    const rows = renderPatternRows(detector);
    for (const row of rows) {
      const sum = row.per_user.reduce((acc, u) => acc + u.count, 0);
      expect(sum).toBe(row.occurrences);
    }
  });

  it('demo observation stream is non-trivial and uses ≥ 2 distinct users', () => {
    const users = new Set(DEMO_OBSERVATIONS.map((o) => o.user_id));
    expect(users.size).toBeGreaterThanOrEqual(2);
    expect(DEMO_OBSERVATIONS.length).toBeGreaterThanOrEqual(6);
  });
});

describe('buildRecipeStub', () => {
  it('produces a JSON-serializable, status:proposed stub', () => {
    const stub = buildRecipeStub(
      {
        pattern_id: 'seq_abc',
        description: 'archive → task',
        occurrences: 5,
      },
      ['thread.archive', 'task.create'],
      { generated_at: '2026-04-30T00:00:00Z' },
    );
    expect(stub['proposed_recipe_id']).toBe('seq_abc');
    expect(stub['status']).toBe('proposed');
    expect(stub['source']).toBe('sequence-detector');
    expect(stub['capability_ids']).toEqual(['thread.archive', 'task.create']);
    // Must be cleanly serializable.
    expect(() => JSON.stringify(stub)).not.toThrow();
  });
});

describe('proposeRecipePath', () => {
  it('lands under recipes/_proposed/ with a sanitised filename', () => {
    const path = proposeRecipePath('seq_abc/../../etc/passwd', '/tmp/cir-fake');
    expect(path.startsWith('/tmp/cir-fake/recipes/_proposed/')).toBe(true);
    // Path-traversal attempts must collapse into a single flat filename — the
    // separator replacement means there is exactly one path segment after
    // the proposed dir.
    const rest = path.slice('/tmp/cir-fake/recipes/_proposed/'.length);
    expect(rest).not.toContain('/');
    expect(rest.endsWith('.json')).toBe(true);
  });

  it('appends .json', () => {
    const path = proposeRecipePath('seq_abc', '/tmp/cir-fake');
    expect(path.endsWith('.json')).toBe(true);
  });
});

describe('writeRecipeStub', () => {
  it('creates the stub file with the expected contents', () => {
    const result = writeRecipeStub(
      { pattern_id: 'seq_demo', description: 'demo', occurrences: 4 },
      ['a.b', 'c.d'],
      { repoRoot: tmp, generated_at: '2026-04-30T00:00:00Z' },
    );
    expect(result.created).toBe(true);
    expect(existsSync(result.path)).toBe(true);
    const body = JSON.parse(readFileSync(result.path, 'utf8')) as Record<string, unknown>;
    expect(body['proposed_recipe_id']).toBe('seq_demo');
    expect(body['capability_ids']).toEqual(['a.b', 'c.d']);
  });

  it('is idempotent — second call returns created:false and does not overwrite', () => {
    const first = writeRecipeStub(
      { pattern_id: 'seq_idem', description: 'x', occurrences: 3 },
      ['a'],
      { repoRoot: tmp, generated_at: '2026-04-30T00:00:00Z' },
    );
    const before = readFileSync(first.path, 'utf8');
    const second = writeRecipeStub(
      { pattern_id: 'seq_idem', description: 'x', occurrences: 99 }, // different
      ['a'],
      { repoRoot: tmp, generated_at: '2026-04-30T00:00:00Z' },
    );
    expect(second.created).toBe(false);
    expect(readFileSync(second.path, 'utf8')).toBe(before);
  });
});
