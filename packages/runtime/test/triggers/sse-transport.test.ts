// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
import { describe, expect, it, vi } from 'vitest';
import { InMemoryTriggerBus } from '../../src/triggers/memory-bus.ts';
import {
  SseTriggerTransport,
  type EventSourceCtor,
  type EventSourceLike,
} from '../../src/triggers/sse-transport.ts';
import type { Trigger } from '@cir/schemas';

class FakeEventSource implements EventSourceLike {
  static instances: FakeEventSource[] = [];
  readyState = 0; // CONNECTING
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onopen: ((ev: unknown) => void) | null = null;
  closed = false;
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  open(): void {
    this.readyState = 1;
    this.onopen?.({});
  }
  message(data: string): void {
    this.onmessage?.({ data });
  }
  error(err: unknown): void {
    this.onerror?.(err);
  }
  close(): void {
    this.closed = true;
    this.readyState = 2;
  }
}

const FakeEventSourceCtor = FakeEventSource as unknown as EventSourceCtor;

describe('SseTriggerTransport', () => {
  it('forwards parsed triggers to the bus', async () => {
    FakeEventSource.instances = [];
    const bus = new InMemoryTriggerBus();
    const handler = vi.fn();
    bus.subscribe('*', handler);

    const transport = new SseTriggerTransport({
      url: '/api/triggers/stream',
      bus,
      EventSourceImpl: FakeEventSourceCtor,
    });
    transport.connect();
    expect(FakeEventSource.instances).toHaveLength(1);
    const es = FakeEventSource.instances[0]!;
    es.open();

    const trigger: Trigger = {
      type: 'capability.schema_changed',
      app_id: 'mail.example.com',
      capability_id: 'thread.archive',
      old_v: '1.0.0',
      new_v: '2.0.0',
    };
    es.message(JSON.stringify(trigger));

    // Allow the awaited emit to settle.
    await Promise.resolve();
    await Promise.resolve();
    expect(handler).toHaveBeenCalledWith(trigger);
  });

  it('reports parse errors via onParseError', () => {
    FakeEventSource.instances = [];
    const bus = new InMemoryTriggerBus();
    const onParseError = vi.fn();
    const transport = new SseTriggerTransport({
      url: '/api/triggers/stream',
      bus,
      EventSourceImpl: FakeEventSourceCtor,
      onParseError,
    });
    transport.connect();
    const es = FakeEventSource.instances[0]!;
    es.message('not-json{');
    expect(onParseError).toHaveBeenCalledTimes(1);
    expect(onParseError.mock.calls[0]![0]).toBe('not-json{');
  });

  it('drops payloads without a string `type` field', () => {
    FakeEventSource.instances = [];
    const bus = new InMemoryTriggerBus();
    const handler = vi.fn();
    bus.subscribe('*', handler);
    const onParseError = vi.fn();
    const transport = new SseTriggerTransport({
      url: '/api/triggers/stream',
      bus,
      EventSourceImpl: FakeEventSourceCtor,
      onParseError,
    });
    transport.connect();
    const es = FakeEventSource.instances[0]!;
    es.message(JSON.stringify({ no_type: true }));
    expect(handler).not.toHaveBeenCalled();
    expect(onParseError).toHaveBeenCalledTimes(1);
  });

  it('connect() is idempotent', () => {
    FakeEventSource.instances = [];
    const bus = new InMemoryTriggerBus();
    const transport = new SseTriggerTransport({
      url: '/api/triggers/stream',
      bus,
      EventSourceImpl: FakeEventSourceCtor,
    });
    transport.connect();
    transport.connect();
    transport.connect();
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it('close() closes the underlying EventSource and prevents reconnect', () => {
    FakeEventSource.instances = [];
    const bus = new InMemoryTriggerBus();
    const transport = new SseTriggerTransport({
      url: '/api/triggers/stream',
      bus,
      EventSourceImpl: FakeEventSourceCtor,
    });
    transport.connect();
    const es = FakeEventSource.instances[0]!;
    transport.close();
    expect(es.closed).toBe(true);
    // Another connect() after close should not reopen.
    transport.connect();
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it('throws when no EventSource impl is available', () => {
    const bus = new InMemoryTriggerBus();
    const transport = new SseTriggerTransport({
      url: '/api/triggers/stream',
      bus,
      // no EventSourceImpl, and the global is undefined under Node test env
    });
    expect(() => transport.connect()).toThrow(/no EventSource available/);
  });

  it('reports onOpen and onError', () => {
    FakeEventSource.instances = [];
    const bus = new InMemoryTriggerBus();
    const onOpen = vi.fn();
    const onError = vi.fn();
    const transport = new SseTriggerTransport({
      url: '/api/triggers/stream',
      bus,
      EventSourceImpl: FakeEventSourceCtor,
      onOpen,
      onError,
    });
    transport.connect();
    const es = FakeEventSource.instances[0]!;
    es.open();
    es.error(new Error('boom'));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
