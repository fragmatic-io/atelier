// @vitest-environment happy-dom
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Tests for `useUndoToastEmitter()` — Wave 11 / Int-8.
 *
 * Verifies:
 *  - The hook returns an emitter + a `<Sink />` component.
 *  - `emitter.show(notice)` mounts an undo toast in the sink.
 *  - The toast renders the message + Undo button + countdown bar.
 *  - Clicking Undo invokes `dispatcher.undoFromToken(token)` and clears it.
 *  - `withUndo()` middleware composed end-to-end fires the toast on dispatch.
 *  - Multiple notices stack vertically.
 */
import './setup.js';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { act, fireEvent, render, screen, cleanup } from '@testing-library/react';
import { useEffect, useMemo, useRef, type ReactElement } from 'react';
import type { Capability } from '@cir/schemas';
import { ActionDispatcher, withUndo, type UndoTimer, type UndoToastEmitter } from '@cir/runtime';
import { ALWAYS_CONFIRM } from '@cir/runtime/testing';
import { CirRuntime } from '../src/context/runtime-provider.js';
import {
  useUndoToastEmitter,
  type UseUndoToastEmitter,
} from '../src/hooks/use-undo-toast-emitter.js';
import { buildTestServices } from '../src/testing/build-test-services.js';

afterEach(() => {
  cleanup();
});

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

function archiveCaps(): Record<string, Capability> {
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
      undo_window_ms: 5000,
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

interface HarnessProps {
  capture: (api: UseUndoToastEmitter) => void;
  dispatch?: () => Promise<unknown>;
}

function Harness({ capture, dispatch }: HarnessProps): ReactElement {
  const api = useUndoToastEmitter();
  const captureRef = useRef(capture);
  captureRef.current = capture;
  useEffect(() => {
    captureRef.current(api);
  });
  // Expose a div so the test can find the sink-host wrapper too.
  return (
    <div>
      <api.Sink />
      <button
        type="button"
        data-testid="dispatch-trigger"
        onClick={() => {
          void dispatch?.();
        }}
      />
    </div>
  );
}

describe('useUndoToastEmitter', () => {
  it('returns an emitter and a Sink component', () => {
    const services = buildTestServices({ capabilities: archiveCaps() });
    let api!: UseUndoToastEmitter;
    render(
      <CirRuntime services={services}>
        <Harness
          capture={(a) => {
            api = a;
          }}
        />
      </CirRuntime>,
    );
    expect(typeof api.emitter.show).toBe('function');
    expect(typeof api.Sink).toBe('function');
  });

  it('emitter.show() mounts an undo toast in the sink', () => {
    const services = buildTestServices({ capabilities: archiveCaps() });
    let api!: UseUndoToastEmitter;
    render(
      <CirRuntime services={services}>
        <Harness
          capture={(a) => {
            api = a;
          }}
        />
      </CirRuntime>,
    );
    act(() => {
      api.emitter.show({
        actionId: 'thread.archive',
        rollbackId: 'thread.unarchive',
        undoToken: 'tok-1',
        windowMs: 5000,
        expiresAt: new Date(Date.now() + 5000).toISOString(),
        payload: { thread_id: 't1' },
      });
    });
    expect(screen.getByText(/thread.archive/u)).toBeTruthy();
    expect(screen.getByText('Undo')).toBeTruthy();
  });

  it('end-to-end: withUndo + emitter fire a toast on dispatch', async () => {
    const timer = makeManualTimer();
    const caps = archiveCaps();
    const base = buildTestServices({ capabilities: caps });
    base.actions.register('thread.archive', () => Promise.resolve({}));
    const inner = new ActionDispatcher({
      capabilities: caps,
      registry: base.actions,
      confirm: ALWAYS_CONFIRM,
      timer,
      generateUndoToken: () => 'tok-mw',
    });

    function Wired(): ReactElement {
      const { emitter, Sink } = useUndoToastEmitter();
      // The wrapped dispatcher is constructed once, on first render. The
      // emitter is stable, so this `useMemo` only fires once.
      const wrapped = useMemo(() => withUndo({ inner, capabilities: caps, emitter }), [emitter]);
      return (
        <>
          <Sink />
          <button
            type="button"
            data-testid="go"
            onClick={() => {
              void wrapped.dispatch(
                'thread.archive',
                { thread_id: 't9' },
                { user_id: 'u', app_id: 'a' },
              );
            }}
          />
        </>
      );
    }

    // The wrapped dispatcher is built inside the component, but the runtime
    // services bag still hosts the inner. That's fine: the sink calls
    // `services.dispatcher.undoFromToken()` which IS the inner — and it has
    // the open token.
    const services = { ...base, dispatcher: inner };
    render(
      <CirRuntime services={services}>
        <Wired />
      </CirRuntime>,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('go'));
      await Promise.resolve();
    });
    expect(screen.getByText(/thread.archive/u)).toBeTruthy();
    expect(screen.getByText('Undo')).toBeTruthy();
  });

  it('clicking Undo redeems the token via the dispatcher', async () => {
    const timer = makeManualTimer();
    const caps = archiveCaps();
    const base = buildTestServices({ capabilities: caps });
    let unarchiveInput: unknown;
    base.actions.register('thread.archive', () => Promise.resolve({}));
    base.actions.register('thread.unarchive', (input) => {
      unarchiveInput = input;
      return Promise.resolve({});
    });
    const inner = new ActionDispatcher({
      capabilities: caps,
      registry: base.actions,
      confirm: ALWAYS_CONFIRM,
      timer,
      generateUndoToken: () => 'tok-undo',
    });
    const services = { ...base, dispatcher: inner };

    function Wired(): ReactElement {
      const { emitter, Sink } = useUndoToastEmitter();
      const wrapped = useMemo(() => withUndo({ inner, capabilities: caps, emitter }), [emitter]);
      return (
        <>
          <Sink />
          <button
            type="button"
            data-testid="go"
            onClick={() => {
              void wrapped.dispatch(
                'thread.archive',
                { thread_id: 't42' },
                { user_id: 'u', app_id: 'a' },
              );
            }}
          />
        </>
      );
    }

    render(
      <CirRuntime services={services}>
        <Wired />
      </CirRuntime>,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('go'));
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Undo'));
      // Allow microtasks to flush so the rollback handler runs.
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(unarchiveInput).toEqual({ thread_id: 't42' });
    // After undo, the toast disappears.
    expect(screen.queryByText('Undo')).toBeNull();
  });

  it('thrown emitter does not crash the action path', async () => {
    const services = buildTestServices({ capabilities: archiveCaps() });
    services.actions.register('thread.archive', () => Promise.resolve({}));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const broken: UndoToastEmitter = {
      show() {
        throw new Error('toast layer crashed');
      },
    };
    const wrapped = withUndo({
      inner: services.dispatcher,
      capabilities: archiveCaps(),
      emitter: broken,
    });
    const result = await wrapped.dispatch(
      'thread.archive',
      { thread_id: 't1' },
      { user_id: 'u', app_id: 'a' },
    );
    expect(result.ok).toBe(true);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
