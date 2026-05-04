// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { describe, expect, it, vi } from 'vitest';
import type { AuditEvent, Capability } from '@atelier/schemas';
import {
  ActionDispatcher,
  optimisticDispatch,
  _redactErrorMessageForTest,
} from '../../src/actions/dispatcher.js';
import type { AuditSink } from '../../src/audit/emit.js';
import { ALWAYS_CONFIRM } from '../../src/actions/confirm.js';
import { MapActionRegistry } from '../../src/registry/action-registry.js';
import type { UndoExecutionContext } from '../../src/actions/undo.js';

const ctx: UndoExecutionContext = {
  user_id: 'vid',
  app_id: 'cir.demo',
  manifest_id: 'm_test',
};

function captureSink(): { sink: AuditSink; events: AuditEvent[] } {
  const events: AuditEvent[] = [];
  return {
    events,
    sink: {
      emit(event) {
        events.push(event);
      },
    },
  };
}

const lowStakesCap: Capability = {
  id: 'cart.add',
  kind: 'action',
  version: '0.1.0',
  input: { product_id: 'number' },
  output: { cart_id: 'number' },
  side_effects: ['mutates:cart_state'],
  permissions: ['cart:write'],
  confirmation: 'inline',
  reversible: true,
  rollback: 'cart.remove',
  low_stakes: true,
};

const reversibleOnlyCap: Capability = {
  ...lowStakesCap,
  id: 'thread.archive',
  reversible: true,
  low_stakes: false,
};

const lowStakesOnlyCap: Capability = {
  ...lowStakesCap,
  id: 'thread.like',
  reversible: false,
  low_stakes: true,
};

interface CartInput {
  product_id: number;
  quantity: number;
}

interface CartOutcome {
  predicted_total: number;
}

function buildDispatcher(
  capabilityMap: Record<string, Capability>,
  handler?: (input: unknown, ctx: unknown) => Promise<unknown>,
  audit?: AuditSink,
): ActionDispatcher {
  const registry = new MapActionRegistry();
  for (const id of Object.keys(capabilityMap)) {
    if (handler) registry.register(id, handler);
  }
  return new ActionDispatcher({
    capabilities: capabilityMap,
    registry,
    confirm: ALWAYS_CONFIRM,
    ...(audit ? { audit } : {}),
  });
}

