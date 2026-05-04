// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Unit tests for `SseTriggerTransport` — fakes the underlying `fetch` and
 * `EventSource` so we can drive every branch of the transport without
 * spawning an HTTP server. Pairs with the existing integration test
 * (`sse.test.ts`); together they cover the public surface end-to-end.
 *
 * Branches exercised here that the integration test doesn't reach:
 *   - publish() throws when no fetch is available
 *   - publish() rejects on HTTP non-2xx and fires onPublishError
 *   - publish() rejects on fetch throwing and fires onPublishError
 *   - subscribe() throws when no EventSource is available
 *   - onParseError fires for invalid JSON, missing trigger payload,
 *     and non-object frames
 *   - onOpen / onError fire as expected
 *   - close() is idempotent and stops further publishes / subscribes
 */

import type { Trigger } from '@atelier/schemas';
import { describe, expect, it, vi } from 'vitest';
import {
  SseTriggerTransport,
  type EventSourceLike,
} from '../../src/transports/sse-trigger-transport.js';

const SAMPLE: Trigger = {
  type: 'capability.changed',
  app_id: 'mail.example.com',
  capability_id: 'thread.archive',
  old_v: '1.0.0',
  new_v: '2.0.0',
};

interface FakeEventSource extends EventSourceLike {
  fireMessage: (data: string, eventType?: 'message' | 'trigger') => void;
  fireOpen: () => void;
  fireError: (err: unknown) => void;
  closed: boolean;
}

function makeFakeEventSourceCtor(): {
  ctor: new (url: string) => FakeEventSource;
  instances: FakeEventSource[];
} {
  const instances: FakeEventSource[] = [];
  class Fake implements FakeEventSource {
    readyState = 1;
    onmessage: ((ev: { data: string }) => void) | null = null;
    onerror: ((ev: unknown) => void) | null = null;
    onopen: ((ev: unknown) => void) | null = null;
    closed = false;
    #namedListeners = new Map<string, Array<(ev: { data: string }) => void>>();
    constructor(public url: string) {
      instances.push(this);
    }
    addEventListener(type: string, listener: (ev: { data: string }) => void): void {
      const list = this.#namedListeners.get(type) ?? [];
      list.push(listener);
      this.#namedListeners.set(type, list);
    }
    close(): void {
      this.closed = true;
      this.readyState = 2;
    }
    fireOpen(): void {
      this.onopen?.({});
    }
    fireError(err: unknown): void {
      this.onerror?.(err);
    }
    fireMessage(data: string, eventType: 'message' | 'trigger' = 'message'): void {
      const ev = { data };
      if (eventType === 'message') this.onmessage?.(ev);
      else {
        const listeners = this.#namedListeners.get(eventType) ?? [];
        for (const fn of listeners) fn(ev);
      }
    }
  }
  return { ctor: Fake, instances };
}

