// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for `SseSubscriptionResolver` + `consumeSubscription` (Wave 10 / S-3).
 *
 * Covers:
 *  - parsed JSON messages flow through the iterator
 *  - reconnect on transport error (default behaviour)
 *  - reconnect: false surfaces the error to the consumer
 *  - urlFor returning undefined opts the binding out of streaming
 *  - parse-error callback is invoked for malformed payloads
 *  - consumeSubscription routes items to a callback and the cleanup
 *    function closes the underlying source
 *  - missing EventSourceImpl in Node throws a helpful message
 */

import { describe, expect, it, vi } from 'vitest';
import {
  consumeSubscription,
  createSseSubscriptionResolver,
  SseSubscriptionResolver,
  type EventSourceCtor,
  type EventSourceLike,
} from '../../src/subscriptions/sse.js';

class FakeEventSource implements EventSourceLike {
  static instances: FakeEventSource[] = [];
  static reset(): void {
    FakeEventSource.instances = [];
  }
  readyState = 0;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onopen: ((ev: unknown) => void) | null = null;
  closed = false;
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  message(data: string): void {
    this.onmessage?.({ data });
  }
  error(err: unknown = new Error('boom')): void {
    this.onerror?.(err);
  }
  close(): void {
    this.closed = true;
    this.readyState = 2;
  }
}

const FakeCtor = FakeEventSource as unknown as EventSourceCtor;

/** Hand-rolled async iterable so eslint doesn't trip on `async function*`
 * with no internal `await`. */
function asyncFrom<T>(items: T[]): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator](): AsyncIterator<T> {
      let i = 0;
      return {
        next(): Promise<IteratorResult<T>> {
          if (i >= items.length) return Promise.resolve({ value: undefined, done: true });
          return Promise.resolve({ value: items[i++]!, done: false });
        },
      };
    },
  };
}

/** Hand-rolled async iterable that throws after yielding `okItems`. */
function asyncFromThenThrow<T>(okItems: T[], err: Error): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator](): AsyncIterator<T> {
      let i = 0;
      return {
        next(): Promise<IteratorResult<T>> {
          if (i < okItems.length) return Promise.resolve({ value: okItems[i++]!, done: false });
          return Promise.reject(err);
        },
      };
    },
  };
}