describe('optimisticDispatch', () => {
  it('applies optimistically and dispatches successfully when both flags set', async () => {
    const order: string[] = [];
    const handler = vi.fn((input: unknown) => {
      order.push('handler');
      return Promise.resolve({ cart_id: 1, ...(input as Record<string, unknown>) });
    });
    const { sink, events } = captureSink();
    const dispatcher = buildDispatcher({ 'cart.add': lowStakesCap }, handler, sink);

    const onApply = vi.fn(() => order.push('apply'));
    const onRollback = vi.fn();

    const result = await optimisticDispatch<CartInput, CartOutcome>(dispatcher, {
      capability: lowStakesCap,
      input: { product_id: 42, quantity: 1 },
      ctx,
      optimisticOutcome: () => ({ predicted_total: 1 }),
      onApply,
      onRollback,
    });

    expect(result.ok).toBe(true);
    expect(handler).toHaveBeenCalledOnce();
    expect(onApply).toHaveBeenCalledOnce();
    expect(onApply).toHaveBeenCalledWith({ predicted_total: 1 });
    expect(onRollback).not.toHaveBeenCalled();
    // Apply must run BEFORE the handler.
    expect(order).toEqual(['apply', 'handler']);
    expect(events.some((e) => e.type === 'action.optimistic_applied')).toBe(true);
    expect(events.some((e) => e.type === 'action.executed')).toBe(true);
    expect(events.some((e) => e.type === 'action.optimistic_rolled_back')).toBe(false);
  });

  it('rolls back with the synthesized outcome when dispatch returns ok=false', async () => {
    // Handler throws → dispatcher returns ok:false (denied path).
    const handler = vi.fn(() => Promise.reject(new Error('upstream-fail: api_key=abc-123-secret')));
    const { sink, events } = captureSink();
    const dispatcher = buildDispatcher({ 'cart.add': lowStakesCap }, handler, sink);

    const onApply = vi.fn();
    const onRollback = vi.fn();

    const result = await optimisticDispatch<CartInput, CartOutcome>(dispatcher, {
      capability: lowStakesCap,
      input: { product_id: 99, quantity: 1 },
      ctx,
      optimisticOutcome: () => ({ predicted_total: 7 }),
      onApply,
      onRollback,
    });

    expect(result.ok).toBe(false);
    expect(onApply).toHaveBeenCalledWith({ predicted_total: 7 });
    expect(onRollback).toHaveBeenCalledOnce();
    expect(onRollback).toHaveBeenCalledWith({ predicted_total: 7 }, expect.any(Error));
    expect(events.some((e) => e.type === 'action.optimistic_applied')).toBe(true);
    expect(events.some((e) => e.type === 'action.optimistic_rolled_back')).toBe(true);
  });

  it('rolls back when dispatch throws synchronously (e.g. unknown capability)', async () => {
    // Empty registry → dispatch returns ok:false. Use a different approach:
    // build a dispatcher whose `dispatch` itself rejects — wrap the underlying
    // call so we get a thrown rejection rather than ok:false.
    const dispatcher = buildDispatcher({ 'cart.add': lowStakesCap });
    const original = dispatcher.dispatch.bind(dispatcher);
    let invoked = 0;
    dispatcher.dispatch = vi.fn(
      (id: string, input: unknown, dctx: { user_id: string; app_id: string }) => {
        invoked += 1;
        if (invoked === 1) return Promise.reject(new Error('network down'));
        return original(id, input, dctx);
      },
    );

    const onApply = vi.fn();
    const onRollback = vi.fn();

    const result = await optimisticDispatch<CartInput, CartOutcome>(dispatcher, {
      capability: lowStakesCap,
      input: { product_id: 1, quantity: 1 },
      ctx,
      optimisticOutcome: () => ({ predicted_total: 3 }),
      onApply,
      onRollback,
    });

    expect(onApply).toHaveBeenCalledOnce();
    expect(onRollback).toHaveBeenCalledOnce();
    expect(result.ok).toBe(false);
    expect(result.error).toBe('network down');
  });

  it('passes through (non-optimistic) when reversible is true but low_stakes is false', async () => {
    const handler = vi.fn(() => Promise.resolve({ archived_at: 'now' }));
    const { sink, events } = captureSink();
    const dispatcher = buildDispatcher({ 'thread.archive': reversibleOnlyCap }, handler, sink);

    const onApply = vi.fn();
    const onRollback = vi.fn();

    const result = await optimisticDispatch(dispatcher, {
      capability: reversibleOnlyCap,
      input: { product_id: 1 },
      ctx,
      optimisticOutcome: () => ({ predicted: true }),
      onApply,
      onRollback,
    });

    expect(result.ok).toBe(true);
    expect(handler).toHaveBeenCalledOnce();
    expect(onApply).not.toHaveBeenCalled();
    expect(onRollback).not.toHaveBeenCalled();
    expect(events.some((e) => e.type === 'action.optimistic_applied')).toBe(false);
    expect(events.some((e) => e.type === 'action.executed')).toBe(true);
  });

  it('passes through (non-optimistic) when low_stakes is true but reversible is false', async () => {
    const handler = vi.fn(() => Promise.resolve({ liked: true }));
    const { sink, events } = captureSink();
    const dispatcher = buildDispatcher({ 'thread.like': lowStakesOnlyCap }, handler, sink);

    const onApply = vi.fn();
    const onRollback = vi.fn();

    const result = await optimisticDispatch(dispatcher, {
      capability: lowStakesOnlyCap,
      input: { product_id: 1 },
      ctx,
      optimisticOutcome: () => ({ predicted: true }),
      onApply,
      onRollback,
    });

    expect(result.ok).toBe(true);
    expect(onApply).not.toHaveBeenCalled();
    expect(onRollback).not.toHaveBeenCalled();
    expect(events.some((e) => e.type === 'action.optimistic_applied')).toBe(false);
  });

  it('emits action.optimistic_applied with capability id in trigger_chain', async () => {
    const handler = vi.fn(() => Promise.resolve({ cart_id: 2 }));
    const { sink, events } = captureSink();
    const dispatcher = buildDispatcher({ 'cart.add': lowStakesCap }, handler, sink);

    await optimisticDispatch(dispatcher, {
      capability: lowStakesCap,
      input: { product_id: 1, quantity: 1 },
      ctx,
      optimisticOutcome: () => ({ predicted_total: 1 }),
      onApply: () => undefined,
      onRollback: () => undefined,
    });

    // Ordering can vary because optimistic_applied is fire-and-forget — but
    // both events must be present and the optimistic event must carry the id.
    const applied = events.find((e) => e.type === 'action.optimistic_applied');
    expect(applied).toBeDefined();
    expect(applied?.trigger_chain).toContain('action:cart.add');
    expect(applied?.user_id).toBe('vid');
    expect(applied?.app_id).toBe('cir.demo');
    expect(applied?.manifest_id).toBe('m_test');
  });

  it('emits action.optimistic_rolled_back with redacted error in trigger_chain', async () => {
    const handler = vi.fn(() => Promise.reject(new Error('boom Bearer abc.def.ghi key=secret123')));
    const { sink, events } = captureSink();
    const dispatcher = buildDispatcher({ 'cart.add': lowStakesCap }, handler, sink);

    await optimisticDispatch(dispatcher, {
      capability: lowStakesCap,
      input: { product_id: 1, quantity: 1 },
      ctx,
      optimisticOutcome: () => ({ predicted_total: 1 }),
      onApply: () => undefined,
      onRollback: () => undefined,
    });

    const rolledBack = events.find((e) => e.type === 'action.optimistic_rolled_back');
    expect(rolledBack).toBeDefined();
    const reasonChain = rolledBack!.trigger_chain.find((c) => c.startsWith('reason:'));
    expect(reasonChain).toBeDefined();
    // Bearer + key= must be redacted; capability id must still be present.
    expect(reasonChain).not.toContain('abc.def.ghi');
    expect(reasonChain).not.toContain('secret123');
    expect(reasonChain).toContain('[REDACTED]');
    expect(rolledBack!.trigger_chain).toContain('action:cart.add');
  });

  it('does not include the input payload in any audit event', async () => {
    const handler = vi.fn(() => Promise.reject(new Error('failed')));
    const { sink, events } = captureSink();
    const dispatcher = buildDispatcher({ 'cart.add': lowStakesCap }, handler, sink);

    const sensitiveInput = { product_id: 1, quantity: 1, _api_key: 'sk-ant-secret-abc-1234567890' };

    await optimisticDispatch(dispatcher, {
      capability: lowStakesCap,
      input: sensitiveInput,
      ctx,
      optimisticOutcome: () => ({ predicted_total: 1 }),
      onApply: () => undefined,
      onRollback: () => undefined,
    });

    // No event should mention the API key — input payload is never serialized.
    for (const e of events) {
      const json = JSON.stringify(e);
      expect(json).not.toContain('sk-ant-secret');
      expect(json).not.toContain('_api_key');
    }
  });

  it('handles concurrent in-flight dispatches without clobbering outcomes', async () => {
    let resolveFirst!: (value: unknown) => void;
    let resolveSecond!: (value: unknown) => void;
    let call = 0;
    const handler = vi.fn(
      () =>
        new Promise((res) => {
          call += 1;
          if (call === 1) resolveFirst = res;
          else resolveSecond = res;
        }),
    );
    const { sink } = captureSink();
    const dispatcher = buildDispatcher({ 'cart.add': lowStakesCap }, handler, sink);

    const captured: Array<{ outcome: CartOutcome }> = [];
    const onApply = vi.fn((outcome: CartOutcome) => captured.push({ outcome }));
    const onRollback = vi.fn();

    const a = optimisticDispatch<CartInput, CartOutcome>(dispatcher, {
      capability: lowStakesCap,
      input: { product_id: 1, quantity: 1 },
      ctx,
      optimisticOutcome: (_input) => ({ predicted_total: 11 }),
      onApply,
      onRollback,
    });
    const b = optimisticDispatch<CartInput, CartOutcome>(dispatcher, {
      capability: lowStakesCap,
      input: { product_id: 2, quantity: 1 },
      ctx,
      optimisticOutcome: (_input) => ({ predicted_total: 22 }),
      onApply,
      onRollback,
    });

    // Resolve in reverse order: B succeeds, A fails. Each rollback must see
    // its own synthesized outcome regardless of ordering.
    resolveSecond({ cart_id: 2 });
    resolveFirst(Promise.reject(new Error('a-failed')));

    const [resA, resB] = await Promise.all([a, b]);

    expect(captured.map((c) => c.outcome.predicted_total).sort()).toEqual([11, 22]);
    expect(resB.ok).toBe(true);
    expect(resA.ok).toBe(false);
    // Rollback fired ONCE — only for the failing dispatch — and with A's
    // outcome (11), never with B's (22).
    expect(onRollback).toHaveBeenCalledOnce();
    expect(onRollback).toHaveBeenCalledWith({ predicted_total: 11 }, expect.any(Error));
  });

  it('synthesizes the outcome ONLY when optimistic mode is engaged', async () => {
    const handler = vi.fn(() => Promise.resolve({ archived_at: 'now' }));
    const synth = vi.fn(() => ({ predicted: true }));
    const dispatcher = buildDispatcher({ 'thread.archive': reversibleOnlyCap }, handler);

    await optimisticDispatch(dispatcher, {
      capability: reversibleOnlyCap,
      input: { product_id: 1 },
      ctx,
      optimisticOutcome: synth,
      onApply: () => undefined,
      onRollback: () => undefined,
    });

    expect(synth).not.toHaveBeenCalled();
  });

  it('forwards ctx (incl. manifest_id) into the underlying dispatch call', async () => {
    const seen: unknown[] = [];
    const handler = vi.fn((_input: unknown, dctx: unknown) => {
      seen.push(dctx);
      return Promise.resolve({ cart_id: 1 });
    });
    const dispatcher = buildDispatcher({ 'cart.add': lowStakesCap }, handler);

    await optimisticDispatch(dispatcher, {
      capability: lowStakesCap,
      input: { product_id: 1, quantity: 1 },
      ctx: { user_id: 'vid', app_id: 'cir.demo', manifest_id: 'm_xyz' },
      optimisticOutcome: () => ({ predicted_total: 1 }),
      onApply: () => undefined,
      onRollback: () => undefined,
    });

    expect(seen[0]).toMatchObject({
      user_id: 'vid',
      app_id: 'cir.demo',
      manifest_id: 'm_xyz',
    });
  });

  it('redactErrorMessage redacts Bearer tokens, sk-ant keys, and key= params', () => {
    expect(_redactErrorMessageForTest('Bearer abcDEF.123_xyz/foo+bar')).toBe('Bearer [REDACTED]');
    expect(_redactErrorMessageForTest('sk-ant-1234567890_abcdefg')).toBe('[REDACTED_API_KEY]');
    expect(_redactErrorMessageForTest('?api_key=secret-1234567890')).toBe('?api_key=[REDACTED]');
    expect(_redactErrorMessageForTest('hello world')).toBe('hello world');
  });
});
