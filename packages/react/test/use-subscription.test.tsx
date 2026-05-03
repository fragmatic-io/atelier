// @vitest-environment happy-dom
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for `useSubscription` (Wave 10 / S-3).
 *
 * Lifecycle covered:
 *  - mount → loading: true → first item arrives → loading: false + data set
 *  - unmount calls `iterator.return()` (cleanup contract)
 *  - reconnect() tears down and reopens the stream
 *  - resolver without a `subscribe` method settles into
 *    `{ loading: false, data: undefined }` without erroring
 *  - subscribe() returning undefined opts the binding out gracefully
 *  - errors thrown by the iterator surface on `error`
 */

import './setup.js';
import { describe, expect, it, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { useSubscription } from '../src/hooks/use-subscription.js';
import type { DataBinding, DataResolver, UseSubscriptionResult } from '../src/index.js';

interface ProbeProps {
  resolver: DataResolver;
  binding: DataBinding;
  capture?: (result: UseSubscriptionResult<unknown>) => void;
}

function Probe({ resolver, binding, capture }: ProbeProps): React.ReactElement {
  const result = useSubscription<unknown>({ resolver, binding });
  capture?.(result);
  return (
    <div>
      <span data-testid="state">
        {result.loading
          ? 'loading'
          : result.error
            ? `error:${result.error instanceof Error ? result.error.message : JSON.stringify(result.error)}`
            : 'ready'}
      </span>
      <span data-testid="data">
        {result.data === undefined ? 'none' : JSON.stringify(result.data)}
      </span>
      <button data-testid="reconnect" onClick={() => result.reconnect()}>
        reconnect
      </button>
    </div>
  );
}

/**
 * Build a controllable async iterable: tests can `push(value)` to deliver
 * the next item to the consumer's `next()` call. `close()` ends the
 * stream. `returnSpy` records cleanup invocations.
 */
function controllableIterable(): {
  iterable: AsyncIterable<unknown>;
  push: (value: unknown) => void;
  close: () => void;
  reject: (err: unknown) => void;
  returnSpy: ReturnType<typeof vi.fn>;
} {
  const buffered: unknown[] = [];
  const waiters: ((res: IteratorResult<unknown>) => void)[] = [];
  const errorWaiters: ((err: unknown) => void)[] = [];
  let pendingError: unknown;
  let done = false;
  const returnSpy = vi.fn();

  const iterable: AsyncIterable<unknown> = {
    [Symbol.asyncIterator](): AsyncIterator<unknown> {
      return {
        next(): Promise<IteratorResult<unknown>> {
          if (pendingError !== undefined) {
            const raw: unknown = pendingError;
            pendingError = undefined;
            const err =
              raw instanceof Error
                ? raw
                : new Error(typeof raw === 'string' ? raw : JSON.stringify(raw));
            return Promise.reject(err);
          }
          if (done) return Promise.resolve({ value: undefined, done: true });
          if (buffered.length > 0) {
            return Promise.resolve({ value: buffered.shift(), done: false });
          }
          return new Promise<IteratorResult<unknown>>((resolve, reject) => {
            waiters.push(resolve);
            errorWaiters.push(reject);
          });
        },
        return(): Promise<IteratorResult<unknown>> {
          returnSpy();
          done = true;
          while (waiters.length > 0) waiters.shift()!({ value: undefined, done: true });
          return Promise.resolve({ value: undefined, done: true });
        },
      };
    },
  };

  return {
    iterable,
    push(value: unknown): void {
      const w = waiters.shift();
      errorWaiters.shift();
      if (w) {
        w({ value, done: false });
      } else {
        buffered.push(value);
      }
    },
    close(): void {
      done = true;
      while (waiters.length > 0) {
        waiters.shift()!({ value: undefined, done: true });
      }
    },
    reject(err: unknown): void {
      const e = errorWaiters.shift();
      waiters.shift();
      if (e) {
        e(err);
      } else {
        pendingError = err;
      }
    },
    returnSpy,
  };
}

describe('useSubscription', () => {
  it('mount → loading → first item → ready (lifecycle)', async () => {
    const ctl = controllableIterable();
    const resolver: DataResolver = () => undefined;
    resolver.subscribe = () => ctl.iterable;

    const { getByTestId } = render(<Probe resolver={resolver} binding={{ source: 'presence' }} />);
    expect(getByTestId('state').textContent).toBe('loading');
    expect(getByTestId('data').textContent).toBe('none');

    await act(async () => {
      ctl.push({ user: 'alice' });
      // Allow the pump's setState to flush.
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(getByTestId('state').textContent).toBe('ready'));
    expect(getByTestId('data').textContent).toBe(JSON.stringify({ user: 'alice' }));
  });

  it('unmount calls iterator.return() (cleanup contract)', () => {
    const ctl = controllableIterable();
    const resolver: DataResolver = () => undefined;
    resolver.subscribe = () => ctl.iterable;

    const { unmount } = render(<Probe resolver={resolver} binding={{ source: 'x' }} />);
    unmount();
    // Cleanup runs synchronously.
    expect(ctl.returnSpy).toHaveBeenCalledTimes(1);
  });

  it('reconnect() tears down the current iterator and opens a fresh one', async () => {
    const ctl1 = controllableIterable();
    const ctl2 = controllableIterable();
    const sequence: ReturnType<typeof controllableIterable>[] = [ctl1, ctl2];
    const subscribe = vi.fn(() => sequence.shift()!.iterable);
    const resolver: DataResolver = () => undefined;
    resolver.subscribe = subscribe;

    const { getByTestId } = render(<Probe resolver={resolver} binding={{ source: 'x' }} />);
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(getByTestId('state').textContent).toBe('loading');

    await act(async () => {
      getByTestId('reconnect').click();
      await Promise.resolve();
    });

    expect(subscribe).toHaveBeenCalledTimes(2);
    expect(ctl1.returnSpy).toHaveBeenCalledTimes(1);
  });

  it('resolver without subscribe settles to { loading: false, data: undefined }', async () => {
    const resolver: DataResolver = () => undefined;
    // Intentionally no .subscribe.
    const { getByTestId } = render(<Probe resolver={resolver} binding={{ source: 'x' }} />);
    await waitFor(() => expect(getByTestId('state').textContent).toBe('ready'));
    expect(getByTestId('data').textContent).toBe('none');
  });

  it('subscribe() returning undefined opts the binding out gracefully', async () => {
    const resolver: DataResolver = () => undefined;
    resolver.subscribe = () => undefined;
    const { getByTestId } = render(<Probe resolver={resolver} binding={{ source: 'static' }} />);
    await waitFor(() => expect(getByTestId('state').textContent).toBe('ready'));
    expect(getByTestId('data').textContent).toBe('none');
  });

  it('surfaces iterator errors on result.error', async () => {
    const ctl = controllableIterable();
    const resolver: DataResolver = () => undefined;
    resolver.subscribe = () => ctl.iterable;

    const { getByTestId } = render(<Probe resolver={resolver} binding={{ source: 'x' }} />);
    expect(getByTestId('state').textContent).toBe('loading');

    await act(async () => {
      ctl.reject(new Error('stream-failed'));
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(getByTestId('state').textContent).toMatch(/^error:/));
    expect(getByTestId('state').textContent).toContain('stream-failed');
  });

  it('synchronous throw from subscribe() is captured in error', async () => {
    const resolver: DataResolver = () => undefined;
    resolver.subscribe = () => {
      throw new Error('subscribe-throws');
    };
    const { getByTestId } = render(<Probe resolver={resolver} binding={{ source: 'x' }} />);
    await waitFor(() => expect(getByTestId('state').textContent).toMatch(/^error:/));
    expect(getByTestId('state').textContent).toContain('subscribe-throws');
  });
});
