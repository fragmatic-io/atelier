// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `SseTriggerTransport` — host-pluggable Server-Sent Events transport.
 *
 * Pairs with `createTriggerCoordinator()`. Publishes via HTTP POST to
 * `<endpoint>/triggers/publish`; subscribes via an SSE stream from
 * `<endpoint>/triggers/subscribe`. The coordinator fans every POSTed
 * trigger out to every connected SSE client; subscribers drop self-echoes
 * via the envelope's `origin_node_id`.
 *
 * Why SSE (not WebSocket / not Redis):
 *   SSE is one-way (server → client), reconnects automatically, traverses
 *   most corporate proxies, and matches the trigger bus's actual semantics
 *   — clients consume, the coordinator broadcasts. Publishing is plain
 *   HTTP POST which is idempotent enough for this use case (triggers are
 *   ephemeral and at-most-once is acceptable). For at-least-once delivery
 *   hosts wire a different transport against `TriggerTransport`.
 *
 * Lifecycle:
 *   const transport = new SseTriggerTransport({
 *     endpoint: 'http://coordinator:9100',
 *     fetch: globalThis.fetch,
 *     EventSourceImpl: EventSource,
 *   });
 *   bus.setTransport(transport);   // bus subscribes; transport opens SSE
 *   await bus.emit(trigger);       // POST → coordinator → all SSE clients
 *   await transport.close();       // closes SSE + drops handler refs
 *
 * Node usage:
 *   Node 18+ has global `fetch`. For the SSE side, pass an `EventSource`
 *   shim — the standard library doesn't ship one. The `eventsource`
 *   package on npm works; tests in this repo use a tiny in-process shim.
 */

import type { Trigger } from '@atelier/schemas';
import type {
  TriggerEnvelope,
  TriggerTransport,
  TriggerTransportHandler,
  TriggerTransportUnsubscribe,
} from '../triggers/trigger-transport.js';

