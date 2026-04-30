import { describe, expect, it, vi } from 'vitest';
import type { AuditEvent, Capability } from '@cir/schemas';
import { ActionDispatcher } from '../../src/actions/dispatcher.ts';
import type { AuditSink } from '../../src/audit/emit.ts';
import {
  ALWAYS_CONFIRM,
  ALWAYS_DECLINE,
  type ConfirmationCallback,
} from '../../src/actions/confirm.ts';
import { MapActionRegistry } from '../../src/registry/action-registry.ts';
import { fixtureCapabilities } from '../fixtures/manifest.ts';

const ctx = { user_id: 'vid', app_id: 'mail.example.com', manifest_id: 'm_8f3a2b1c' };

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

describe('ActionDispatcher', () => {
  it('dispatches a registered handler and returns ok', async () => {
    const registry = new MapActionRegistry();
    registry.register('thread.archive', (input) =>
      Promise.resolve({ archived_at: '2026-01-01', input }),
    );
    const { sink, events } = captureSink();
    const dispatcher = new ActionDispatcher({
      capabilities: fixtureCapabilities(),
      registry,
      confirm: ALWAYS_CONFIRM,
      audit: sink,
    });
    const result = await dispatcher.dispatch('thread.archive', { thread_id: 't1' }, ctx);
    expect(result.ok).toBe(true);
    expect(result.result).toEqual({ archived_at: '2026-01-01', input: { thread_id: 't1' } });
    expect(result.side_effects).toEqual(['archive', 'mutates:thread_state']);
    expect(events.some((e) => e.type === 'action.executed')).toBe(true);
  });

  it('returns error when capability is unknown', async () => {
    const dispatcher = new ActionDispatcher({
      capabilities: {},
      registry: new MapActionRegistry(),
      confirm: ALWAYS_CONFIRM,
    });
    const result = await dispatcher.dispatch('nope.unknown', {}, ctx);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unknown capability/);
  });

  it('returns error when no handler is registered', async () => {
    const { sink, events } = captureSink();
    const dispatcher = new ActionDispatcher({
      capabilities: fixtureCapabilities(),
      registry: new MapActionRegistry(),
      confirm: ALWAYS_CONFIRM,
      audit: sink,
    });
    const result = await dispatcher.dispatch('thread.archive', { thread_id: 't1' }, ctx);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no handler registered/);
    expect(events.some((e) => e.type === 'action.denied')).toBe(true);
  });

  it('asks for confirmation on modal capability and aborts when declined', async () => {
    const registry = new MapActionRegistry();
    const handler = vi.fn(() => Promise.resolve({ message_id: 'mid' }));
    registry.register('mail.send', handler);
    const dispatcher = new ActionDispatcher({
      capabilities: fixtureCapabilities(),
      registry,
      confirm: ALWAYS_DECLINE,
    });
    const result = await dispatcher.dispatch('mail.send', { draft_id: 'd1' }, ctx);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('declined-by-test');
    expect(handler).not.toHaveBeenCalled();
  });

  it('passes ConfirmationRequest to the callback', async () => {
    const registry = new MapActionRegistry();
    registry.register('mail.send', () => Promise.resolve({ message_id: 'mid' }));
    const confirm: ConfirmationCallback = vi.fn(() => Promise.resolve({ confirmed: true }));
    const dispatcher = new ActionDispatcher({
      capabilities: fixtureCapabilities(),
      registry,
      confirm,
    });
    await dispatcher.dispatch('mail.send', { draft_id: 'd1' }, ctx);
    const mock = vi.mocked(confirm);
    expect(mock).toHaveBeenCalledOnce();
    const arg = mock.mock.calls[0]?.[0];
    expect(arg?.level).toBe('modal');
    expect(arg?.capability_id).toBe('mail.send');
    expect(arg?.side_effects).toEqual(['send']);
    expect(arg?.verbal_phrase).toBeUndefined();
    expect(arg?.prompt).toMatch(/mail\.send/);
  });

  it('populates verbal_phrase from the last segment of capability_id for verbal_required', async () => {
    const caps: Record<string, Capability> = {
      'pulls.merge': {
        id: 'pulls.merge',
        kind: 'action',
        version: '1.0.0',
        input: { pr_id: 'string' },
        output: {},
        side_effects: ['publish'],
        permissions: ['pulls:write'],
        confirmation: 'verbal_required',
        reversible: false,
      },
    };
    const registry = new MapActionRegistry();
    registry.register('pulls.merge', () => Promise.resolve({ ok: true }));
    const confirm: ConfirmationCallback = vi.fn(() => Promise.resolve({ confirmed: true }));
    const dispatcher = new ActionDispatcher({
      capabilities: caps,
      registry,
      confirm,
    });
    await dispatcher.dispatch('pulls.merge', { pr_id: 'pr1' }, ctx);
    const mock = vi.mocked(confirm);
    expect(mock).toHaveBeenCalledOnce();
    const arg = mock.mock.calls[0]?.[0];
    expect(arg?.level).toBe('verbal_required');
    expect(arg?.verbal_phrase).toBe('merge');
    expect(arg?.capability_id).toBe('pulls.merge');
  });

  it('does not require confirmation for `none` level', async () => {
    const registry = new MapActionRegistry();
    registry.register('thread.archive', () => Promise.resolve({ archived_at: 'x' }));
    const confirm = vi.fn();
    const dispatcher = new ActionDispatcher({
      capabilities: fixtureCapabilities(),
      registry,
      confirm,
    });
    await dispatcher.dispatch('thread.archive', { thread_id: 't' }, ctx);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('reports handler errors as denials', async () => {
    const registry = new MapActionRegistry();
    registry.register('thread.archive', () => Promise.reject(new Error('upstream 500')));
    const dispatcher = new ActionDispatcher({
      capabilities: fixtureCapabilities(),
      registry,
      confirm: ALWAYS_CONFIRM,
    });
    const result = await dispatcher.dispatch('thread.archive', { thread_id: 't' }, ctx);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/handler threw/);
  });

  it('handles non-Error throws by stringifying them', async () => {
    const registry = new MapActionRegistry();
    registry.register('thread.archive', () => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- intentionally non-Error to test stringification
      throw 'plain string';
    });
    const dispatcher = new ActionDispatcher({
      capabilities: fixtureCapabilities(),
      registry,
      confirm: ALWAYS_CONFIRM,
    });
    const result = await dispatcher.dispatch('thread.archive', { thread_id: 't' }, ctx);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/plain string/);
  });

  it('pushes undo entries for reversible actions', async () => {
    const registry = new MapActionRegistry();
    registry.register('thread.archive', () => Promise.resolve({ ok: 1 }));
    registry.register('thread.unarchive', () => Promise.resolve({ ok: 2 }));
    const dispatcher = new ActionDispatcher({
      capabilities: fixtureCapabilities(),
      registry,
      confirm: ALWAYS_CONFIRM,
    });
    await dispatcher.dispatch('thread.archive', { thread_id: 't1' }, ctx);
    expect(dispatcher.canUndo()).toBe(true);
    expect(dispatcher.undoStackSize()).toBe(1);
    const undone = await dispatcher.undo();
    expect(undone?.ok).toBe(true);
    expect(undone?.result).toEqual({ ok: 2 });
    expect(dispatcher.canUndo()).toBe(false);
  });

  it('does NOT push undo entries for non-reversible actions', async () => {
    const registry = new MapActionRegistry();
    registry.register('mail.send', () => Promise.resolve({ message_id: 'mid' }));
    const dispatcher = new ActionDispatcher({
      capabilities: fixtureCapabilities(),
      registry,
      confirm: ALWAYS_CONFIRM,
    });
    await dispatcher.dispatch('mail.send', { draft_id: 'd' }, ctx);
    expect(dispatcher.canUndo()).toBe(false);
  });

  it('does NOT push undo entries for reversible-but-no-rollback', async () => {
    // Synthetic capability missing rollback.
    const caps: Record<string, Capability> = {
      'task.complete': {
        id: 'task.complete',
        kind: 'action',
        version: '1.0.0',
        input: {},
        output: {},
        side_effects: [],
        permissions: ['task:write'],
        confirmation: 'none',
        reversible: true,
      },
    };
    const registry = new MapActionRegistry();
    registry.register('task.complete', () => Promise.resolve({}));
    const dispatcher = new ActionDispatcher({
      capabilities: caps,
      registry,
      confirm: ALWAYS_CONFIRM,
    });
    await dispatcher.dispatch('task.complete', {}, ctx);
    expect(dispatcher.canUndo()).toBe(false);
  });

  it('undo() returns null on empty stack', async () => {
    const dispatcher = new ActionDispatcher({
      capabilities: fixtureCapabilities(),
      registry: new MapActionRegistry(),
      confirm: ALWAYS_CONFIRM,
    });
    expect(await dispatcher.undo()).toBeNull();
  });

  it('audit sink errors do not break dispatch', async () => {
    const registry = new MapActionRegistry();
    registry.register('thread.archive', () => Promise.resolve({}));
    const dispatcher = new ActionDispatcher({
      capabilities: fixtureCapabilities(),
      registry,
      confirm: ALWAYS_CONFIRM,
      audit: {
        emit() {
          throw new Error('sink down');
        },
      },
    });
    const result = await dispatcher.dispatch('thread.archive', { thread_id: 't' }, ctx);
    expect(result.ok).toBe(true);
  });

  it('emits action.executed with manifest_id when present', async () => {
    const registry = new MapActionRegistry();
    registry.register('thread.archive', () => Promise.resolve({}));
    const { sink, events } = captureSink();
    const dispatcher = new ActionDispatcher({
      capabilities: fixtureCapabilities(),
      registry,
      confirm: ALWAYS_CONFIRM,
      audit: sink,
    });
    await dispatcher.dispatch('thread.archive', { thread_id: 't' }, ctx);
    expect(events[0]?.manifest_id).toBe('m_8f3a2b1c');
  });

  it('undo replays the original execution context to the rollback handler', async () => {
    const registry = new MapActionRegistry();
    registry.register('thread.archive', () => Promise.resolve({ archived_at: 'x' }));
    const seen: { input: unknown; ctx: unknown }[] = [];
    registry.register('thread.unarchive', (input, recvCtx) => {
      seen.push({ input, ctx: recvCtx });
      return Promise.resolve({ unarchived: true });
    });
    const dispatcher = new ActionDispatcher({
      capabilities: fixtureCapabilities(),
      registry,
      confirm: ALWAYS_CONFIRM,
    });
    const originalCtx = {
      user_id: 'vid',
      app_id: 'mail.example',
      manifest_id: 'm_abc',
    };
    await dispatcher.dispatch('thread.archive', { thread_id: 't1' }, originalCtx);
    const undone = await dispatcher.undo();
    expect(undone?.ok).toBe(true);
    expect(seen).toHaveLength(1);
    const replayedCtx = seen[0]?.ctx as {
      user_id: string;
      app_id: string;
      manifest_id?: string;
    };
    expect(replayedCtx.user_id).toBe('vid');
    expect(replayedCtx.app_id).toBe('mail.example');
    expect(replayedCtx.manifest_id).toBe('m_abc');
  });

  it('undo emits action.executed audit with original manifest_id', async () => {
    const registry = new MapActionRegistry();
    registry.register('thread.archive', () => Promise.resolve({}));
    registry.register('thread.unarchive', () => Promise.resolve({}));
    const { sink, events } = captureSink();
    const dispatcher = new ActionDispatcher({
      capabilities: fixtureCapabilities(),
      registry,
      confirm: ALWAYS_CONFIRM,
      audit: sink,
    });
    const originalCtx = {
      user_id: 'vid',
      app_id: 'mail.example',
      manifest_id: 'm_abc',
    };
    await dispatcher.dispatch('thread.archive', { thread_id: 't1' }, originalCtx);
    await dispatcher.undo();
    const executed = events.filter((e) => e.type === 'action.executed');
    expect(executed).toHaveLength(2);
    expect(executed[1]?.manifest_id).toBe('m_abc');
    expect(executed[1]?.user_id).toBe('vid');
    expect(executed[1]?.app_id).toBe('mail.example');
    expect(executed[1]?.trigger_chain).toEqual(['action:thread.unarchive']);
  });

  it('undo input is recorded with original args', async () => {
    const registry = new MapActionRegistry();
    registry.register('thread.archive', () => Promise.resolve({}));
    const seenInputs: unknown[] = [];
    registry.register('thread.unarchive', (input) => {
      seenInputs.push(input);
      return Promise.resolve({});
    });
    const dispatcher = new ActionDispatcher({
      capabilities: fixtureCapabilities(),
      registry,
      confirm: ALWAYS_CONFIRM,
    });
    const args = { thread_id: 't1', tag: 'inbox' };
    await dispatcher.dispatch('thread.archive', args, ctx);
    await dispatcher.undo();
    expect(seenInputs).toHaveLength(1);
    expect(seenInputs[0]).toEqual(args);
  });

  it('emits action.executed without manifest_id when omitted', async () => {
    const registry = new MapActionRegistry();
    registry.register('thread.archive', () => Promise.resolve({}));
    const { sink, events } = captureSink();
    const dispatcher = new ActionDispatcher({
      capabilities: fixtureCapabilities(),
      registry,
      confirm: ALWAYS_CONFIRM,
      audit: sink,
    });
    await dispatcher.dispatch(
      'thread.archive',
      { thread_id: 't' },
      { user_id: 'vid', app_id: 'mail' },
    );
    expect(events[0]?.manifest_id).toBeUndefined();
  });
});
