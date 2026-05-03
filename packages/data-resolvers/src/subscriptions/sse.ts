// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `SseSubscriptionResolver` — a `DataResolver` whose `subscribe(binding)`
 * opens a Server-Sent Events stream over HTTP and yields each `data:`
 * payload as parsed JSON.
 *
 * Why SSE, not WebSocket: SSE is one-way (server → client), reconnects
 * automatically via the browser's `EventSource`, fits clean into Next.js
 * route handlers, and matches the multiplayer presence / cursor / comment
 * semantics that gate Coll-1..5 (the server tells the client "another
 * user moved" — clients never publish over the same channel; the
 * upstream path is `Trigger`-based via S-4's `RedisTriggerBus`).
 *
 * The transport mirrors `@atelier/runtime/triggers/sse-transport` — same
 * `EventSourceLike` seam so tests can inject a fake constructor and Node
 * hosts can pass a polyfill explicitly.
 *
 * Reconnect semantics: native `EventSource` retries automatically on
 * network drop. We layer one extra concern on top — when the underlying
 * source emits an `error` AND the iterator is still active (consumer has
 * not called `return()`), we transparently reopen the connection. This
 * keeps the consumer's loop fed across transient failures without
 * surfacing a thrown error every time.
 *
 * The yielded items are the parsed JSON of each `data:` line. Lines that
 * fail JSON parsing call `onParseError` (default: silent) and are
 * skipped.
 */

import type { DataBinding, DataResolver } from '../types.js';

/** Subset of the WHATWG EventSource interface we depend on. */
export interface EventSourceLike {
  readonly readyState: number;
  onmessage: ((ev: { data: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onopen: ((ev: unknown) => void) | null;
  close(): void;
}

export type EventSourceCtor = new (url: string) => EventSourceLike;

export interface SseSubscriptionResolverOptions {
  /**
   * Map a binding to its SSE endpoint URL. Return `undefined` to opt the
   * binding out of streaming (the iterator factory will return
   * `undefined`).
   */
  urlFor: (binding: DataBinding) => string | undefined;
  /**
   * EventSource constructor. Defaults to `globalThis.EventSource` if
   * present. Required when running outside the browser (Node / SSR).
   */
  EventSourceImpl?: EventSourceCtor;
  /**
   * Optional snapshot for the `resolve(binding)` path. Defaults to
   * returning `undefined` (the React walker shows empty state until the
   * stream produces its first item).
   */
  snapshot?: (binding: DataBinding) => unknown;
  /**
   * Hook for malformed JSON payloads. Default: silent. Exposed for
   * observability — most production hosts log to their telemetry sink.
   */
  onParseError?: (raw: string, err: unknown) => void;
  /**
   * If `true` (default), the iterator transparently reconnects when the
   * underlying EventSource emits an `error` event. Set to `false` to
   * surface the error as a thrown value (consumer's `for await ... of`
   * loop will see the throw).
   */
  reconnect?: boolean;
}

/** Internal: shared async-iterable plumbing for one open connection. */
function makeIterable(
  url: string,
  Ctor: EventSourceCtor,
  opts: { onParseError?: (raw: string, err: unknown) => void; reconnect: boolean },
): AsyncIterable<unknown> & { close: () => void } {
  // The pull/push queue: producers (EventSource callbacks) push values or
  // errors; consumers (the `for await` loop) pull via `next()`. We keep
  // two queues so a slow consumer doesn't drop messages and a fast
  // consumer doesn't busy-loop on an empty queue.
  type QueueItem = { kind: 'value'; value: unknown } | { kind: 'error'; err: unknown };
  const buffered: QueueItem[] = [];
  const waiters: ((res: IteratorResult<unknown>) => void)[] = [];
  let done = false;
  let es: EventSourceLike | null = null;

  const attach = (source: EventSourceLike): void => {
    source.onmessage = (ev: { data: string }): void => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(ev.data);
      } catch (err) {
        opts.onParseError?.(ev.data, err);
        return;
      }
      const w = waiters.shift();
      if (w) {
        w({ value: parsed, done: false });
      } else {
        buffered.push({ kind: 'value', value: parsed });
      }
    };
    source.onerror = (err: unknown): void => {
      if (opts.reconnect && !done) {
        // Transparent reconnect — close the dead source and open a fresh
        // one. Native EventSource also auto-retries, but we re-create
        // explicitly so the iterator state stays consistent across
        // implementations (some test fakes don't retry on their own).
        try {
          source.close();
        } catch {
          /* ignore */
        }
        if (es === source) es = null;
        if (!done) {
          es = new Ctor(url);
          attach(es);
        }
        return;
      }
      // Surface the error to the consumer.
      buffered.push({ kind: 'error', err });
      const w = waiters.shift();
      if (w) {
        w({ value: undefined, done: true });
      }
    };
    source.onopen = null;
  };

  es = new Ctor(url);
  attach(es);

  const iterable: AsyncIterable<unknown> & { close: () => void } = {
    close(): void {
      done = true;
      try {
        es?.close();
      } catch {
        /* ignore */
      }
      es = null;
      // Drain waiters with done=true.
      while (waiters.length > 0) {
        const w = waiters.shift()!;
        w({ value: undefined, done: true });
      }
    },
    [Symbol.asyncIterator](): AsyncIterator<unknown> {
      return {
        next(): Promise<IteratorResult<unknown>> {
          if (done) return Promise.resolve({ value: undefined, done: true });
          const item = buffered.shift();
          if (item) {
            if (item.kind === 'error') {
              const err = item.err instanceof Error ? item.err : new Error(String(item.err));
              return Promise.reject(err);
            }
            return Promise.resolve({ value: item.value, done: false });
          }
          return new Promise<IteratorResult<unknown>>((resolve) => {
            waiters.push(resolve);
          });
        },
        return(): Promise<IteratorResult<unknown>> {
          iterable.close();
          return Promise.resolve({ value: undefined, done: true });
        },
      };
    },
  };

  return iterable;
}

/**
 * Build an SSE subscription resolver. Returns the function-form
 * `DataResolver` with `.subscribe` attached so it satisfies the protocol
 * directly.
 *
 * @example
 *   const resolver = createSseSubscriptionResolver({
 *     urlFor: (b) =>
 *       b.source === 'presence.users'
 *         ? `/api/presence/${b.filter ?? 'global'}/stream`
 *         : undefined,
 *   });
 */
export function createSseSubscriptionResolver(
  options: SseSubscriptionResolverOptions,
): DataResolver {
  const Ctor =
    options.EventSourceImpl ??
    (typeof globalThis !== 'undefined' &&
    'EventSource' in globalThis &&
    typeof (globalThis as { EventSource?: unknown }).EventSource === 'function'
      ? (globalThis as unknown as { EventSource: EventSourceCtor }).EventSource
      : undefined);
  const reconnect = options.reconnect ?? true;
  const onParseError = options.onParseError;
  const snapshot = options.snapshot;

  const resolver: DataResolver = (binding: DataBinding): unknown => {
    return snapshot ? snapshot(binding) : undefined;
  };
  resolver.subscribe = (binding: DataBinding): AsyncIterable<unknown> | undefined => {
    const url = options.urlFor(binding);
    if (url === undefined) return undefined;
    if (!Ctor) {
      throw new Error(
        'SseSubscriptionResolver: no EventSource available. In Node, pass EventSourceImpl explicitly.',
      );
    }
    return makeIterable(url, Ctor, { reconnect, ...(onParseError ? { onParseError } : {}) });
  };
  return resolver;
}

/**
 * Class form of {@link createSseSubscriptionResolver}, matching the other
 * resolvers in this package.
 */
export class SseSubscriptionResolver {
  readonly #options: SseSubscriptionResolverOptions;
  readonly #Ctor: EventSourceCtor | undefined;

  constructor(options: SseSubscriptionResolverOptions) {
    this.#options = options;
    this.#Ctor =
      options.EventSourceImpl ??
      (typeof globalThis !== 'undefined' &&
      'EventSource' in globalThis &&
      typeof (globalThis as { EventSource?: unknown }).EventSource === 'function'
        ? (globalThis as unknown as { EventSource: EventSourceCtor }).EventSource
        : undefined);
  }

  resolve = (binding: DataBinding): unknown => {
    return this.#options.snapshot ? this.#options.snapshot(binding) : undefined;
  };

  subscribe = (binding: DataBinding): AsyncIterable<unknown> | undefined => {
    const url = this.#options.urlFor(binding);
    if (url === undefined) return undefined;
    if (!this.#Ctor) {
      throw new Error(
        'SseSubscriptionResolver: no EventSource available. In Node, pass EventSourceImpl explicitly.',
      );
    }
    const reconnect = this.#options.reconnect ?? true;
    const onParseError = this.#options.onParseError;
    return makeIterable(url, this.#Ctor, {
      reconnect,
      ...(onParseError ? { onParseError } : {}),
    });
  };
}

/**
 * Helper for hosts that need to plumb an `AsyncIterable` into a
 * non-generator consumer (most React callers want a callback per item +
 * a cleanup function). Subscribes to the iterable in the background and
 * routes events to `onItem` / `onError` / `onComplete`. Returns a
 * cleanup function — call it to stop iteration (this calls the
 * iterator's `return()` which closes the underlying EventSource).
 *
 * Errors from the iterator are routed to `onError` and terminate the
 * subscription. The cleanup function is safe to call after completion or
 * error (it's idempotent).
 */
export type CleanupFn = () => void;

export interface ConsumeSubscriptionOptions<T = unknown> {
  onItem: (item: T) => void;
  onError?: (err: unknown) => void;
  onComplete?: () => void;
}

export function consumeSubscription<T = unknown>(
  iterable: AsyncIterable<T>,
  opts: ConsumeSubscriptionOptions<T>,
): CleanupFn {
  let cancelled = false;
  const iterator = iterable[Symbol.asyncIterator]();

  const pump = async (): Promise<void> => {
    try {
      while (!cancelled) {
        const result = await iterator.next();
        if (cancelled) break;
        if (result.done) {
          opts.onComplete?.();
          return;
        }
        opts.onItem(result.value);
      }
    } catch (err) {
      if (cancelled) return;
      opts.onError?.(err);
    }
  };
  void pump();

  return (): void => {
    if (cancelled) return;
    cancelled = true;
    // Best-effort: signal the iterator to clean up. Many implementations
    // (including ours) close the underlying transport here.
    try {
      void iterator.return?.();
    } catch {
      /* ignore */
    }
  };
}
