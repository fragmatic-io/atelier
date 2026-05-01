import { describe, expect, it } from 'vitest';
import { rateLimitedActionsShowState } from '../src/baseline/rate_limited_actions_show_state.ts';
import { baselineContext } from './fixtures/manifest.ts';

describe('rate_limited_actions_show_state', () => {
  it('passes when no rate-limited capabilities are referenced', () => {
    const ctx = baselineContext();
    const result = rateLimitedActionsShowState.evaluate(ctx);
    expect(result.ok).toBe(true);
  });

  it('warns when a rate-limited action is surfaced without a quota indicator', () => {
    const ctx = baselineContext();
    ctx.rate_limited_capability_ids = new Set(['thread.archive']);
    const result = rateLimitedActionsShowState.evaluate(ctx);
    expect(result.ok).toBe(false);
    expect(result.violations).toHaveLength(1);
    const v = result.violations[0]!;
    expect(v.severity).toBe('warn');
    expect(v.policy_id).toBe('rate_limited_actions_show_state');
    expect(v.message).toContain('thread.archive');
    expect(v.hint).toContain('.quota');
  });

  it('passes when a sibling node binds a `*.quota` data source', () => {
    const ctx = baselineContext();
    ctx.rate_limited_capability_ids = new Set(['thread.archive']);
    ctx.manifest.routes[1]!.layout!.children!.push({
      component: 'RateMeter',
      data: { source: 'thread.quota' },
    });
    const result = rateLimitedActionsShowState.evaluate(ctx);
    expect(result.ok).toBe(true);
  });

  it('passes when an ancestor exposes a `*.rate_limit` data source', () => {
    const ctx = baselineContext();
    ctx.rate_limited_capability_ids = new Set(['thread.archive']);
    // Reshape the route to wrap the layout in a parent that holds the quota.
    ctx.manifest.routes[1]!.layout = {
      component: 'Container',
      data: { source: 'app.rate_limit' },
      children: [ctx.manifest.routes[1]!.layout!],
    };
    const result = rateLimitedActionsShowState.evaluate(ctx);
    expect(result.ok).toBe(true);
  });

  it('passes when a deeply nested child of the action node binds a `*.usage` source', () => {
    const ctx = baselineContext();
    ctx.rate_limited_capability_ids = new Set(['thread.archive']);
    // Attach a usage-bound child to the action-bearing node so subtreeHasQuotaSource
    // walks recursively.
    const actionNode = ctx.manifest.routes[1]!.layout!.children![0]!;
    actionNode.children = [
      {
        component: 'Pane',
        children: [
          {
            component: 'UsageMeter',
            data: { source: 'thread.usage' },
          },
        ],
      },
    ];
    const result = rateLimitedActionsShowState.evaluate(ctx);
    expect(result.ok).toBe(true);
  });

  // Phase 2 #5 — ambient satisfaction. Hosts that mount a chrome rate-limit
  // chip declare it via `ambient_policy_satisfiers`; the policy clears the
  // obligation without finding a `*.rate_limit` data binding in the tree.
  it('passes when ambient_policy_satisfiers covers all rate-limited capabilities', () => {
    const ctx = baselineContext();
    ctx.rate_limited_capability_ids = new Set(['thread.archive']);
    ctx.ambient_policy_satisfiers = [
      { policyId: 'rate_limited_actions_show_state', satisfies: 'all' },
    ];
    const result = rateLimitedActionsShowState.evaluate(ctx);
    expect(result.ok).toBe(true);
  });

  it('passes when ambient_policy_satisfiers scopes coverage to the offending capability id', () => {
    const ctx = baselineContext();
    ctx.rate_limited_capability_ids = new Set(['thread.archive']);
    ctx.ambient_policy_satisfiers = [
      {
        policyId: 'rate_limited_actions_show_state',
        satisfies: [{ capabilityId: 'thread.archive' }],
      },
    ];
    const result = rateLimitedActionsShowState.evaluate(ctx);
    expect(result.ok).toBe(true);
  });

  it('still flags actions not covered by the ambient satisfier list', () => {
    const ctx = baselineContext();
    ctx.rate_limited_capability_ids = new Set(['thread.archive']);
    ctx.ambient_policy_satisfiers = [
      {
        policyId: 'rate_limited_actions_show_state',
        // Covers a different capability — does NOT cover `thread.archive`.
        satisfies: [{ capabilityId: 'mail.send' }],
      },
    ];
    const result = rateLimitedActionsShowState.evaluate(ctx);
    expect(result.ok).toBe(false);
    expect(result.violations[0]?.message).toContain('thread.archive');
  });

  it('ignores satisfiers declared for a different policy id', () => {
    const ctx = baselineContext();
    ctx.rate_limited_capability_ids = new Set(['thread.archive']);
    ctx.ambient_policy_satisfiers = [
      // Wrong policy — must not satisfy this one.
      { policyId: 'reversibility_surfaced', satisfies: 'all' },
    ];
    const result = rateLimitedActionsShowState.evaluate(ctx);
    expect(result.ok).toBe(false);
  });
});
