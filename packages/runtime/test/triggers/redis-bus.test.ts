// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { describe, expect, it, vi } from 'vitest';
import type { Trigger } from '@atelier/schemas';
import {
  REDIS_TRIGGER_ENVELOPE_VERSION,
  RedisTriggerBus,
  type RedisLikePublisher,
  type RedisLikeSubscriber,
  type RedisTriggerEnvelope,
} from '../../src/triggers/redis-bus.js';

const SCHEMA_TRIGGER: Trigger = {
  type: 'capability.changed',
  app_id: 'mail.example.com',
  capability_id: 'thread.archive',
  old_v: '2.0.0',
  new_v: '2.1.0',
};

/**
 * In-memory fake mirroring the slice of the Redis pub/sub API we depend on.
 * One `Hub` is shared across publisher + subscriber pairs so we can simulate
 * multiple processes attached to the same channel.
 */
class FakeHub {
  readonly listeners = new Map<string, Set<(channel: string, message: string) => void>>();
  publish(channel: string, message: string): number {
    const set = this.listeners.get(channel);
    if (!set) return 0;
    let n = 0;
    for (const fn of set) {
      n += 1;
      // Fan out asynchronously, like real Redis.
      queueMicrotask(() => fn(channel, message));
    }
    return n;
  }
}

class FakePublisher implements RedisLikePublisher {
  publishes: Array<{ channel: string; message: string }> = [];
  constructor(private readonly hub: FakeHub) {}
  publish(channel: string, message: string): Promise<number> {
    this.publishes.push({ channel, message });
    return Promise.resolve(this.hub.publish(channel, message));
  }
}

class FakeSubscriber implements RedisLikeSubscriber {
  readonly listeners = new Set<(channel: string, message: string) => void>();
  subscribed: string[] = [];
  unsubscribed: string[] = [];
  constructor(private readonly hub: FakeHub) {}
  subscribe(channel: string): Promise<void> {
    this.subscribed.push(channel);
    let bucket = this.hub.listeners.get(channel);
    if (!bucket) {
      bucket = new Set();
      this.hub.listeners.set(channel, bucket);
    }
    for (const fn of this.listeners) bucket.add(fn);
    return Promise.resolve();
  }
  unsubscribe(channel: string): Promise<void> {
    this.unsubscribed.push(channel);
    const bucket = this.hub.listeners.get(channel);
    if (bucket) {
      for (const fn of this.listeners) bucket.delete(fn);
    }
    return Promise.resolve();
  }
  on(_event: 'message', listener: (channel: string, message: string) => void): unknown {
    this.listeners.add(listener);
    // If we already subscribed, register against the hub now.
    for (const channel of this.subscribed) {
      let bucket = this.hub.listeners.get(channel);
      if (!bucket) {
        bucket = new Set();
        this.hub.listeners.set(channel, bucket);
      }
      bucket.add(listener);
    }
    return this;
  }
  off(_event: 'message', listener: (channel: string, message: string) => void): unknown {
    this.listeners.delete(listener);
    for (const channel of this.subscribed) {
      this.hub.listeners.get(channel)?.delete(listener);
    }
    return this;
  }
}