describe('createSseSubscriptionResolver', () => {
  it('parses JSON messages and yields them to the iterator', async () => {
    FakeEventSource.reset();
    const resolver = createSseSubscriptionResolver({
      urlFor: () => '/api/stream',
      EventSourceImpl: FakeCtor,
    });
    const stream = resolver.subscribe!({ source: 'presence' });
    expect(stream).toBeDefined();
    const iterator = stream![Symbol.asyncIterator]();

    // Push one message; await `next()` and assert.
    const es = FakeEventSource.instances[0]!;
    const pending = iterator.next();
    es.message(JSON.stringify({ x: 1 }));
    const result = await pending;
    expect(result).toEqual({ value: { x: 1 }, done: false });

    // Calling return() closes the underlying connection.
    await iterator.return!();
    expect(es.closed).toBe(true);
  });

  it('buffers messages received before next() is called', async () => {
    FakeEventSource.reset();
    const resolver = createSseSubscriptionResolver({
      urlFor: () => '/api/stream',
      EventSourceImpl: FakeCtor,
    });
    const stream = resolver.subscribe!({ source: 'presence' });
    const es = FakeEventSource.instances[0]!;
    es.message(JSON.stringify('a'));
    es.message(JSON.stringify('b'));

    const iterator = stream![Symbol.asyncIterator]();
    expect(await iterator.next()).toEqual({ value: 'a', done: false });
    expect(await iterator.next()).toEqual({ value: 'b', done: false });
    await iterator.return!();
  });

  it('reconnects transparently on transport error (default)', async () => {
    FakeEventSource.reset();
    const resolver = createSseSubscriptionResolver({
      urlFor: () => '/api/stream',
      EventSourceImpl: FakeCtor,
    });
    const stream = resolver.subscribe!({ source: 'presence' });
    const es1 = FakeEventSource.instances[0]!;
    es1.error(new Error('flake'));

    // A second EventSource should have been opened.
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(es1.closed).toBe(true);

    const es2 = FakeEventSource.instances[1]!;
    const iterator = stream![Symbol.asyncIterator]();
    const pending = iterator.next();
    es2.message(JSON.stringify({ ok: true }));
    expect(await pending).toEqual({ value: { ok: true }, done: false });
    await iterator.return!();
  });

  it('with reconnect: false, surfaces transport errors to the consumer', async () => {
    FakeEventSource.reset();
    const resolver = createSseSubscriptionResolver({
      urlFor: () => '/api/stream',
      EventSourceImpl: FakeCtor,
      reconnect: false,
    });
    const stream = resolver.subscribe!({ source: 'presence' });
    const es = FakeEventSource.instances[0]!;
    es.error(new Error('hard-fail'));

    const iterator = stream![Symbol.asyncIterator]();
    await expect(iterator.next()).rejects.toThrow('hard-fail');
  });

  it('returns undefined when urlFor opts the binding out', () => {
    FakeEventSource.reset();
    const resolver = createSseSubscriptionResolver({
      urlFor: (b) => (b.source === 'live' ? '/live' : undefined),
      EventSourceImpl: FakeCtor,
    });
    expect(resolver.subscribe!({ source: 'static' })).toBeUndefined();
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it('invokes onParseError for malformed JSON and skips the message', async () => {
    FakeEventSource.reset();
    const onParseError = vi.fn();
    const resolver = createSseSubscriptionResolver({
      urlFor: () => '/api/stream',
      EventSourceImpl: FakeCtor,
      onParseError,
    });
    const stream = resolver.subscribe!({ source: 'x' });
    const es = FakeEventSource.instances[0]!;
    es.message('not-json{');
    expect(onParseError).toHaveBeenCalledTimes(1);
    expect(onParseError.mock.calls[0]![0]).toBe('not-json{');

    // Next valid message still flows.
    const iterator = stream![Symbol.asyncIterator]();
    const pending = iterator.next();
    es.message(JSON.stringify(42));
    expect(await pending).toEqual({ value: 42, done: false });
    await iterator.return!();
  });

  it('throws a helpful error when no EventSource is available', () => {
    const resolver = createSseSubscriptionResolver({
      urlFor: () => '/api/stream',
      // no EventSourceImpl, no globalThis.EventSource in node
    });
    expect(() => resolver.subscribe!({ source: 'x' })).toThrow(/EventSource/);
  });

  it('snapshot path returns the configured value from resolve()', () => {
    FakeEventSource.reset();
    const resolver = createSseSubscriptionResolver({
      urlFor: () => '/api/stream',
      EventSourceImpl: FakeCtor,
      snapshot: (b) => `seed:${b.source}`,
    });
    expect(resolver({ source: 'presence' })).toBe('seed:presence');
  });
});

describe('SseSubscriptionResolver (class form)', () => {
  it('class form opens a connection and yields messages', async () => {
    FakeEventSource.reset();
    const resolver = new SseSubscriptionResolver({
      urlFor: () => '/api/stream',
      EventSourceImpl: FakeCtor,
    });
    const stream = resolver.subscribe({ source: 'x' });
    expect(stream).toBeDefined();
    const es = FakeEventSource.instances[0]!;
    const iterator = stream![Symbol.asyncIterator]();
    const pending = iterator.next();
    es.message(JSON.stringify({ class: true }));
    expect(await pending).toEqual({ value: { class: true }, done: false });
    await iterator.return!();
  });
});

describe('consumeSubscription', () => {
  it('routes items to onItem until the iterable completes', async () => {
    const items: number[] = [];
    let completed = false;
    const cleanup = consumeSubscription<number>(asyncFrom([1, 2, 3]), {
      onItem: (item) => items.push(item),
      onComplete: () => {
        completed = true;
      },
    });
    // Let the pump drain.
    await new Promise((r) => setTimeout(r, 5));
    expect(items).toEqual([1, 2, 3]);
    expect(completed).toBe(true);
    // Cleanup is safe to call after completion.
    cleanup();
  });

  it('cleanup function stops iteration and closes the source', async () => {
    FakeEventSource.reset();
    const resolver = createSseSubscriptionResolver({
      urlFor: () => '/api/stream',
      EventSourceImpl: FakeCtor,
    });
    const stream = resolver.subscribe!({ source: 'x' })!;
    const seen: unknown[] = [];
    const cleanup = consumeSubscription(stream, {
      onItem: (item) => seen.push(item),
    });
    const es = FakeEventSource.instances[0]!;
    es.message(JSON.stringify('first'));
    await new Promise((r) => setTimeout(r, 5));
    expect(seen).toEqual(['first']);

    cleanup();
    // After cleanup, the underlying connection is closed.
    await new Promise((r) => setTimeout(r, 5));
    expect(es.closed).toBe(true);
  });

  it('routes errors from the iterable to onError', async () => {
    const onError = vi.fn();
    consumeSubscription(asyncFromThenThrow([1], new Error('stream-error')), {
      onItem: () => {},
      onError,
    });
    await new Promise((r) => setTimeout(r, 5));
    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0]![0] as Error).message).toBe('stream-error');
  });
});
