// @vitest-environment happy-dom
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import './setup.js';
import { describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { useEffect, useRef, type ReactElement } from 'react';
import type { ActionResult } from '@atelier/runtime';
import type { Capability } from '@atelier/schemas';
import {
  useOptimisticAction,
  type UseOptimisticActionOptions,
  type UseOptimisticActionResult,
} from '../src/hooks/use-optimistic-action.js';

const lowStakesCapability: Capability = {
  id: 'cart.add',
  kind: 'action',
  version: '0.1.0',
  input: {},
  output: {},
  side_effects: ['mutates:cart_state'],
  permissions: ['cart:write'],
  confirmation: 'inline',
  reversible: true,
  rollback: 'cart.remove',
  low_stakes: true,
};

const reversibleOnlyCapability: Capability = {
  ...lowStakesCapability,
  id: 'thread.archive',
  reversible: true,
  low_stakes: false,
};

const irreversibleCapability: Capability = {
  ...lowStakesCapability,
  id: 'mail.send',
  reversible: false,
  low_stakes: false,
};

interface HarnessProps<TInput> {
  opts: UseOptimisticActionOptions<TInput>;
  capture: (api: UseOptimisticActionResult<TInput>) => void;
}

/** Renders the hook and forwards its return value to a capturing callback. */
function Harness<TInput>({ opts, capture }: HarnessProps<TInput>): ReactElement {
  const api = useOptimisticAction<TInput>(opts);
  const captureRef = useRef(capture);
  captureRef.current = capture;
  useEffect(() => {
    captureRef.current(api);
  });
  return <div data-testid="busy">{api.busy ? 'busy' : 'idle'}</div>;
}

interface Input {
  id: string;
}

function flush(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe('useOptimisticAction', () => {
  it('calls applyOptimistic before the action and shows a success toast on ok=true', async () => {
    const calls: string[] = [];
    const action = vi.fn((input: Input): Promise<ActionResult> => {
      calls.push(`action:${input.id}`);
      return Promise.resolve({ ok: true });
    });
    const applyOptimistic = vi.fn((input: Input) => {
      calls.push(`apply:${input.id}`);
    });
    const rollback = vi.fn();

    let api!: UseOptimisticActionResult<Input>;
    render(
      <Harness<Input>
        opts={{ action, applyOptimistic, rollback }}
        capture={(a) => {
          api = a;
        }}
      />,
    );

    let result: ActionResult | null = null;
    await act(async () => {
      result = await api.invoke({ id: 't1' });
    });
    expect(result?.ok).toBe(true);
    expect(calls).toEqual(['apply:t1', 'action:t1']);
    expect(rollback).not.toHaveBeenCalled();
    expect(api.toast).toEqual({ kind: 'success', message: 'Done' });
  });

  it('rolls back and surfaces an error toast when action returns ok=false', async () => {
    const action = vi.fn(
      (_input: Input): Promise<ActionResult> => Promise.resolve({ ok: false, error: 'nope' }),
    );
    const applyOptimistic = vi.fn();
    const rollback = vi.fn();

    let api!: UseOptimisticActionResult<Input>;
    render(
      <Harness<Input>
        opts={{ action, applyOptimistic, rollback }}
        capture={(a) => {
          api = a;
        }}
      />,
    );

    await act(async () => {
      await api.invoke({ id: 't2' });
    });
    expect(applyOptimistic).toHaveBeenCalledOnce();
    expect(rollback).toHaveBeenCalledOnce();
    expect(rollback).toHaveBeenCalledWith({ id: 't2' });
    expect(api.toast?.kind).toBe('error');
    expect(api.toast?.message).toBe('nope');
  });

  it('rolls back and shows error toast when the action throws', async () => {
    const action = vi.fn(
      (_input: Input): Promise<ActionResult> => Promise.reject(new Error('boom')),
    );
    const applyOptimistic = vi.fn();
    const rollback = vi.fn();

    let api!: UseOptimisticActionResult<Input>;
    render(
      <Harness<Input>
        opts={{ action, applyOptimistic, rollback }}
        capture={(a) => {
          api = a;
        }}
      />,
    );

    let result: ActionResult | null = null;
    await act(async () => {
      result = await api.invoke({ id: 't3' });
    });
    expect(rollback).toHaveBeenCalledOnce();
    expect(result?.ok).toBe(false);
    expect(result?.error).toBe('boom');
    expect(api.toast?.kind).toBe('error');
    expect(api.toast?.message).toBe('boom');
  });

  it('busy is true during the action and false after it resolves', async () => {
    let resolveAction!: (value: ActionResult) => void;
    const action = (_input: Input): Promise<ActionResult> =>
      new Promise<ActionResult>((res) => {
        resolveAction = res;
      });

    const captured: UseOptimisticActionResult<Input>[] = [];
    render(
      <Harness<Input>
        opts={{ action }}
        capture={(a) => {
          captured.push(a);
        }}
      />,
    );

    const initial = captured[captured.length - 1]!;
    expect(initial.busy).toBe(false);

    let invokePromise!: Promise<ActionResult | null>;
    await act(() => {
      invokePromise = initial.invoke({ id: 't4' });
      return Promise.resolve();
    });

    // While the action's promise is unresolved, busy should be true.
    const duringInvoke = captured[captured.length - 1]!;
    expect(duringInvoke.busy).toBe(true);

    await act(async () => {
      resolveAction({ ok: true });
      await invokePromise;
    });

    const after = captured[captured.length - 1]!;
    expect(after.busy).toBe(false);
  });

  it('clears the toast after the configured timeout', async () => {
    vi.useFakeTimers();
    try {
      const action = (_input: Input): Promise<ActionResult> => Promise.resolve({ ok: true });

      const captured: UseOptimisticActionResult<Input>[] = [];
      render(
        <Harness<Input>
          opts={{ action, toastTimeoutMs: 50 }}
          capture={(a) => {
            captured.push(a);
          }}
        />,
      );

      const initial = captured[captured.length - 1]!;
      await act(async () => {
        await initial.invoke({ id: 't5' });
      });

      const afterInvoke = captured[captured.length - 1]!;
      expect(afterInvoke.toast?.kind).toBe('success');

      await act(async () => {
        vi.advanceTimersByTime(60);
        await Promise.resolve();
      });

      const afterTimeout = captured[captured.length - 1]!;
      expect(afterTimeout.toast).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns null and is a no-op when no action is provided', async () => {
    const applyOptimistic = vi.fn();
    const rollback = vi.fn();

    let api!: UseOptimisticActionResult<Input>;
    render(
      <Harness<Input>
        opts={{ action: undefined, applyOptimistic, rollback }}
        capture={(a) => {
          api = a;
        }}
      />,
    );

    let result: ActionResult | null = { ok: true };
    await act(async () => {
      result = await api.invoke({ id: 't6' });
    });
    expect(result).toBeNull();
    expect(applyOptimistic).not.toHaveBeenCalled();
    expect(rollback).not.toHaveBeenCalled();
    await flush();
  });

  it('autodetect: engages optimistic path when capability is reversible + low_stakes', async () => {
    const calls: string[] = [];
    const action = vi.fn((input: Input): Promise<ActionResult> => {
      calls.push(`action:${input.id}`);
      return Promise.resolve({ ok: true });
    });
    const applyOptimistic = vi.fn((input: Input) => {
      calls.push(`apply:${input.id}`);
    });
    const rollback = vi.fn();

    let api!: UseOptimisticActionResult<Input>;
    render(
      <Harness<Input>
        opts={{ action, applyOptimistic, rollback, capability: lowStakesCapability }}
        capture={(a) => {
          api = a;
        }}
      />,
    );

    await act(async () => {
      await api.invoke({ id: 'auto1' });
    });

    // Apply ran BEFORE the action.
    expect(calls).toEqual(['apply:auto1', 'action:auto1']);
    expect(rollback).not.toHaveBeenCalled();
  });

  it('autodetect: skips optimistic path when capability is reversible-only (no low_stakes)', async () => {
    const action = vi.fn(
      (_input: Input): Promise<ActionResult> => Promise.resolve({ ok: false, error: 'nope' }),
    );
    const applyOptimistic = vi.fn();
    const rollback = vi.fn();

    let api!: UseOptimisticActionResult<Input>;
    render(
      <Harness<Input>
        opts={{ action, applyOptimistic, rollback, capability: reversibleOnlyCapability }}
        capture={(a) => {
          api = a;
        }}
      />,
    );

    await act(async () => {
      await api.invoke({ id: 'auto2' });
    });

    // Pessimistic path: neither callback fires, but the toast still surfaces
    // the error to the user.
    expect(applyOptimistic).not.toHaveBeenCalled();
    expect(rollback).not.toHaveBeenCalled();
    expect(api.toast?.kind).toBe('error');
    expect(api.toast?.message).toBe('nope');
  });

  it('autodetect: skips optimistic path entirely when capability is irreversible', async () => {
    const action = vi.fn(
      (_input: Input): Promise<ActionResult> => Promise.reject(new Error('fail')),
    );
    const applyOptimistic = vi.fn();
    const rollback = vi.fn();

    let api!: UseOptimisticActionResult<Input>;
    render(
      <Harness<Input>
        opts={{ action, applyOptimistic, rollback, capability: irreversibleCapability }}
        capture={(a) => {
          api = a;
        }}
      />,
    );

    await act(async () => {
      await api.invoke({ id: 'auto3' });
    });

    // Even on a thrown error, rollback must NOT run for irreversible
    // capabilities — there is no optimistic state to revert.
    expect(applyOptimistic).not.toHaveBeenCalled();
    expect(rollback).not.toHaveBeenCalled();
    expect(api.toast?.kind).toBe('error');
  });

  it('autodetect: legacy callers without capability keep optimistic semantics', async () => {
    // Pre-Wave-7a callers passed only `action` + `applyOptimistic` + `rollback`.
    // We must keep those callers working.
    const calls: string[] = [];
    const action = vi.fn((input: Input): Promise<ActionResult> => {
      calls.push(`action:${input.id}`);
      return Promise.resolve({ ok: false, error: 'legacy-fail' });
    });
    const applyOptimistic = vi.fn((input: Input) => {
      calls.push(`apply:${input.id}`);
    });
    const rollback = vi.fn();

    let api!: UseOptimisticActionResult<Input>;
    render(
      <Harness<Input>
        opts={{ action, applyOptimistic, rollback }}
        capture={(a) => {
          api = a;
        }}
      />,
    );

    await act(async () => {
      await api.invoke({ id: 'legacy' });
    });

    expect(calls).toEqual(['apply:legacy', 'action:legacy']);
    expect(rollback).toHaveBeenCalledOnce();
    expect(rollback).toHaveBeenCalledWith({ id: 'legacy' });
  });
});
