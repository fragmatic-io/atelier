// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';
/**
 * `useDispatcher()` — returns a memoized dispatch function that wires the
 * `ActionExecutionContext` automatically.
 *
 * The execution context is assembled from:
 *  - `services.identity.user_id`, `services.identity.app_id` (provider-set)
 *  - `manifest_id` (read from `CurrentManifestContext`, set by `<CirRoute>`)
 *
 * Hosts that fire actions outside a route can still call this — `manifest_id`
 * is simply omitted from the audit trail. The dispatcher's audit emitter
 * handles the missing field gracefully (see `actions/dispatcher.ts`).
 */

import { useCallback, useContext } from 'react';
import type { ActionResult } from '@cir/runtime';
import { useCir } from './use-cir.js';
import { CurrentManifestContext } from '../context/manifest-context.js';

export type DispatchFn = (capabilityId: string, input: unknown) => Promise<ActionResult>;

export function useDispatcher(): DispatchFn {
  const services = useCir();
  const current = useContext(CurrentManifestContext);

  return useCallback(
    (capabilityId, input) => {
      const ctx = {
        user_id: services.identity.user_id,
        app_id: services.identity.app_id,
        ...(current?.manifest_id ? { manifest_id: current.manifest_id } : {}),
      };
      return services.dispatcher.dispatch(capabilityId, input, ctx);
    },
    [services, current?.manifest_id],
  );
}
