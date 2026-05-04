// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `InMemoryTriggerTransport` — process-local fan-out.
 *
 * Multiple `TriggerBus` instances in the SAME Node process can attach to
 * one shared transport and exchange triggers. Used in tests where two or
 * more buses need to "see" each other without spinning up a real network
 * coordinator, and in single-process hosts that want consistent semantics
 * with the distributed transports.
 *
 * Loop prevention: every published frame carries the publishing bus's
 * `originNodeId`. The transport delivers to ALL subscribers — including
 * the publisher — and the bus's inbound handler drops self-echoes.
 *
 * Lifecycle:
 *   const transport = new InMemoryTriggerTransport();
 *   busA.setTransport(transport);
 *   busB.setTransport(transport);
 *   await busA.emit(trigger);   // both busA's local subscribers AND busB's fire
 *   await transport.close();    // detaches every subscriber
 */

import type { Trigger } from '@atelier/schemas';
import type {
  TriggerTransport,
  TriggerTransportHandler,
  TriggerTransportUnsubscribe,
} from '../triggers/trigger-transport.js';

export class InMemoryTriggerTransport implements TriggerTransport {
  readonly #handlers = new Set<TriggerTransportHandler>();
  #closed = false;

  /** Total attached subscribers. Useful for tests + health checks. */
  get subscriberCount(): number {
    return this.#handlers.size;
  }

  publish(trigger: Trigger, originNodeId: string): Promise<void> {
    if (this.#closed) return Promise.resolve();
    // Snapshot before iterating — handlers may unsubscribe synchronously.
    const snapshot = Array.from(this.#handlers);
    for (const handler of snapshot) {
      try {
        handler(trigger, { originNodeId });
      } catch {
        // Transport is best-effort. The bus owns onError; we don't have one.
      }
    }
    return Promise.resolve();
  }

  subscribe(handler: TriggerTransportHandler): TriggerTransportUnsubscribe {
    if (this.#closed) return () => {};
    this.#handlers.add(handler);
    return () => {
      this.#handlers.delete(handler);
    };
  }

  close(): Promise<void> {
    if (this.#closed) return Promise.resolve();
    this.#closed = true;
    this.#handlers.clear();
    return Promise.resolve();
  }
}
