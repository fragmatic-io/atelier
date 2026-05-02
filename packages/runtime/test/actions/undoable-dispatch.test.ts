// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Undoable-dispatch tests — Wave 7b / Int-8.
 *
 * Covers the `undoable: true` capability flag plumbed through
 * `ActionDispatcher.dispatch()` + `undoFromToken()`. Uses a hand-rolled
 * `UndoTimer` injection seam to exercise the expiry timer without
 * leaning on `vi.useFakeTimers()` so concurrent tokens don't share a
 * global clock.
 */

import { describe, expect, it } from 'vitest';
import type { AuditEvent, Capability } from '@atelier/schemas';
import {
  ActionDispatcher,
  DEFAULT_UNDO_WINDOW_MS,
  UndoExpiredError,
  type UndoTimer,
} from '../../src/actions/dispatcher.js';
import type { AuditSink } from '../../src/audit/emit.js';
import { ALWAYS_CONFIRM } from '../../src/actions/confirm.js';
import { MapActionRegistry } from '../../src/registry/action-registry.js';

const ctx = { user_id: 'vid', app_id: 'cir.demo', manifest_id: 'm_test' };

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

/**
 * Manual scheduler so each test owns its timeline. `fire(handle)` runs the
 * registered callback exactly once; `fireAll()` flushes every pending
 * handle so end-of-test cleanup is unambiguous.
 */
function makeManualTimer(): UndoTimer & {
  pending: Map<number, () => void>;
  fire: (handle: number) => void;
  fireAll: () => void;
} {
  let next = 0;
  const pending = new Map<number, () => void>();
  return {
    pending,
    setTimeout(handler) {
      next += 1;
      pending.set(next, handler);
      return next;
    },
    clearTimeout(handle) {
      pending.delete(handle as number);
    },
    fire(handle) {
      const fn = pending.get(handle);
      if (!fn) return;
      pending.delete(handle);
      fn();
    },
    fireAll() {
      const fns = [...pending.values()];
      pending.clear();
      for (const fn of fns) fn();
    },
  };
}

function undoableArchive(overrides: Partial<Capability> = {}): Record<string, Capability> {
  return {
    'thread.archive': {
      id: 'thread.archive',
      kind: 'action',
      version: '1.0.0',
      input: { thread_id: 'string' },
      output: {},
      side_effects: ['archive', 'mutates:thread_state'],
      permissions: ['thread:write'],
      confirmation: 'none',
      reversible: true,
      rollback: 'thread.unarchive',
      undoable: true,
      ...overrides,
    },
    'thread.unarchive': {
      id: 'thread.unarchive',
      kind: 'action',
      version: '1.0.0',
      input: { thread_id: 'string' },
      output: {},
      side_effects: ['mutates:thread_state'],
      permissions: ['thread:write'],
      confirmation: 'none',
      reversible: true,
      rollback: 'thread.archive',
    },
  };
}