async function flush(): Promise<void> {
  // Two awaits: one for the queueMicrotask that simulates Redis fan-out,
  // one for the awaited local emit inside the bus.
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('RedisTriggerBus', () => {
  it('publishes a v1 envelope on emit', async () => {
    const hub = new FakeHub();
    const publisher = new FakePublisher(hub);
    const subscriber = new FakeSubscriber(hub);
    const bus = new RedisTriggerBus({
      publisher,
      subscriber,
      appId: 'mail.example.com',
      originId: 'origin-A',
    });
    await bus.start();
    await bus.emit(SCHEMA_TRIGGER);
    expect(publisher.publishes).toHaveLength(1);
    expect(publisher.publishes[0]!.channel).toBe('atelier:triggers:mail.example.com');
    const env = JSON.parse(publisher.publishes[0]!.message) as RedisTriggerEnvelope;
    expect(env.v).toBe(REDIS_TRIGGER_ENVELOPE_VERSION);
    expect(env.origin).toBe('origin-A');
    expect(env.trigger).toEqual(SCHEMA_TRIGGER);
  });

  it('routes inbound messages from another instance to local listeners', async () => {
    const hub = new FakeHub();
    const pubA = new FakePublisher(hub);
    const subA = new FakeSubscriber(hub);
    const pubB = new FakePublisher(hub);
    const subB = new FakeSubscriber(hub);

    const busA = new RedisTriggerBus({
      publisher: pubA,
      subscriber: subA,
      appId: 'mail.example.com',
      originId: 'origin-A',
    });
    const busB = new RedisTriggerBus({
      publisher: pubB,
      subscriber: subB,
      appId: 'mail.example.com',
      originId: 'origin-B',
    });
    await busA.start();
    await busB.start();

    const handlerB = vi.fn();
    busB.subscribe('*', handlerB);

    await busA.emit(SCHEMA_TRIGGER);
    await flush();

    expect(handlerB).toHaveBeenCalledWith(SCHEMA_TRIGGER);
    expect(handlerB).toHaveBeenCalledTimes(1);
  });

  it('drops self-echoes via origin so emitter handlers fire exactly once', async () => {
    const hub = new FakeHub();
    const publisher = new FakePublisher(hub);
    const subscriber = new FakeSubscriber(hub);
    const bus = new RedisTriggerBus({
      publisher,
      subscriber,
      appId: 'mail.example.com',
      originId: 'origin-A',
    });
    await bus.start();
    const handler = vi.fn();
    bus.subscribe('*', handler);
    await bus.emit(SCHEMA_TRIGGER);
    await flush();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('fans out to multiple subscribers on the same channel', async () => {
    const hub = new FakeHub();
    const pubA = new FakePublisher(hub);
    const subA = new FakeSubscriber(hub);
    const pubB = new FakePublisher(hub);
    const subB = new FakeSubscriber(hub);
    const pubC = new FakePublisher(hub);
    const subC = new FakeSubscriber(hub);
    const busA = new RedisTriggerBus({
      publisher: pubA,
      subscriber: subA,
      appId: 'app',
      originId: 'A',
    });
    const busB = new RedisTriggerBus({
      publisher: pubB,
      subscriber: subB,
      appId: 'app',
      originId: 'B',
    });
    const busC = new RedisTriggerBus({
      publisher: pubC,
      subscriber: subC,
      appId: 'app',
      originId: 'C',
    });
    await Promise.all([busA.start(), busB.start(), busC.start()]);
    const hB = vi.fn();
    const hC = vi.fn();
    busB.subscribe('*', hB);
    busC.subscribe('*', hC);
    await busA.emit(SCHEMA_TRIGGER);
    await flush();
    expect(hB).toHaveBeenCalledTimes(1);
    expect(hC).toHaveBeenCalledTimes(1);
  });

  it('routes typed subscribers correctly', async () => {
    const hub = new FakeHub();
    const pubA = new FakePublisher(hub);
    const subA = new FakeSubscriber(hub);
    const pubB = new FakePublisher(hub);
    const subB = new FakeSubscriber(hub);
    const busA = new RedisTriggerBus({
      publisher: pubA,
      subscriber: subA,
      appId: 'app',
      originId: 'A',
    });
    const busB = new RedisTriggerBus({
      publisher: pubB,
      subscriber: subB,
      appId: 'app',
      originId: 'B',
    });
    await busA.start();
    await busB.start();
    const matched = vi.fn();
    const ignored = vi.fn();
    busB.subscribe('capability.changed', matched);
    busB.subscribe('capability.added', ignored);
    await busA.emit(SCHEMA_TRIGGER);
    await flush();
    expect(matched).toHaveBeenCalledWith(SCHEMA_TRIGGER);
    expect(ignored).not.toHaveBeenCalled();
  });

  it('honors a custom channel prefix', () => {
    const hub = new FakeHub();
    const bus = new RedisTriggerBus({
      publisher: new FakePublisher(hub),
      subscriber: new FakeSubscriber(hub),
      appId: 'mail',
      channelPrefix: 'cir',
    });
    expect(bus.channel).toBe('cir:triggers:mail');
  });

  it('reports parse errors via onParseError', async () => {
    const hub = new FakeHub();
    const subscriber = new FakeSubscriber(hub);
    const onParseError = vi.fn();
    const bus = new RedisTriggerBus({
      publisher: new FakePublisher(hub),
      subscriber,
      appId: 'app',
      originId: 'A',
      onParseError,
    });
    await bus.start();
    // Inject a malformed message directly through the hub.
    hub.publish('atelier:triggers:app', 'not json{');
    await flush();
    expect(onParseError).toHaveBeenCalledTimes(1);
    expect(onParseError.mock.calls[0]![0]).toBe('not json{');
  });

  it('drops envelopes with the wrong version', async () => {
    const hub = new FakeHub();
    const subscriber = new FakeSubscriber(hub);
    const onParseError = vi.fn();
    const bus = new RedisTriggerBus({
      publisher: new FakePublisher(hub),
      subscriber,
      appId: 'app',
      originId: 'A',
      onParseError,
    });
    await bus.start();
    const handler = vi.fn();
    bus.subscribe('*', handler);
    hub.publish(
      'atelier:triggers:app',
      JSON.stringify({ v: 999, origin: 'X', trigger: SCHEMA_TRIGGER }),
    );
    await flush();
    expect(handler).not.toHaveBeenCalled();
    expect(onParseError).toHaveBeenCalledTimes(1);
  });

  it('drops envelopes missing a string trigger.type', async () => {
    const hub = new FakeHub();
    const subscriber = new FakeSubscriber(hub);
    const onParseError = vi.fn();
    const bus = new RedisTriggerBus({
      publisher: new FakePublisher(hub),
      subscriber,
      appId: 'app',
      originId: 'A',
      onParseError,
    });
    await bus.start();
    const handler = vi.fn();
    bus.subscribe('*', handler);
    hub.publish(
      'atelier:triggers:app',
      JSON.stringify({ v: 1, origin: 'X', trigger: { no_type: true } }),
    );
    await flush();
    expect(handler).not.toHaveBeenCalled();
    expect(onParseError).toHaveBeenCalledTimes(1);
  });

  it('emits to local listeners even before start()', async () => {
    const hub = new FakeHub();
    const publisher = new FakePublisher(hub);
    const subscriber = new FakeSubscriber(hub);
    const bus = new RedisTriggerBus({ publisher, subscriber, appId: 'app', originId: 'A' });
    const handler = vi.fn();
    bus.subscribe('*', handler);
    await bus.emit(SCHEMA_TRIGGER);
    expect(handler).toHaveBeenCalledTimes(1);
    // Publish still happens (other processes may already be subscribed).
    expect(publisher.publishes).toHaveLength(1);
  });

  it('start() is idempotent', async () => {
    const hub = new FakeHub();
    const subscriber = new FakeSubscriber(hub);
    const bus = new RedisTriggerBus({
      publisher: new FakePublisher(hub),
      subscriber,
      appId: 'app',
    });
    await bus.start();
    await bus.start();
    await bus.start();
    expect(subscriber.subscribed).toEqual(['atelier:triggers:app']);
  });

  it('close() unsubscribes and makes emit a no-op', async () => {
    const hub = new FakeHub();
    const publisher = new FakePublisher(hub);
    const subscriber = new FakeSubscriber(hub);
    const bus = new RedisTriggerBus({
      publisher,
      subscriber,
      appId: 'app',
      originId: 'A',
    });
    await bus.start();
    await bus.close();
    await bus.close(); // idempotent
    expect(subscriber.unsubscribed).toEqual(['atelier:triggers:app']);
    await bus.emit(SCHEMA_TRIGGER);
    expect(publisher.publishes).toHaveLength(0);
  });

  it('routes handler errors through onError without poisoning the bus', async () => {
    const hub = new FakeHub();
    const onError = vi.fn();
    const bus = new RedisTriggerBus({
      publisher: new FakePublisher(hub),
      subscriber: new FakeSubscriber(hub),
      appId: 'app',
      originId: 'A',
      onError,
    });
    await bus.start();
    const survived = vi.fn();
    bus.subscribe('capability.changed', () => {
      throw new Error('boom');
    });
    bus.subscribe('capability.changed', survived);
    await bus.emit(SCHEMA_TRIGGER);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(survived).toHaveBeenCalledTimes(1);
  });

  it('exposes channel + originId metadata', () => {
    const hub = new FakeHub();
    const bus = new RedisTriggerBus({
      publisher: new FakePublisher(hub),
      subscriber: new FakeSubscriber(hub),
      appId: 'mail.example.com',
      originId: 'origin-Z',
    });
    expect(bus.channel).toBe('atelier:triggers:mail.example.com');
    expect(bus.originId).toBe('origin-Z');
    expect(bus.appId).toBe('mail.example.com');
  });
});
