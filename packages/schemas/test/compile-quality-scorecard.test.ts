// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for Sprint 2.4 compile-quality scorecard primitives —
 * `CompileQualityScorecardSchema` round-trip + `summariseScorecard`
 * green / amber / red transitions.
 */
import { describe, expect, it } from 'vitest';

import {
  CompileQualityScorecardSchema,
  summariseScorecard,
  type CompileQualityScorecard,
} from '../src/compile-quality-scorecard.js';

const baseScorecard: CompileQualityScorecard = {
  address: {
    scheme: 'atelier',
    author: 'acme',
    persona: 'founder-inbox',
    version: '1.0.0',
  },
  generated_at: '2026-05-04T04:00:00.000Z',
  reference_versions: {
    capabilities_hash: 'a'.repeat(64),
    components_hash: 'b'.repeat(64),
    compiler_version: 'fallback-generic',
  },
  compile_passed: true,
  schema_passed: true,
  policy_passed: true,
  snapshot_stable: true,
  cost_within_budget: true,
  notes: [],
};

describe('CompileQualityScorecardSchema', () => {
  it('accepts a minimal all-green scorecard (no optional metrics, empty notes)', () => {
    const out = CompileQualityScorecardSchema.safeParse(baseScorecard);
    expect(out.success).toBe(true);
    if (out.success) {
      expect(out.data).toEqual(baseScorecard);
    }
  });

  it('round-trips a fully-populated real-LLM scorecard with notes', () => {
    const full: CompileQualityScorecard = {
      ...baseScorecard,
      cost_usd: 0.0042,
      cost_p95_usd: 0.0061,
      compile_duration_ms: 1234,
      snapshot_stable: false,
      cost_within_budget: false,
      notes: [
        {
          check: 'snapshot',
          severity: 'warning',
          message: 'manifest_shape_hash drifted vs. baseline.',
        },
        {
          check: 'cost',
          severity: 'warning',
          message: 'p95 $0.0061 exceeds budget $0.005.',
        },
      ],
    };
    const out = CompileQualityScorecardSchema.safeParse(full);
    expect(out.success).toBe(true);
    if (out.success) {
      expect(out.data).toEqual(full);
    }
  });

  it('rejects a scorecard with an invalid address', () => {
    const bad = { ...baseScorecard, address: { ...baseScorecard.address, scheme: 'http' } };
    expect(CompileQualityScorecardSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a scorecard whose generated_at is not ISO-8601', () => {
    const bad = { ...baseScorecard, generated_at: 'last night' };
    expect(CompileQualityScorecardSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a scorecard missing one of the five required boolean checks', () => {
    const { compile_passed: _omit, ...rest } = baseScorecard;
    expect(CompileQualityScorecardSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects a note with an unknown check or severity', () => {
    const badCheck = {
      ...baseScorecard,
      notes: [{ check: 'budget', severity: 'error', message: 'no' }],
    };
    expect(CompileQualityScorecardSchema.safeParse(badCheck).success).toBe(false);
    const badSeverity = {
      ...baseScorecard,
      notes: [{ check: 'cost', severity: 'fatal', message: 'no' }],
    };
    expect(CompileQualityScorecardSchema.safeParse(badSeverity).success).toBe(false);
  });

  it('accepts info-severity notes attached to a passing check', () => {
    const ok: CompileQualityScorecard = {
      ...baseScorecard,
      notes: [
        {
          check: 'compile',
          severity: 'info',
          message: 'Fixture set bumped to 2026-05-03 baseline.',
        },
      ],
    };
    expect(CompileQualityScorecardSchema.safeParse(ok).success).toBe(true);
  });
});

describe('summariseScorecard', () => {
  it('green when every check passes', () => {
    const out = summariseScorecard(baseScorecard);
    expect(out.status).toBe('green');
    expect(out.failedChecks).toEqual([]);
  });

  it('amber when only snapshot fails', () => {
    const out = summariseScorecard({ ...baseScorecard, snapshot_stable: false });
    expect(out.status).toBe('amber');
    expect(out.failedChecks).toEqual(['snapshot']);
  });

  it('amber when only cost fails', () => {
    const out = summariseScorecard({ ...baseScorecard, cost_within_budget: false });
    expect(out.status).toBe('amber');
    expect(out.failedChecks).toEqual(['cost']);
  });

  it('amber when both snapshot AND cost fail (but compile/schema/policy pass)', () => {
    const out = summariseScorecard({
      ...baseScorecard,
      snapshot_stable: false,
      cost_within_budget: false,
    });
    expect(out.status).toBe('amber');
    expect(out.failedChecks).toEqual(['snapshot', 'cost']);
  });

  it('red when compile fails', () => {
    const out = summariseScorecard({ ...baseScorecard, compile_passed: false });
    expect(out.status).toBe('red');
    expect(out.failedChecks).toEqual(['compile']);
  });

  it('red when schema fails', () => {
    const out = summariseScorecard({ ...baseScorecard, schema_passed: false });
    expect(out.status).toBe('red');
    expect(out.failedChecks).toEqual(['schema']);
  });

  it('red when policy fails', () => {
    const out = summariseScorecard({ ...baseScorecard, policy_passed: false });
    expect(out.status).toBe('red');
    expect(out.failedChecks).toEqual(['policy']);
  });

  it('red trumps amber — schema fail + cost fail still produces red', () => {
    const out = summariseScorecard({
      ...baseScorecard,
      schema_passed: false,
      cost_within_budget: false,
    });
    expect(out.status).toBe('red');
    expect(out.failedChecks).toEqual(['schema', 'cost']);
  });

  it('failedChecks always lists in canonical compile→schema→policy→snapshot→cost order', () => {
    const out = summariseScorecard({
      ...baseScorecard,
      compile_passed: false,
      schema_passed: false,
      policy_passed: false,
      snapshot_stable: false,
      cost_within_budget: false,
    });
    expect(out.failedChecks).toEqual(['compile', 'schema', 'policy', 'snapshot', 'cost']);
  });
});
