// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * In-memory trigger bus. Synchronous-ish: subscribers fire in registration
 * order; the bus awaits async handlers before resolving `emit()`. Errors
 * thrown by handlers are swallowed and reported to an optional `onError`
 * hook (default: nothing) so one bad listener cannot poison the bus.
 *
 * Subscribers can register for one specific event type or for `'*'`
 * (wildcard, every event).
 */

import type { Trigger } from '@cir/schemas';
import type { Unsubscribe } from '../types.js';
import {
  WILDCARD_TRIGGER_TYPE,
  type TriggerHandler,
  type TriggerSubscription,
} from './subscription.js';

export interface InMemoryTriggerBusOptions {
  /** Called when a handler throws. Defaults to a no-op. */
  onError?: (err: unknown, event: Trigger) => void;
}

export class InMemoryTriggerBus implements TriggerSubscription {
  readonly #typed = new Map<string, Set<TriggerHandler>>();
  readonly #wildcard = new Set<TriggerHandler>();
  readonly #onError: (err: unknown, event: Trigger) => void;

  constructor(opts: InMemoryTriggerBusOptions = {}) {
    this.#onError = opts.onError ?? (() => {});
  }

  subscribe(
    eventType: Trigger['type'] | typeof WILDCARD_TRIGGER_TYPE,
    handler: TriggerHandler,
  ): Unsubscribe {
    if (eventType === WILDCARD_TRIGGER_TYPE) {
      this.#wildcard.add(handler);
      return () => this.#wildcard.delete(handler);
    }
    let bucket = this.#typed.get(eventType);
    if (!bucket) {
      bucket = new Set();
      this.#typed.set(eventType, bucket);
    }
    bucket.add(handler);
    return () => {
      bucket?.delete(handler);
      if (bucket && bucket.size === 0) {
        this.#typed.delete(eventType);
      }
    };
  }

  async emit(event: Trigger): Promise<void> {
    const handlers: TriggerHandler[] = [];
    const typed = this.#typed.get(event.type);
    if (typed) handlers.push(...typed);
    handlers.push(...this.#wildcard);
    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (err) {
        try {
          this.#onError(err, event);
        } catch {
          // never let onError itself break the bus
        }
      }
    }
  }

  /** Test helper. Total subscriber count across typed + wildcard buckets. */
  subscriberCount(): number {
    let n = this.#wildcard.size;
    for (const bucket of this.#typed.values()) n += bucket.size;
    return n;
  }
}
