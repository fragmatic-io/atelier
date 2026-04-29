import { describe, expect, it } from 'vitest';
import { BASELINE_POLICIES, validateManifest } from '../src/validate.ts';
import { baselineContext } from './fixtures/manifest.ts';
import type { NamedPolicy } from '../src/result.ts';

describe('validateManifest', () => {
  it('runs every BASELINE_POLICY and reports ok on the clean baseline', () => {
    const ctx = baselineContext();
    const result = validateManifest(ctx);
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('exposes all 5 baseline policies in stable order', () => {
    expect(BASELINE_POLICIES.map((p) => p.id)).toEqual([
      'data_access_within_grant',
      'confirmation_required_for_destructive',
      'no_pii_in_query_strings',
      'rate_limited_actions_show_state',
      'reversibility_surfaced',
    ]);
  });

  it('aggregates violations across multiple policies', () => {
    const ctx = baselineContext();
    // Force 3 different policies to fire:
    //  - data_access_within_grant: revoke a grant
    //  - confirmation_required_for_destructive: surface mail.send raw
    //  - no_pii_in_query_strings: add a route with PII
    ctx.intent.granted_fields = []; // breaks data binding
    ctx.manifest.routes[1]!.layout!.children!.push({
      component: 'Button',
      actions: ['mail.send'],
    });
    ctx.pii_fields = new Set(['email']);
    ctx.manifest.routes.push({ path: '/u/:email', title: 'User' });

    const result = validateManifest(ctx);
    expect(result.ok).toBe(false);
    const ids = new Set(result.violations.map((v) => v.policy_id));
    expect(ids.has('data_access_within_grant')).toBe(true);
    expect(ids.has('confirmation_required_for_destructive')).toBe(true);
    expect(ids.has('no_pii_in_query_strings')).toBe(true);
  });

  it('treats warn violations as failures only in strict mode', () => {
    const ctx = baselineContext();
    ctx.rate_limited_capability_ids = new Set(['thread.archive']);
    const lenient = validateManifest(ctx);
    expect(lenient.ok).toBe(true); // warn-only
    expect(lenient.violations.some((v) => v.severity === 'warn')).toBe(true);

    const strict = validateManifest(ctx, { strict: true });
    expect(strict.ok).toBe(false);
  });

  it('respects a custom `policies` override', () => {
    const ctx = baselineContext();
    const dummy: NamedPolicy = {
      id: 'always_warns',
      description: 'fixture',
      applies_to: 'manifest',
      severity: 'warn',
      evaluate: () => ({
        ok: false,
        violations: [
          {
            policy_id: 'always_warns',
            severity: 'warn',
            message: 'x',
            path: '/routes/0',
          },
        ],
      }),
    };
    const result = validateManifest(ctx, { policies: [dummy] });
    expect(result.violations).toHaveLength(1);
    expect(result.ok).toBe(true); // warn alone does not flip ok in lenient mode
    const strictResult = validateManifest(ctx, { policies: [dummy], strict: true });
    expect(strictResult.ok).toBe(false);
  });
});
