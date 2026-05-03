// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * `useSubscription({ resolver, binding })` — Wave 10 / S-3.
 *
 * React hook that opens a live `AsyncIterable` from the resolver's
 * optional `subscribe(binding)` method and re-renders the consuming
 * component each time the stream emits a new value. The hook owns the
 * iterator's lifecycle: it calls `iterator.return()` on unmount and on
 * binding change to release the underlying transport (EventSource,
 * in-memory generator, …).
 *
 * Returned shape:
 *  - `data`: the latest value yielded by the stream (or `undefined`
 *    until the first item arrives).
 *  - `loading`: `true` between subscribe and the first item / error.
 *    Becomes `false` once either fires.
 *  - `error`: any error thrown by the iterator. Surfaces transport
 *    failures the resolver chose not to swallow with reconnect.
 *  - `reconnect()`: tear down the current iterator and open a fresh one.
 *    Useful after auth refresh or for explicit "retry" UX.
 *
 * If the resolver does not implement `subscribe`, the hook returns
 * `loading: false` with `data: undefined` and never sets state — the
 * caller should fall back to a one-shot `resolve()` path. The hook does
 * NOT silently call `resolve()` itself so the two paths stay clearly
 * separated; mixing snapshot + stream is the host's call (a future
 * `useLiveData` could compose both).
 *
 * Why this lives in `@atelier/react` and not in `@atelier/data-resolvers`:
 * the resolvers package is React-agnostic. This hook is the React-side
 * adapter that consumes the protocol.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DataBinding, DataResolver } from '../data/data-resolver.js';

export interface UseSubscriptionResult<T> {
  data: T | undefined;
  loading: boolean;
  error: unknown;
  reconnect: () => void;
}

export interface UseSubscriptionOptions {
  resolver: DataResolver;
  binding: DataBinding;
}

/**
 * Stable key for binding equality. Re-subscribes only when one of the
 * fields the resolver actually consumes changes (avoids tearing down the
 * stream on every parent re-render).
 */
function bindingKey(binding: DataBinding): string {
  return [binding.source, binding.filter ?? '', binding.sort ?? '', binding.group_by ?? ''].join(
    '|',
  );
}

export function useSubscription<T = unknown>(
  opts: UseSubscriptionOptions,
): UseSubscriptionResult<T> {
  const { resolver, binding } = opts;
  const key = bindingKey(binding);

  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<unknown>(undefined);
  // A monotonically-increasing version number that triggers a fresh
  // subscription when bumped. `reconnect()` increments it. Stored in
  // state (not a ref) so the dependent effect re-runs.
  const [version, setVersion] = useState(0);

  // Hold the latest binding in a ref so `reconnect()` doesn't have to
  // rebuild on every render.
  const bindingRef = useRef(binding);
  bindingRef.current = binding;

  useEffect(() => {
    // If the resolver has no subscribe surface, settle into a no-op
    // state. Don't touch `data` — keep whatever the caller seeded.
    if (typeof resolver.subscribe !== 'function') {
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setError(undefined);

    let iterable: AsyncIterable<unknown> | undefined;
    try {
      iterable = resolver.subscribe(bindingRef.current);
    } catch (err) {
      setError(err);
      setLoading(false);
      return undefined;
    }
    if (!iterable) {
      // Resolver opted this binding out of streaming.
      setLoading(false);
      return undefined;
    }

    const iterator = iterable[Symbol.asyncIterator]();

    const pump = async (): Promise<void> => {
      try {
        while (!cancelled) {
          const result = await iterator.next();
          if (cancelled) return;
          if (result.done) {
            setLoading(false);
            return;
          }
          setData(result.value as T);
          setLoading(false);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err);
        setLoading(false);
      }
    };
    void pump();

    return (): void => {
      cancelled = true;
      try {
        void iterator.return?.();
      } catch {
        /* ignore */
      }
    };
    // `key` covers binding identity; `version` triggers reconnect.
  }, [resolver, key, version]);

  const reconnect = useCallback((): void => {
    setVersion((v) => v + 1);
  }, []);

  return { data, loading, error, reconnect };
}
