// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
/**
 * Trigger subscription contract.
 *
 * The runtime listens to schema/policy/intent triggers (see
 * `/Users/vid/cir/docs/triggers.md`) and uses them to invalidate cached
 * manifests. The transport (WebSocket, SSE, long-poll, in-process) is the
 * host's concern; the runtime depends only on the `TriggerSubscription`
 * interface here.
 *
 * Phase 4a ships the in-memory bus (`InMemoryTriggerBus`) for tests and
 * single-process scenarios. Real network transports land per-deployment in
 * Phase 4c.
 */

import type { Trigger } from '@cir/schemas';
import type { Unsubscribe } from '../types.js';

/** A subscription handler. May be async; the bus awaits it. */
export type TriggerHandler = (event: Trigger) => void | Promise<void>;

/** Wildcard event type. Used to subscribe to every trigger regardless of type. */
export const WILDCARD_TRIGGER_TYPE = '*';

export interface TriggerSubscription {
  /**
   * Subscribe to one event type, or to every event with `'*'`. Returns a
   * function the caller invokes to unsubscribe.
   */
  subscribe(
    eventType: Trigger['type'] | typeof WILDCARD_TRIGGER_TYPE,
    handler: TriggerHandler,
  ): Unsubscribe;
  /**
   * Emit an event to every subscribed handler. Async handlers are awaited;
   * errors thrown by handlers are swallowed (the bus does not poison itself
   * because of one bad listener).
   */
  emit(event: Trigger): Promise<void>;
}