describe('ActionDispatcher — undoable dispatch', () => {
  it('dispatch of an undoable capability emits action.undoable_window_open and returns a token', async () => {
    const { sink, events } = captureSink();
    const registry = new MapActionRegistry();
    registry.register('thread.archive', () => Promise.resolve({ archived_at: 'now' }));
    const timer = makeManualTimer();
    const dispatcher = new ActionDispatcher({
      capabilities: undoableArchive(),
      registry,
      confirm: ALWAYS_CONFIRM,
      audit: sink,
      timer,
      generateUndoToken: () => 'token-A',
      nowMs: () => 1_700_000_000_000,
    });
    const result = await dispatcher.dispatch('thread.archive', { thread_id: 't1' }, ctx);
    expect(result.ok).toBe(true);
    expect(result.undo_token).toBe('token-A');
    expect(result.undo_window_ms).toBe(DEFAULT_UNDO_WINDOW_MS);
    expect(result.undo_expires_at).toBe(new Date(1_700_000_000_000 + 5000).toISOString());
    const open = events.find((e) => e.type === 'action.undoable_window_open');
    expect(open).toBeTruthy();
    expect(open?.trigger_chain).toContain('action:thread.archive');
    expect(open?.trigger_chain).toContain('undo_token:token-A');
    timer.fireAll();
  });

  it('undoFromToken within the window invokes the rollback handler and emits action.undone', async () => {
    const { sink, events } = captureSink();
    const registry = new MapActionRegistry();
    let rollbackCalledWith: unknown;
    registry.register('thread.archive', () => Promise.resolve({}));
    registry.register('thread.unarchive', (input) => {
      rollbackCalledWith = input;
      return Promise.resolve({ unarchived: true });
    });
    const timer = makeManualTimer();
    const dispatcher = new ActionDispatcher({
      capabilities: undoableArchive(),
      registry,
      confirm: ALWAYS_CONFIRM,
      audit: sink,
      timer,
      generateUndoToken: () => 'token-B',
    });
    const dispatched = await dispatcher.dispatch('thread.archive', { thread_id: 't42' }, ctx);
    const undone = await dispatcher.undoFromToken(dispatched.undo_token!);
    expect(undone.ok).toBe(true);
    expect(undone.original_event_id).toBe(dispatched.audit_id);
    expect(undone.undo_token).toBe('token-B');
    expect(rollbackCalledWith).toEqual({ thread_id: 't42' });
    const undoneEvent = events.find((e) => e.type === 'action.undone');
    expect(undoneEvent).toBeTruthy();
    expect(undoneEvent?.trigger_chain).toContain('undo_token:token-B');
    expect(undoneEvent?.trigger_chain).toContain(`original_event_id:${dispatched.audit_id!}`);
    // Timer was cancelled on redemption — no expired event should fire.
    timer.fireAll();
    expect(events.some((e) => e.type === 'action.undo_window_expired')).toBe(false);
  });

  it('window expiry emits action.undo_window_expired and clears the token', async () => {
    const { sink, events } = captureSink();
    const registry = new MapActionRegistry();
    registry.register('thread.archive', () => Promise.resolve({}));
    registry.register('thread.unarchive', () => Promise.resolve({}));
    const timer = makeManualTimer();
    const dispatcher = new ActionDispatcher({
      capabilities: undoableArchive(),
      registry,
      confirm: ALWAYS_CONFIRM,
      audit: sink,
      timer,
      generateUndoToken: () => 'token-C',
    });
    await dispatcher.dispatch('thread.archive', { thread_id: 't3' }, ctx);
    expect(dispatcher.openUndoTokenCount()).toBe(1);
    timer.fireAll();
    // Microtask flush so the async emit promise lands before assertions.
    await Promise.resolve();
    expect(dispatcher.openUndoTokenCount()).toBe(0);
    const expired = events.find((e) => e.type === 'action.undo_window_expired');
    expect(expired).toBeTruthy();
    expect(expired?.trigger_chain).toContain('undo_token:token-C');
  });

  it('undoFromToken after expiry throws UndoExpiredError', async () => {
    const { sink } = captureSink();
    const registry = new MapActionRegistry();
    registry.register('thread.archive', () => Promise.resolve({}));
    registry.register('thread.unarchive', () => Promise.resolve({}));
    const timer = makeManualTimer();
    const dispatcher = new ActionDispatcher({
      capabilities: undoableArchive(),
      registry,
      confirm: ALWAYS_CONFIRM,
      audit: sink,
      timer,
      generateUndoToken: () => 'token-D',
    });
    const dispatched = await dispatcher.dispatch('thread.archive', { thread_id: 't4' }, ctx);
    timer.fireAll();
    await Promise.resolve();
    await expect(dispatcher.undoFromToken(dispatched.undo_token!)).rejects.toBeInstanceOf(
      UndoExpiredError,
    );
  });

  it('undoFromToken with an unknown token throws UndoExpiredError', async () => {
    const dispatcher = new ActionDispatcher({
      capabilities: undoableArchive(),
      registry: new MapActionRegistry(),
      confirm: ALWAYS_CONFIRM,
    });
    await expect(dispatcher.undoFromToken('never-issued')).rejects.toBeInstanceOf(UndoExpiredError);
  });

  it('non-undoable capability returns no token and emits no window-open event', async () => {
    const { sink, events } = captureSink();
    const caps = undoableArchive({ undoable: false });
    const registry = new MapActionRegistry();
    registry.register('thread.archive', () => Promise.resolve({}));
    const timer = makeManualTimer();
    const dispatcher = new ActionDispatcher({
      capabilities: caps,
      registry,
      confirm: ALWAYS_CONFIRM,
      audit: sink,
      timer,
    });
    const result = await dispatcher.dispatch('thread.archive', { thread_id: 't5' }, ctx);
    expect(result.ok).toBe(true);
    expect(result.undo_token).toBeUndefined();
    expect(result.undo_expires_at).toBeUndefined();
    expect(events.some((e) => e.type === 'action.undoable_window_open')).toBe(false);
    expect(timer.pending.size).toBe(0);
  });

  it('honours capability-declared undo_window_ms', async () => {
    const registry = new MapActionRegistry();
    registry.register('thread.archive', () => Promise.resolve({}));
    const timer = makeManualTimer();
    const scheduledMs: number[] = [];
    const wrappedTimer: UndoTimer = {
      setTimeout(handler, ms) {
        scheduledMs.push(ms);
        return timer.setTimeout(handler, ms);
      },
      clearTimeout: timer.clearTimeout,
    };
    const dispatcher = new ActionDispatcher({
      capabilities: undoableArchive({ undo_window_ms: 12_000 }),
      registry,
      confirm: ALWAYS_CONFIRM,
      timer: wrappedTimer,
      nowMs: () => 1_700_000_000_000,
    });
    const result = await dispatcher.dispatch('thread.archive', { thread_id: 't6' }, ctx);
    expect(result.undo_window_ms).toBe(12_000);
    expect(result.undo_expires_at).toBe(new Date(1_700_000_000_000 + 12_000).toISOString());
    expect(scheduledMs).toEqual([12_000]);
    timer.fireAll();
  });

  it('concurrent undoable dispatches mint distinct tokens that survive independent expiry', async () => {
    const { sink, events } = captureSink();
    const registry = new MapActionRegistry();
    registry.register('thread.archive', () => Promise.resolve({}));
    registry.register('thread.unarchive', () => Promise.resolve({}));
    const timer = makeManualTimer();
    const tokens = ['tok-1', 'tok-2', 'tok-3'];
    let i = 0;
    const dispatcher = new ActionDispatcher({
      capabilities: undoableArchive(),
      registry,
      confirm: ALWAYS_CONFIRM,
      audit: sink,
      timer,
      generateUndoToken: () => tokens[i++]!,
    });
    const r1 = await dispatcher.dispatch('thread.archive', { thread_id: 'a' }, ctx);
    const r2 = await dispatcher.dispatch('thread.archive', { thread_id: 'b' }, ctx);
    const r3 = await dispatcher.dispatch('thread.archive', { thread_id: 'c' }, ctx);
    expect([r1.undo_token, r2.undo_token, r3.undo_token]).toEqual(tokens);
    expect(dispatcher.openUndoTokenCount()).toBe(3);
    // Redeem the second one — the others remain open.
    const undone = await dispatcher.undoFromToken('tok-2');
    expect(undone.original_event_id).toBe(r2.audit_id);
    expect(dispatcher.openUndoTokenCount()).toBe(2);
    expect(dispatcher.peekUndoToken('tok-1')?.capability_id).toBe('thread.archive');
    expect(dispatcher.peekUndoToken('tok-2')).toBeUndefined();
    timer.fireAll();
    await Promise.resolve();
    expect(dispatcher.openUndoTokenCount()).toBe(0);
    // Two expiry events for the unredeemed tokens.
    const expiredTokens = events
      .filter((e) => e.type === 'action.undo_window_expired')
      .flatMap((e) => e.trigger_chain.filter((t) => t.startsWith('undo_token:')));
    expect(new Set(expiredTokens)).toEqual(new Set(['undo_token:tok-1', 'undo_token:tok-3']));
  });

  it('non-reversible undoable capability does NOT open a window (defensive)', async () => {
    // Authoring `undoable: true` without `reversible: true && rollback` is a
    // mistake; the dispatcher refuses to mint a token rather than render
    // a toast that points nowhere.
    const broken: Record<string, Capability> = {
      'mail.send': {
        id: 'mail.send',
        kind: 'action',
        version: '1.0.0',
        input: { draft_id: 'string' },
        output: {},
        side_effects: ['send'],
        permissions: ['mail:send'],
        confirmation: 'none',
        reversible: false,
        undoable: true,
      },
    };
    const { sink, events } = captureSink();
    const registry = new MapActionRegistry();
    registry.register('mail.send', () => Promise.resolve({}));
    const dispatcher = new ActionDispatcher({
      capabilities: broken,
      registry,
      confirm: ALWAYS_CONFIRM,
      audit: sink,
    });
    const result = await dispatcher.dispatch('mail.send', { draft_id: 'd1' }, ctx);
    expect(result.ok).toBe(true);
    expect(result.undo_token).toBeUndefined();
    expect(events.some((e) => e.type === 'action.undoable_window_open')).toBe(false);
  });

  it('undoable dispatch audit events never carry the original input', async () => {
    const { sink, events } = captureSink();
    const registry = new MapActionRegistry();
    registry.register('thread.archive', () => Promise.resolve({}));
    registry.register('thread.unarchive', () => Promise.resolve({}));
    const timer = makeManualTimer();
    const dispatcher = new ActionDispatcher({
      capabilities: undoableArchive(),
      registry,
      confirm: ALWAYS_CONFIRM,
      audit: sink,
      timer,
      generateUndoToken: () => 'token-secret-redaction',
    });
    const sensitive = { thread_id: 't-sensitive', secret: 'sk-DO_NOT_LEAK' };
    await dispatcher.dispatch('thread.archive', sensitive, ctx);
    await dispatcher.undoFromToken('token-secret-redaction');
    timer.fireAll();
    for (const e of events) {
      const serialized = JSON.stringify(e);
      expect(serialized.includes('sk-DO_NOT_LEAK'), `audit ${e.type} leaked input`).toBe(false);
      expect(serialized.includes('t-sensitive'), `audit ${e.type} leaked input`).toBe(false);
    }
  });

  it('default undo token generator produces UUID-shaped strings', async () => {
    const registry = new MapActionRegistry();
    registry.register('thread.archive', () => Promise.resolve({}));
    const timer = makeManualTimer();
    const dispatcher = new ActionDispatcher({
      capabilities: undoableArchive(),
      registry,
      confirm: ALWAYS_CONFIRM,
      timer,
    });
    const r = await dispatcher.dispatch('thread.archive', { thread_id: 't-uuid' }, ctx);
    expect(r.undo_token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    timer.fireAll();
  });

  it('audit sink failures never break dispatch or undoFromToken', async () => {
    const registry = new MapActionRegistry();
    registry.register('thread.archive', () => Promise.resolve({}));
    registry.register('thread.unarchive', () => Promise.resolve({}));
    const timer = makeManualTimer();
    const failing: AuditSink = {
      emit() {
        throw new Error('sink down');
      },
    };
    const dispatcher = new ActionDispatcher({
      capabilities: undoableArchive(),
      registry,
      confirm: ALWAYS_CONFIRM,
      audit: failing,
      timer,
      generateUndoToken: () => 'token-failing-sink',
    });
    const r = await dispatcher.dispatch('thread.archive', { thread_id: 't' }, ctx);
    expect(r.ok).toBe(true);
    const undone = await dispatcher.undoFromToken('token-failing-sink');
    expect(undone.ok).toBe(true);
  });

  it('canUndo() reflects redemption — the redeemed entry is dropped from the stack', async () => {
    const registry = new MapActionRegistry();
    registry.register('thread.archive', () => Promise.resolve({}));
    registry.register('thread.unarchive', () => Promise.resolve({}));
    const timer = makeManualTimer();
    const dispatcher = new ActionDispatcher({
      capabilities: undoableArchive(),
      registry,
      confirm: ALWAYS_CONFIRM,
      timer,
      generateUndoToken: () => 'token-canundo',
    });
    await dispatcher.dispatch('thread.archive', { thread_id: 'cu' }, ctx);
    expect(dispatcher.canUndo()).toBe(true);
    await dispatcher.undoFromToken('token-canundo');
    // Redemption removed the matching entry; stack is empty again.
    expect(dispatcher.canUndo()).toBe(false);
  });
});
