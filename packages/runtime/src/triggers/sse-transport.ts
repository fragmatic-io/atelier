// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Server-Sent Events transport for the trigger bus.
 *
 * Bridges a remote SSE stream into a local `TriggerSubscription` (typically
 * an `InMemoryTriggerBus`). Each `data:` line is parsed as JSON, validated
 * loosely as a `Trigger` (must be an object with a string `type` field —
 * full schema validation is the policy engine's job downstream), and
 * `emit()`-ed onto the local bus.
 *
 * Why SSE and not WebSocket: SSE is one-way (server → client), reconnects
 * automatically via the browser's EventSource, fits clean into Next.js
 * route handlers, and matches the trigger bus's semantics (server tells
 * client "your manifest is stale, recompile"). WebSocket would be needed
 * only when clients also publish triggers upstream — which the runtime
 * currently doesn't.
 *
 * Lifecycle:
 *   const transport = new SseTriggerTransport({ url: '/api/triggers/stream', bus });
 *   transport.connect();
 *   // … later …
 *   transport.close();
 *
 * `connect()` is idempotent (no-op if already open). `close()` is safe to
 * call multiple times.
 *
 * Browser-only: this module references `EventSource` from the global. Tests
 * inject a fake `EventSource` constructor via `opts.EventSourceImpl`.
 */

import type { Trigger } from '@cir/schemas';
import type { TriggerSubscription } from './subscription.js';

/** Subset of the WHATWG EventSource interface we depend on. */
export interface EventSourceLike {
  readonly readyState: number;
  onmessage: ((ev: { data: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onopen: ((ev: unknown) => void) | null;
  close(): void;
}

export type EventSourceCtor = new (url: string) => EventSourceLike;

export interface SseTriggerTransportOptions {
  /** SSE endpoint URL. The server streams `data: <json-trigger>` lines. */
  url: string;
  /** The local bus that `emit()` is forwarded to. */
  bus: TriggerSubscription;
  /**
   * EventSource constructor. Defaults to `globalThis.EventSource`. Tests
   * inject a fake here.
   */
  EventSourceImpl?: EventSourceCtor;
  /** Optional callback when connection opens (after server ack). */
  onOpen?: () => void;
  /** Optional callback on connection error. EventSource auto-reconnects. */
  onError?: (err: unknown) => void;
  /** Optional callback when a malformed payload arrives. Default: silent. */
  onParseError?: (raw: string, err: unknown) => void;
}

export class SseTriggerTransport {
  readonly #url: string;
  readonly #bus: TriggerSubscription;
  readonly #EventSourceImpl: EventSourceCtor | undefined;
  readonly #onOpen: (() => void) | undefined;
  readonly #onError: ((err: unknown) => void) | undefined;
  readonly #onParseError: ((raw: string, err: unknown) => void) | undefined;
  #es: EventSourceLike | null = null;
  #closed = false;

  constructor(opts: SseTriggerTransportOptions) {
    this.#url = opts.url;
    this.#bus = opts.bus;
    this.#EventSourceImpl =
      opts.EventSourceImpl ??
      (typeof globalThis !== 'undefined' &&
      'EventSource' in globalThis &&
      typeof (globalThis as { EventSource?: unknown }).EventSource === 'function'
        ? (globalThis as unknown as { EventSource: EventSourceCtor }).EventSource
        : undefined);
    this.#onOpen = opts.onOpen;
    this.#onError = opts.onError;
    this.#onParseError = opts.onParseError;
  }

  /** Connection state, mirroring EventSource semantics. */
  get readyState(): number {
    return this.#es?.readyState ?? 2; // CLOSED
  }

  /** Open the SSE connection. No-op if already open or closed. */
  connect(): void {
    if (this.#es || this.#closed) return;
    if (!this.#EventSourceImpl) {
      throw new Error(
        'SseTriggerTransport: no EventSource available. In Node, pass EventSourceImpl explicitly.',
      );
    }
    const es = new this.#EventSourceImpl(this.#url);
    es.onopen = (): void => {
      this.#onOpen?.();
    };
    es.onerror = (err: unknown): void => {
      this.#onError?.(err);
    };
    es.onmessage = (ev: { data: string }): void => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(ev.data);
      } catch (err) {
        this.#onParseError?.(ev.data, err);
        return;
      }
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        typeof (parsed as { type?: unknown }).type !== 'string'
      ) {
        this.#onParseError?.(ev.data, new Error('not a trigger envelope'));
        return;
      }
      // Best-effort emit. Schema validation is the consumer's call.
      void this.#bus.emit(parsed as Trigger);
    };
    this.#es = es;
  }

  /** Close the connection. Idempotent. */
  close(): void {
    this.#closed = true;
    this.#es?.close();
    this.#es = null;
  }
}
