// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for `withUndo()` middleware — Wave 11 / Int-8.
 *
 * Verifies the wrapper:
 *  - Forwards the dispatch result unchanged.
 *  - Fires the emitter on success when the capability has `undoable: true`.
 *  - Skips the emitter when the capability lacks `undoable` or the dispatch fails.
 *  - Skips the emitter when the inner dispatch returns `ok: false`.
 *  - Proxies `undo`, `canUndo`, `undoFromToken`, etc. unchanged.
 *  - Survives a thrown emitter (the action path keeps committing).
 */

import { describe, expect, it, vi } from 'vitest';
import type { Capability } from '@atelier/schemas';
import {
  ActionDispatcher,
  ALWAYS_CONFIRM,
  MapActionRegistry,
  recordingEmitter,
  withUndo,
  type UndoToastEmitter,
  type UndoToastNotice,
  type UndoTimer,
} from '../../src/index.js';

const ctx = { user_id: 'vid', app_id: 'cir.demo', manifest_id: 'm_test' };

function makeManualTimer(): UndoTimer & { pending: Map<number, () => void> } {
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
  };
}

function capabilities(overrides: Partial<Capability> = {}): Record<string, Capability> {
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
    'thread.read': {
      id: 'thread.read',
      kind: 'data',
      version: '1.0.0',
      input: {},
      output: {},
      side_effects: ['reads:thread'],
      permissions: ['thread:read'],
      confirmation: 'none',
      reversible: false,
    },
  };
}

function buildDispatcher(opts?: {
  capabilities?: Record<string, Capability>;
  thrower?: boolean;
  timer?: UndoTimer;
}): ActionDispatcher {
  const registry = new MapActionRegistry();
  const caps = opts?.capabilities ?? capabilities();
  if (opts?.thrower) {
    registry.register('thread.archive', () => Promise.reject(new Error('boom')));
  } else {
    registry.register('thread.archive', () => Promise.resolve({ archived_at: 'now' }));
  }
  registry.register('thread.unarchive', () => Promise.resolve({}));
  registry.register('thread.read', () => Promise.resolve({}));
  return new ActionDispatcher({
    capabilities: caps,
    registry,
    confirm: ALWAYS_CONFIRM,
    timer: opts?.timer ?? makeManualTimer(),
    generateUndoToken: () => 'token-X',
  });
}

describe('withUndo() middleware', () => {
  it('emits a toast notice on a successful undoable dispatch', async () => {
    const inner = buildDispatcher();
    const emitter = recordingEmitter();
    const wrapped = withUndo({ inner, capabilities: capabilities(), emitter });
    const result = await wrapped.dispatch('thread.archive', { thread_id: 't1' }, ctx);
    expect(result.ok).toBe(true);
    expect(emitter.notices).toHaveLength(1);
    const notice = emitter.notices[0]!;
    expect(notice.actionId).toBe('thread.archive');
    expect(notice.rollbackId).toBe('thread.unarchive');
    expect(notice.undoToken).toBe('token-X');
    expect(notice.windowMs).toBe(5000);
    expect(notice.payload).toEqual({ thread_id: 't1' });
  });

  it('skips the emitter when the capability has no undoable flag', async () => {
    const caps = capabilities({ undoable: false });
    const inner = buildDispatcher({ capabilities: caps });
    const emitter = recordingEmitter();
    const wrapped = withUndo({ inner, capabilities: caps, emitter });
    const result = await wrapped.dispatch('thread.archive', { thread_id: 't1' }, ctx);
    expect(result.ok).toBe(true);
    expect(result.undo_token).toBeUndefined();
    expect(emitter.notices).toHaveLength(0);
  });

  it('skips the emitter when the inner dispatch fails', async () => {
    const inner = buildDispatcher({ thrower: true });
    const emitter = recordingEmitter();
    const wrapped = withUndo({ inner, capabilities: capabilities(), emitter });
    const result = await wrapped.dispatch('thread.archive', { thread_id: 't1' }, ctx);
    expect(result.ok).toBe(false);
    expect(emitter.notices).toHaveLength(0);
  });

  it('skips the emitter for non-undoable read-only data capabilities', async () => {
    const inner = buildDispatcher();
    const emitter = recordingEmitter();
    const wrapped = withUndo({ inner, capabilities: capabilities(), emitter });
    await wrapped.dispatch('thread.read', {}, ctx);
    expect(emitter.notices).toHaveLength(0);
  });

  it('proxies undoFromToken so the host can redeem the toast handle', async () => {
    const inner = buildDispatcher();
    const emitter = recordingEmitter();
    const wrapped = withUndo({ inner, capabilities: capabilities(), emitter });
    const result = await wrapped.dispatch('thread.archive', { thread_id: 't2' }, ctx);
    expect(result.undo_token).toBe('token-X');
    const undone = await wrapped.undoFromToken(result.undo_token!);
    expect(undone.ok).toBe(true);
    expect(undone.undo_token).toBe('token-X');
  });

  it('proxies canUndo / undoStackSize / openUndoTokenCount unchanged', async () => {
    const inner = buildDispatcher();
    const emitter: UndoToastEmitter = recordingEmitter();
    const wrapped = withUndo({ inner, capabilities: capabilities(), emitter });
    expect(wrapped.canUndo()).toBe(false);
    expect(wrapped.undoStackSize()).toBe(0);
    await wrapped.dispatch('thread.archive', { thread_id: 't3' }, ctx);
    expect(wrapped.canUndo()).toBe(true);
    expect(wrapped.undoStackSize()).toBe(1);
    expect(wrapped.openUndoTokenCount()).toBe(1);
  });

  it('survives a thrown emitter — the action result is still returned', async () => {
    const inner = buildDispatcher();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const broken: UndoToastEmitter = {
      show() {
        throw new Error('toast layer crashed');
      },
    };
    const wrapped = withUndo({ inner, capabilities: capabilities(), emitter: broken });
    const result = await wrapped.dispatch('thread.archive', { thread_id: 't4' }, ctx);
    expect(result.ok).toBe(true);
    expect(result.undo_token).toBe('token-X');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('applies derivePayload when supplied', async () => {
    const inner = buildDispatcher();
    const captured: UndoToastNotice[] = [];
    const emitter: UndoToastEmitter = {
      show(notice) {
        captured.push(notice);
        return {
          // eslint-disable-next-line @typescript-eslint/require-await
          undo: async () => null,
          dismiss: () => undefined,
          remainingMs: () => 0,
        };
      },
    };
    const wrapped = withUndo({
      inner,
      capabilities: capabilities(),
      emitter,
      derivePayload: (id, original) => ({
        original,
        synthesised: `for-${id}`,
      }),
    });
    await wrapped.dispatch('thread.archive', { thread_id: 't5' }, ctx);
    expect(captured[0]!.payload).toEqual({
      original: { thread_id: 't5' },
      synthesised: 'for-thread.archive',
    });
  });
});
