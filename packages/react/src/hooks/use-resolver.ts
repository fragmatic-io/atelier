// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors

'use client';
/**
 * `useManifest(route)` — resolves a manifest for the given route via the
 * provider's `ManifestResolver`. Re-fetches when the path changes; cancels
 * stale fetches on unmount via component-level state guards.
 *
 * Returned shape (`UseManifestResult`):
 *  - `manifest`: the resolved `Manifest`, or `null` while loading / on error
 *  - `isLoading`: true between request start and resolution
 *  - `error`: any error thrown by the resolver (network, validation, ...)
 *  - `refresh()`: force a re-fetch (bypasses the cache)
 *
 * Why no AbortController on the resolver path: the runtime's
 * `ManifestResolver.resolve()` does not currently accept an AbortSignal
 * (see `manifest/resolver.ts`). We instead guard against stale state
 * updates with a mounted/sequence flag — equivalent observable behavior
 * from React's perspective and avoids leaking an unsupported flag through
 * the runtime API.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Manifest } from '@cir/schemas';
import { useCir } from './use-cir.js';

export interface UseManifestResult {
  manifest: Manifest | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export interface UseManifestOptions {
  forceRefresh?: boolean;
}

export function useManifest(route: string, opts: UseManifestOptions = {}): UseManifestResult {
  const services = useCir();
  const { resolver, identity } = services;
  const initialForce = opts.forceRefresh === true;

  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  // Sequence guard: only the most-recent request's result is committed to
  // state. Previous in-flight responses become no-ops on resolve.
  const seqRef = useRef(0);
  const mountedRef = useRef(true);

  const run = useCallback(
    async (forceRefresh: boolean): Promise<void> => {
      const seq = ++seqRef.current;
      setIsLoading(true);
      setError(null);
      try {
        const m = await resolver.resolve(
          { user_id: identity.user_id, app_id: identity.app_id, route },
          forceRefresh ? { forceRefresh: true } : {},
        );
        if (!mountedRef.current || seqRef.current !== seq) return;
        setManifest(m);
      } catch (err) {
        if (!mountedRef.current || seqRef.current !== seq) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setManifest(null);
      } finally {
        if (mountedRef.current && seqRef.current === seq) {
          setIsLoading(false);
        }
      }
    },
    [resolver, identity.user_id, identity.app_id, route],
  );

  useEffect(() => {
    mountedRef.current = true;
    void run(initialForce);
    return () => {
      mountedRef.current = false;
      // Bump seq so any pending resolve commits to no-op.
      seqRef.current += 1;
    };
  }, [run, initialForce]);

  const refresh = useCallback(async (): Promise<void> => {
    await run(true);
  }, [run]);

  return { manifest, isLoading, error, refresh };
}