/** Subset of the WHATWG EventSource interface we depend on. */
export interface EventSourceLike {
  readonly readyState: number;
  onmessage: ((ev: { data: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onopen: ((ev: unknown) => void) | null;
  addEventListener?: (type: string, listener: (ev: { data: string }) => void) => void;
  close(): void;
}

export type EventSourceCtor = new (url: string) => EventSourceLike;

/** Subset of the WHATWG fetch we depend on for `publish()`. */
export type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export interface SseTriggerTransportOptions {
  /**
   * Coordinator base URL. Endpoints resolve as
   *   `<endpoint>/triggers/publish`
   *   `<endpoint>/triggers/subscribe`
   * Trailing slashes are normalised.
   */
  endpoint: string;
  /**
   * EventSource constructor. Defaults to `globalThis.EventSource`. Tests
   * inject a fake here. In Node, install the `eventsource` package or pass
   * a shim — the standard library doesn't ship one.
   */
  EventSourceImpl?: EventSourceCtor;
  /** Fetch implementation used by `publish()`. Defaults to `globalThis.fetch`. */
  fetch?: FetchLike;
  /** Optional callback when the SSE connection opens. */
  onOpen?: () => void;
  /** Optional callback on SSE error. EventSource auto-reconnects. */
  onError?: (err: unknown) => void;
  /** Optional callback when a malformed payload arrives. Default: silent. */
  onParseError?: (raw: string, err: unknown) => void;
  /**
   * Optional callback when `publish()`'s POST fails. Default: silent. The
   * bus's `onError` also receives the failure via the publish promise
   * rejection — this hook is purely for observability.
   */
  onPublishError?: (err: unknown, trigger: Trigger) => void;
}

function normaliseEndpoint(endpoint: string): string {
  return endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint;
}

function resolveEventSource(injected: EventSourceCtor | undefined): EventSourceCtor | undefined {
  if (injected) return injected;
  if (typeof globalThis === 'undefined') return undefined;
  const g = globalThis as { EventSource?: unknown };
  if (typeof g.EventSource === 'function') {
    return g.EventSource as EventSourceCtor;
  }
  return undefined;
}

function resolveFetch(injected: FetchLike | undefined): FetchLike | undefined {
  if (injected) return injected;
  if (typeof globalThis === 'undefined') return undefined;
  const g = globalThis as { fetch?: unknown };
  if (typeof g.fetch === 'function') {
    return g.fetch as FetchLike;
  }
  return undefined;
}

export class SseTriggerTransport implements TriggerTransport {
  readonly #endpoint: string;
  readonly #EventSourceImpl: EventSourceCtor | undefined;
  readonly #fetch: FetchLike | undefined;
  readonly #onOpen: (() => void) | undefined;
  readonly #onError: ((err: unknown) => void) | undefined;
  readonly #onParseError: ((raw: string, err: unknown) => void) | undefined;
  readonly #onPublishError: ((err: unknown, trigger: Trigger) => void) | undefined;
  readonly #handlers = new Set<TriggerTransportHandler>();
  #es: EventSourceLike | null = null;
  #closed = false;

  constructor(opts: SseTriggerTransportOptions) {
    this.#endpoint = normaliseEndpoint(opts.endpoint);
    this.#EventSourceImpl = resolveEventSource(opts.EventSourceImpl);
    this.#fetch = resolveFetch(opts.fetch);
    this.#onOpen = opts.onOpen;
    this.#onError = opts.onError;
    this.#onParseError = opts.onParseError;
    this.#onPublishError = opts.onPublishError;
  }

  get readyState(): number {
    return this.#es?.readyState ?? 2; // CLOSED
  }

  /** Coordinator base URL after normalisation. Useful for tests + logs. */
  get endpoint(): string {
    return this.#endpoint;
  }

  async publish(trigger: Trigger, originNodeId: string): Promise<void> {
    if (this.#closed) return;
    if (!this.#fetch) {
      const err = new Error('SseTriggerTransport: no fetch available. Pass `fetch` explicitly.');
      this.#onPublishError?.(err, trigger);
      throw err;
    }
    const envelope: TriggerEnvelope = { origin_node_id: originNodeId, trigger };
    const body = JSON.stringify(envelope);
    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await this.#fetch(`${this.#endpoint}/triggers/publish`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      });
    } catch (err) {
      this.#onPublishError?.(err, trigger);
      throw err;
    }
    if (!res.ok) {
      const err = new Error(`SseTriggerTransport: publish failed with status ${res.status}`);
      this.#onPublishError?.(err, trigger);
      throw err;
    }
  }

  subscribe(handler: TriggerTransportHandler): TriggerTransportUnsubscribe {
    if (this.#closed) return () => {};
    this.#handlers.add(handler);
    this.#ensureConnected();
    return () => {
      this.#handlers.delete(handler);
      if (this.#handlers.size === 0) {
        this.#closeStream();
      }
    };
  }

  close(): Promise<void> {
    if (this.#closed) return Promise.resolve();
    this.#closed = true;
    this.#handlers.clear();
    this.#closeStream();
    return Promise.resolve();
  }

  #ensureConnected(): void {
    if (this.#es || this.#closed) return;
    if (!this.#EventSourceImpl) {
      throw new Error(
        'SseTriggerTransport: no EventSource available. In Node, pass `EventSourceImpl` explicitly.',
      );
    }
    const es = new this.#EventSourceImpl(`${this.#endpoint}/triggers/subscribe`);
    es.onopen = (): void => {
      this.#onOpen?.();
    };
    es.onerror = (err: unknown): void => {
      this.#onError?.(err);
    };
    const onMessage = (ev: { data: string }): void => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(ev.data);
      } catch (err) {
        this.#onParseError?.(ev.data, err);
        return;
      }
      if (!parsed || typeof parsed !== 'object') {
        this.#onParseError?.(ev.data, new Error('not a trigger envelope'));
        return;
      }
      const env = parsed as Partial<TriggerEnvelope>;
      const trig = env.trigger;
      if (
        !trig ||
        typeof trig !== 'object' ||
        typeof (trig as { type?: unknown }).type !== 'string'
      ) {
        this.#onParseError?.(ev.data, new Error('envelope missing trigger payload'));
        return;
      }
      const meta =
        typeof env.origin_node_id === 'string' ? { originNodeId: env.origin_node_id } : undefined;
      const snapshot = Array.from(this.#handlers);
      for (const handler of snapshot) {
        try {
          handler(trig, meta);
        } catch {
          // Best-effort. The bus owns onError.
        }
      }
    };
    // Coordinator emits `event: trigger\n…` frames. Browsers route those
    // to addEventListener('trigger') — onmessage only fires for the
    // unnamed default event. Wire both for compatibility with shims.
    if (typeof es.addEventListener === 'function') {
      es.addEventListener('trigger', onMessage);
    }
    es.onmessage = onMessage;
    this.#es = es;
  }

  #closeStream(): void {
    if (!this.#es) return;
    try {
      this.#es.close();
    } catch {
      // Idempotent.
    }
    this.#es = null;
  }
}