describe('SseTriggerTransport — publish branches', () => {
  it('throws when no fetch is available', async () => {
    const onPublishError = vi.fn();
    // Stash the global fetch and remove it.
    const realFetch = (globalThis as { fetch?: unknown }).fetch;
    delete (globalThis as { fetch?: unknown }).fetch;
    try {
      const t = new SseTriggerTransport({
        endpoint: 'http://x',
        EventSourceImpl: makeFakeEventSourceCtor().ctor,
        onPublishError,
      });
      await expect(t.publish(SAMPLE, 'node-1')).rejects.toThrow(/no fetch available/);
      expect(onPublishError).toHaveBeenCalledTimes(1);
    } finally {
      if (realFetch !== undefined) (globalThis as { fetch?: unknown }).fetch = realFetch;
    }
  });

  it('POSTs the envelope to /triggers/publish and resolves on 2xx', async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(''),
      }),
    );
    const t = new SseTriggerTransport({
      endpoint: 'http://x/',
      EventSourceImpl: makeFakeEventSourceCtor().ctor,
      fetch: fetchSpy,
    });
    await t.publish(SAMPLE, 'node-1');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(t.endpoint).toBe('http://x'); // trailing-slash normalised
    const args = fetchSpy.mock.calls[0]!;
    expect(args[0]).toBe('http://x/triggers/publish');
    const init = args[1] as { method: string; body: string; headers: Record<string, string> };
    expect(init.method).toBe('POST');
    expect(init.headers['content-type']).toBe('application/json');
    expect(JSON.parse(init.body)).toMatchObject({ origin_node_id: 'node-1', trigger: SAMPLE });
  });

  it('rejects on non-2xx and fires onPublishError', async () => {
    const onPublishError = vi.fn();
    const fetchSpy = vi.fn(() =>
      Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve('') }),
    );
    const t = new SseTriggerTransport({
      endpoint: 'http://x',
      EventSourceImpl: makeFakeEventSourceCtor().ctor,
      fetch: fetchSpy,
      onPublishError,
    });
    await expect(t.publish(SAMPLE, 'node-1')).rejects.toThrow(/status 500/);
    expect(onPublishError).toHaveBeenCalledTimes(1);
  });

  it('rejects + fires onPublishError when fetch itself throws', async () => {
    const onPublishError = vi.fn();
    const fetchSpy = vi.fn(() => Promise.reject(new Error('network down')));
    const t = new SseTriggerTransport({
      endpoint: 'http://x',
      EventSourceImpl: makeFakeEventSourceCtor().ctor,
      fetch: fetchSpy,
      onPublishError,
    });
    await expect(t.publish(SAMPLE, 'node-1')).rejects.toThrow(/network down/);
    expect(onPublishError).toHaveBeenCalledTimes(1);
  });

  it('publish() is a no-op after close()', async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('') }),
    );
    const t = new SseTriggerTransport({
      endpoint: 'http://x',
      EventSourceImpl: makeFakeEventSourceCtor().ctor,
      fetch: fetchSpy,
    });
    await t.close();
    await t.publish(SAMPLE, 'node-1');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('SseTriggerTransport — subscribe branches', () => {
  it('throws when no EventSource is available', () => {
    const realES = (globalThis as { EventSource?: unknown }).EventSource;
    delete (globalThis as { EventSource?: unknown }).EventSource;
    try {
      const t = new SseTriggerTransport({
        endpoint: 'http://x',
        fetch: vi.fn(),
      });
      expect(() => t.subscribe(() => undefined)).toThrow(/no EventSource available/);
    } finally {
      if (realES !== undefined) (globalThis as { EventSource?: unknown }).EventSource = realES;
    }
  });

  it('opens the SSE stream on first subscribe and fires onOpen', () => {
    const { ctor, instances } = makeFakeEventSourceCtor();
    const onOpen = vi.fn();
    const t = new SseTriggerTransport({
      endpoint: 'http://x',
      EventSourceImpl: ctor,
      fetch: vi.fn(),
      onOpen,
    });
    t.subscribe(() => undefined);
    expect(instances.length).toBe(1);
    instances[0]?.fireOpen();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('routes onerror to the onError hook', () => {
    const { ctor, instances } = makeFakeEventSourceCtor();
    const onError = vi.fn();
    const t = new SseTriggerTransport({
      endpoint: 'http://x',
      EventSourceImpl: ctor,
      fetch: vi.fn(),
      onError,
    });
    t.subscribe(() => undefined);
    instances[0]?.fireError(new Error('connection drop'));
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('fires onParseError for non-JSON frames', () => {
    const { ctor, instances } = makeFakeEventSourceCtor();
    const onParseError = vi.fn();
    const t = new SseTriggerTransport({
      endpoint: 'http://x',
      EventSourceImpl: ctor,
      fetch: vi.fn(),
      onParseError,
    });
    t.subscribe(() => undefined);
    instances[0]?.fireMessage('not-json');
    expect(onParseError).toHaveBeenCalledTimes(1);
    expect(onParseError.mock.calls[0]?.[0]).toBe('not-json');
  });

  it('fires onParseError when JSON is not an object', () => {
    const { ctor, instances } = makeFakeEventSourceCtor();
    const onParseError = vi.fn();
    const t = new SseTriggerTransport({
      endpoint: 'http://x',
      EventSourceImpl: ctor,
      fetch: vi.fn(),
      onParseError,
    });
    t.subscribe(() => undefined);
    instances[0]?.fireMessage('null');
    expect(onParseError).toHaveBeenCalledTimes(1);
  });

  it('fires onParseError when the envelope has no trigger payload', () => {
    const { ctor, instances } = makeFakeEventSourceCtor();
    const onParseError = vi.fn();
    const t = new SseTriggerTransport({
      endpoint: 'http://x',
      EventSourceImpl: ctor,
      fetch: vi.fn(),
      onParseError,
    });
    t.subscribe(() => undefined);
    instances[0]?.fireMessage(JSON.stringify({ origin_node_id: 'n', trigger: { foo: 1 } }));
    expect(onParseError).toHaveBeenCalledTimes(1);
  });

  it('delivers a well-formed envelope to all handlers with origin meta', () => {
    const { ctor, instances } = makeFakeEventSourceCtor();
    const handler = vi.fn();
    const t = new SseTriggerTransport({
      endpoint: 'http://x',
      EventSourceImpl: ctor,
      fetch: vi.fn(),
    });
    t.subscribe(handler);
    instances[0]?.fireMessage(
      JSON.stringify({ origin_node_id: 'remote-node', trigger: SAMPLE }),
      'trigger',
    );
    expect(handler).toHaveBeenCalledWith(SAMPLE, { originNodeId: 'remote-node' });
  });

  it('handler exceptions do not poison the dispatch loop', () => {
    const { ctor, instances } = makeFakeEventSourceCtor();
    const bad = vi.fn(() => {
      throw new Error('handler boom');
    });
    const good = vi.fn();
    const t = new SseTriggerTransport({
      endpoint: 'http://x',
      EventSourceImpl: ctor,
      fetch: vi.fn(),
    });
    t.subscribe(bad);
    t.subscribe(good);
    instances[0]?.fireMessage(JSON.stringify({ origin_node_id: 'n', trigger: SAMPLE }));
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe drops the handler and closes the stream when empty', () => {
    const { ctor, instances } = makeFakeEventSourceCtor();
    const t = new SseTriggerTransport({
      endpoint: 'http://x',
      EventSourceImpl: ctor,
      fetch: vi.fn(),
    });
    const off = t.subscribe(() => undefined);
    expect(instances[0]?.closed).toBe(false);
    off();
    expect(instances[0]?.closed).toBe(true);
  });

  it('subscribe() after close() returns a no-op unsubscribe', () => {
    const { ctor, instances } = makeFakeEventSourceCtor();
    const t = new SseTriggerTransport({
      endpoint: 'http://x',
      EventSourceImpl: ctor,
      fetch: vi.fn(),
    });
    void t.close();
    const off = t.subscribe(() => undefined);
    expect(instances.length).toBe(0); // no stream was opened
    expect(typeof off).toBe('function');
    expect(() => off()).not.toThrow();
  });

  it('readyState reflects the underlying EventSource', () => {
    const { ctor, instances } = makeFakeEventSourceCtor();
    const t = new SseTriggerTransport({
      endpoint: 'http://x',
      EventSourceImpl: ctor,
      fetch: vi.fn(),
    });
    expect(t.readyState).toBe(2); // CLOSED until subscribed
    t.subscribe(() => undefined);
    expect(t.readyState).toBe(1); // OPEN per the fake
    instances[0]?.close();
    expect(t.readyState).toBe(2);
  });
});

describe('SseTriggerTransport — close() is idempotent', () => {
  it('two close() calls do not throw', async () => {
    const { ctor } = makeFakeEventSourceCtor();
    const t = new SseTriggerTransport({
      endpoint: 'http://x',
      EventSourceImpl: ctor,
      fetch: vi.fn(),
    });
    await t.close();
    await expect(t.close()).resolves.toBeUndefined();
  });
});
