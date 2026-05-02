// @vitest-environment happy-dom
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import './setup.js';
import { describe, expect, it } from 'vitest';
import { act, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { useEffect, useRef, type ReactElement } from 'react';
import { CapabilitySchema, type Capability } from '@atelier/schemas';
import type { UndoTimer } from '@atelier/runtime';
import { ActionDispatcher } from '@atelier/runtime';
import { ALWAYS_CONFIRM } from '@atelier/runtime/testing';
import { CirRuntime } from '../src/context/runtime-provider.js';
import {
  useUndoableDispatch,
  type UseUndoableDispatchResult,
} from '../src/hooks/use-undoable-dispatch.js';
import { buildTestServices } from '../src/testing/build-test-services.js';

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

function undoableArchiveCap(): Capability {
  return {
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
  };
}

function unarchiveCap(): Capability {
  return {
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
  };
}

function nonUndoableSendCap(): Capability {
  return {
    id: 'mail.send',
    kind: 'action',
    version: '1.0.0',
    input: { draft_id: 'string' },
    output: {},
    side_effects: ['send'],
    permissions: ['mail:send'],
    confirmation: 'none',
    reversible: false,
  };
}

interface HarnessProps {
  capture: (api: UseUndoableDispatchResult) => void;
}

function Harness({ capture }: HarnessProps): ReactElement {
  const api = useUndoableDispatch();
  const captureRef = useRef(capture);
  captureRef.current = capture;
  useEffect(() => {
    captureRef.current(api);
  });
  return <div data-testid="ok" />;
}

/**
 * Build a `CirRuntimeServices` bag whose dispatcher is wired with a manual
 * timer + a deterministic token generator so the tests have full control
 * over the undo window's lifecycle.
 */
function buildUndoableServices(opts: {
  tokens: string[];
  capabilities: Record<string, Capability>;
  timer: ReturnType<typeof makeManualTimer>;
}): ReturnType<typeof buildTestServices> {
  const services = buildTestServices({ capabilities: opts.capabilities });
  // Replace the dispatcher with one wired to the manual timer + token gen.
  // We keep everything else (registry, audit, etc.) from `buildTestServices`.
  let i = 0;
  const dispatcher = new ActionDispatcher({
    capabilities: opts.capabilities,
    registry: services.actions,
    confirm: ALWAYS_CONFIRM,
    timer: opts.timer,
    generateUndoToken: () => opts.tokens[i++] ?? `auto-${String(i)}`,
  });
  return { ...services, dispatcher };
}

describe('useUndoableDispatch', () => {
  it('exposes undoToast after a successful undoable dispatch', async () => {
    const timer = makeManualTimer();
    const services = buildUndoableServices({
      tokens: ['tok-A'],
      capabilities: { 'thread.archive': undoableArchiveCap() },
      timer,
    });
    services.actions.register('thread.archive', () => Promise.resolve({ archived_at: 'now' }));
    let api!: UseUndoableDispatchResult;
    render(
      <CirRuntime services={services}>
        <Harness
          capture={(a) => {
            api = a;
          }}
        />
      </CirRuntime>,
    );
    await act(async () => {
      await api.dispatch('thread.archive', { thread_id: 't1' });
    });
    expect(api.undoToast).not.toBeNull();
    expect(api.undoToast?.undoToken).toBe('tok-A');
    expect(api.undoToast?.windowMs).toBe(5000);
    expect(api.undoToast?.message).toContain('thread.archive');
    expect(api.undoToast?.capabilityId).toBe('thread.archive');
    timer.fireAll();
  });

  it('non-undoable dispatch does NOT surface a toast', async () => {
    const timer = makeManualTimer();
    const services = buildUndoableServices({
      tokens: [],
      capabilities: { 'mail.send': nonUndoableSendCap() },
      timer,
    });
    services.actions.register('mail.send', () => Promise.resolve({ message_id: 'm' }));
    let api!: UseUndoableDispatchResult;
    render(
      <CirRuntime services={services}>
        <Harness
          capture={(a) => {
            api = a;
          }}
        />
      </CirRuntime>,
    );
    await act(async () => {
      const r = await api.dispatch('mail.send', { draft_id: 'd1' });
      expect(r.ok).toBe(true);
      expect(r.undo_token).toBeUndefined();
    });
    expect(api.undoToast).toBeNull();
    expect(timer.pending.size).toBe(0);
  });

  it('toast.onUndo invokes undoFromToken and clears toast state', async () => {
    const timer = makeManualTimer();
    const services = buildUndoableServices({
      tokens: ['tok-B'],
      capabilities: {
        'thread.archive': undoableArchiveCap(),
        'thread.unarchive': unarchiveCap(),
      },
      timer,
    });
    let unarchiveCalls = 0;
    services.actions.register('thread.archive', () => Promise.resolve({}));
    services.actions.register('thread.unarchive', () => {
      unarchiveCalls += 1;
      return Promise.resolve({});
    });
    let api!: UseUndoableDispatchResult;
    render(
      <CirRuntime services={services}>
        <Harness
          capture={(a) => {
            api = a;
          }}
        />
      </CirRuntime>,
    );
    await act(async () => {
      await api.dispatch('thread.archive', { thread_id: 't9' });
    });
    expect(api.undoToast?.undoToken).toBe('tok-B');
    await act(async () => {
      await api.undoToast?.onUndo();
    });
    expect(unarchiveCalls).toBe(1);
    expect(api.undoToast).toBeNull();
    timer.fireAll();
  });

  it('demo smoke: loads capabilities/github/issue.close.json and surfaces a toast on dispatch', async () => {
    // Locate the repo-rooted capability JSON. The test file lives under
    // packages/react/test/, so the repo root is four levels up.
    const here = dirname(fileURLToPath(import.meta.url));
    const repoRoot = join(here, '..', '..', '..');
    const closePath = join(repoRoot, 'capabilities', 'github', 'issue.close.json');
    const closeRaw = JSON.parse(readFileSync(closePath, 'utf8')) as unknown;
    const closeCap = CapabilitySchema.parse(closeRaw);
    expect(closeCap.undoable).toBe(true);
    expect(closeCap.undo_window_ms).toBe(5000);

    const timer = makeManualTimer();
    const services = buildUndoableServices({
      tokens: ['demo-tok'],
      // Synthesise a stand-in for the (intentionally absent in this PR)
      // `github.issue.reopen` so the rollback dispatch resolves.
      capabilities: {
        [closeCap.id]: closeCap,
        'github.issue.reopen': {
          id: 'github.issue.reopen',
          kind: 'action',
          version: '0.1.0',
          input: { owner: 'string', repo: 'string', issue_number: 'number' },
          output: { state: 'string' },
          side_effects: ['mutates:github_issues'],
          permissions: ['github:write'],
          confirmation: 'inline',
          reversible: true,
          rollback: closeCap.id,
        },
      },
      timer,
    });
    services.actions.register(closeCap.id, () =>
      Promise.resolve({ number: 1, state: 'closed', closed_at: 'now' }),
    );
    services.actions.register('github.issue.reopen', () => Promise.resolve({ state: 'open' }));
    let api!: UseUndoableDispatchResult;
    render(
      <CirRuntime services={services}>
        <Harness
          capture={(a) => {
            api = a;
          }}
        />
      </CirRuntime>,
    );
    await act(async () => {
      await api.dispatch(closeCap.id, {
        owner: 'cir',
        repo: 'cir',
        issue_number: 7,
        reason: 'completed',
      });
    });
    expect(api.undoToast?.undoToken).toBe('demo-tok');
    expect(api.undoToast?.windowMs).toBe(5000);
    expect(api.undoToast?.capabilityId).toBe('github.issue.close');
    timer.fireAll();
  });

  it('a second undoable dispatch swaps the toast (rolling Linear-style behaviour)', async () => {
    const timer = makeManualTimer();
    const services = buildUndoableServices({
      tokens: ['tok-1', 'tok-2'],
      capabilities: {
        'thread.archive': undoableArchiveCap(),
        'thread.unarchive': unarchiveCap(),
      },
      timer,
    });
    services.actions.register('thread.archive', () => Promise.resolve({}));
    services.actions.register('thread.unarchive', () => Promise.resolve({}));
    let api!: UseUndoableDispatchResult;
    render(
      <CirRuntime services={services}>
        <Harness
          capture={(a) => {
            api = a;
          }}
        />
      </CirRuntime>,
    );
    await act(async () => {
      await api.dispatch('thread.archive', { thread_id: 'a' });
    });
    expect(api.undoToast?.undoToken).toBe('tok-1');
    const firstToast = api.undoToast!;
    await act(async () => {
      await api.dispatch('thread.archive', { thread_id: 'b' });
    });
    expect(api.undoToast?.undoToken).toBe('tok-2');
    // Calling the FIRST toast's onUndo after a swap must be a no-op so we
    // don't accidentally rewind the wrong action.
    await act(async () => {
      const r = await firstToast.onUndo();
      expect(r).toBeNull();
    });
    // Second toast remains active.
    expect(api.undoToast?.undoToken).toBe('tok-2');
    timer.fireAll();
  });
});
