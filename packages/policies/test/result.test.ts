import { describe, expect, it } from 'vitest';
import type {
  NamedPolicy,
  Policy,
  PolicyContext,
  PolicyResult,
  PolicyViolation,
} from '../src/result.ts';
import { baselineContext } from './fixtures/manifest.ts';

describe('result types', () => {
  it('compose at the type level: NamedPolicy holds a Policy whose result is a PolicyResult', () => {
    const fakePolicy: Policy = (_ctx: PolicyContext): PolicyResult => ({
      ok: true,
      violations: [],
    });
    const named: NamedPolicy = {
      id: 'fake',
      description: 'fake',
      applies_to: 'manifest',
      severity: 'warn',
      evaluate: fakePolicy,
    };
    const ctx = baselineContext();
    const result = named.evaluate(ctx);
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('PolicyViolation can carry an optional hint', () => {
    const v: PolicyViolation = {
      policy_id: 'x',
      severity: 'error',
      message: 'm',
      path: '/routes/0',
      hint: 'do something',
    };
    expect(v.hint).toBe('do something');
  });
});
