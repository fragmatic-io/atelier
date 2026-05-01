import { describe, expect, it } from 'vitest';
import { noPiiInQueryStrings } from '../src/baseline/no_pii_in_query_strings.js';
import { baselineContext } from './fixtures/manifest.js';

describe('no_pii_in_query_strings', () => {
  it('passes when pii_fields is empty (no policy data)', () => {
    const ctx = baselineContext();
    const result = noPiiInQueryStrings.evaluate(ctx);
    expect(result.ok).toBe(true);
  });

  it('passes when no route encodes a PII field', () => {
    const ctx = baselineContext();
    ctx.pii_fields = new Set(['email', 'phone', 'ssn']);
    const result = noPiiInQueryStrings.evaluate(ctx);
    expect(result.ok).toBe(true);
  });

  it('flags a PII placeholder in a route', () => {
    const ctx = baselineContext();
    ctx.pii_fields = new Set(['email']);
    ctx.manifest.routes.push({ path: '/u/:email', title: 'User' });
    const result = noPiiInQueryStrings.evaluate(ctx);
    expect(result.ok).toBe(false);
    expect(result.violations).toHaveLength(1);
    const v = result.violations[0]!;
    expect(v.message).toContain(':email');
    // newly pushed route is at index 2 (baseline has 0 and 1)
    expect(v.path).toBe('/routes/2/path');
  });

  it('flags a PII literal segment in a route', () => {
    const ctx = baselineContext();
    ctx.pii_fields = new Set(['ssn']);
    ctx.manifest.routes.push({ path: '/users/ssn/edit', title: 'Edit' });
    const result = noPiiInQueryStrings.evaluate(ctx);
    expect(result.ok).toBe(false);
    expect(result.violations[0]?.message).toContain('PII literal segment "ssn"');
  });

  it('does not double-count a placeholder as a literal segment', () => {
    const ctx = baselineContext();
    ctx.pii_fields = new Set(['email']);
    ctx.manifest.routes.push({ path: '/u/:email', title: 'User' });
    const result = noPiiInQueryStrings.evaluate(ctx);
    expect(result.violations).toHaveLength(1);
  });
});
