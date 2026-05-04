// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * In-memory trigger bus. Synchronous-ish: subscribers fire in registration
 * order; the bus awaits async handlers before resolving `emit()`. Errors
 * thrown by handlers are swallowed and reported to an optional `onError`
 * hook (default: nothing) so one bad listener cannot poison the bus.
 *
 * Subscribers can register for one specific event type or for `'*'`
 * (wildcard, every event).
 */

import type { Trigger } from '@atelier/schemas';
import type { Unsubscribe } from '../types.js';
import {
  WILDCARD_TRIGGER_TYPE,
  type TriggerHandler,
  type TriggerSubscription,
} from './subscription.js';
import type { TriggerTransport, TriggerTransportUnsubscribe } from './trigger-transport.js';

export interface InMemoryTriggerBusOptions {
  /** Called when a handler throws. Defaults to a no-op. */
  onError?: (err: unknown, event: Trigger) => void;
  /**
   * Optional opaque id for this bus instance. Used by `setTransport()` to
   * drop self-echoes (a trigger this bus published, fanned out via the
   * transport, and looped back on the inbound path). Defaults to a random
   * uuid (or a fallback `Math.random` id when `crypto` is unavailable).
   */
  originNodeId?: string;
}

function defaultOriginNodeId(): string {
  const cryptoLike = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoLike?.randomUUID) return cryptoLike.randomUUID();
  return `node-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

export class InMemoryTriggerBus implements TriggerSubscription {
  readonly #typed = new Map<string, Set<TriggerHandler>>();
  readonly #wildcard = new Set<TriggerHandler>();
  readonly #onError: (err: unknown, event: Trigger) => void;
  readonly #originNodeId: string;
  #transport: TriggerTransport | null = null;
  #transportUnsub: TriggerTransportUnsubscribe | null = null;

  constructor(opts: InMemoryTriggerBusOptions = {}) {
    this.#onError = opts.onError ?? (() => {});
    this.#originNodeId = opts.originNodeId ?? defaultOriginNodeId();
  }

  /** Per-process opaque id used to drop self-echoes via the transport. */
  get originNodeId(): string {
    return this.#originNodeId;
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
    await this.#dispatchLocal(event);
    if (this.#transport) {
      try {
        await this.#transport.publish(event, this.#originNodeId);
      } catch (err) {
        try {
          this.#onError(err, event);
        } catch {
          // never let onError itself break the bus
        }
      }
    }
  }

  /**
   * Attach a transport. The bus subscribes immediately so inbound triggers
   * reach local subscribers; outgoing `emit()` calls are mirrored to the
   * transport's `publish()`. Loop prevention: triggers whose meta carries
   * this bus's `originNodeId` are dropped on the inbound path so a trigger
   * emitted locally and echoed back via the transport never re-fires.
   *
   * Calling `setTransport()` a second time detaches the previous transport
   * (its inbound subscription is cleared via the returned unsub). The bus
   * does NOT call `close()` on the previous transport — ownership stays
   * with the caller.
   */
  setTransport(transport: TriggerTransport | null): void {
    if (this.#transportUnsub) {
      try {
        this.#transportUnsub();
      } catch {
        // Defensive — transports own their own teardown idempotency.
      }
      this.#transportUnsub = null;
    }
    this.#transport = transport;
    if (!transport) return;
    this.#transportUnsub = transport.subscribe((trigger, meta) => {
      // Loop prevention — drop our own echoes.
      if (meta?.originNodeId && meta.originNodeId === this.#originNodeId) return;
      void this.#dispatchLocal(trigger);
    });
  }

  /** Test helper. Total subscriber count across typed + wildcard buckets. */
  subscriberCount(): number {
    let n = this.#wildcard.size;
    for (const bucket of this.#typed.values()) n += bucket.size;
    return n;
  }

  async #dispatchLocal(event: Trigger): Promise<void> {
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
}
