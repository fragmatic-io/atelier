import { describe, expect, it } from 'vitest';
import { confirmationRequiredForDestructive } from '../src/baseline/confirmation_required_for_destructive.js';
import { baselineContext } from './fixtures/manifest.js';
import type { LayoutNode } from '@cir/schemas';

describe('confirmation_required_for_destructive', () => {
  it('passes when no destructive actions are surfaced', () => {
    const ctx = baselineContext();
    const result = confirmationRequiredForDestructive.evaluate(ctx);
    expect(result.ok).toBe(true);
  });

  it('flags a destructive action surfaced without ConfirmDialog or confirmation prop', () => {
    const ctx = baselineContext();
    // Add a Button that fires `mail.send` (destructive: send) with no gate
    const route = ctx.manifest.routes[1];
    expect(route?.layout).toBeDefined();
    route!.layout!.children!.push({
      component: 'Button',
      actions: ['mail.send'],
    });
    const result = confirmationRequiredForDestructive.evaluate(ctx);
    expect(result.ok).toBe(false);
    expect(result.violations).toHaveLength(1);
    const v = result.violations[0]!;
    expect(v.policy_id).toBe('confirmation_required_for_destructive');
    expect(v.message).toContain('mail.send');
    expect(v.path).toMatch(/\/routes\/1\/layout\/children\/\d+\/actions\/0/);
  });

  it('passes when a destructive action is gated by a ConfirmDialog ancestor', () => {
    const ctx = baselineContext();
    const route = ctx.manifest.routes[1];
    const confirmedNode: LayoutNode = {
      component: 'ConfirmDialog',
      children: [
        {
          component: 'Button',
          actions: ['mail.send'],
        },
      ],
    };
    route!.layout!.children!.push(confirmedNode);
    const result = confirmationRequiredForDestructive.evaluate(ctx);
    expect(result.ok).toBe(true);
  });

  it('passes when the node carries a `confirmation: modal` prop', () => {
    const ctx = baselineContext();
    const route = ctx.manifest.routes[1];
    route!.layout!.children!.push({
      component: 'Button',
      actions: ['mail.send'],
      props: { confirmation: 'modal' },
    });
    const result = confirmationRequiredForDestructive.evaluate(ctx);
    expect(result.ok).toBe(true);
  });

  it('flags an unresolved action capability', () => {
    const ctx = baselineContext();
    const route = ctx.manifest.routes[1];
    route!.layout!.children!.push({
      component: 'Button',
      actions: ['ghost.action'],
    });
    const result = confirmationRequiredForDestructive.evaluate(ctx);
    expect(result.ok).toBe(false);
    expect(result.violations[0]?.message).toContain('unresolved capability "ghost.action"');
  });

  it('passes when the node ITSELF is a ConfirmDialog carrying the destructive action', () => {
    const ctx = baselineContext();
    const route = ctx.manifest.routes[1];
    route!.layout!.children!.push({
      component: 'ConfirmDialog',
      actions: ['mail.send'],
    });
    const result = confirmationRequiredForDestructive.evaluate(ctx);
    expect(result.ok).toBe(true);
  });

  it('treats `confirmation: inline` as insufficient', () => {
    const ctx = baselineContext();
    const route = ctx.manifest.routes[1];
    route!.layout!.children!.push({
      component: 'Button',
      actions: ['mail.send'],
      props: { confirmation: 'inline' },
    });
    const result = confirmationRequiredForDestructive.evaluate(ctx);
    expect(result.ok).toBe(false);
  });
});
