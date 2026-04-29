// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors

'use client';
/**
 * `useTrigger(eventType, handler)` — subscribe to a trigger type for the
 * lifetime of the calling component.
 *
 * Auto-cleanup: returns no value; the hook owns the unsubscribe and calls
 * it on unmount or when `eventType` changes. The `handler` reference is
 * read through a ref so callers don't have to memoize their closure to
 * avoid resubscribing on every render.
 */

import { useEffect, useRef } from 'react';
import type { Trigger } from '@cir/schemas';
import type { TriggerHandler } from '@cir/runtime';
import { useCir } from './use-cir.js';

/** Wildcard literal `'*'` mirrors `@cir/runtime`'s `WILDCARD_TRIGGER_TYPE`. */
export type TriggerEventType = Trigger['type'] | '*';

export function useTrigger(eventType: TriggerEventType, handler: TriggerHandler): void {
  const { bus } = useCir();
  const handlerRef = useRef<TriggerHandler>(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const unsub = bus.subscribe(eventType, (event) => handlerRef.current(event));
    return () => {
      unsub();
    };
  }, [bus, eventType]);
}
