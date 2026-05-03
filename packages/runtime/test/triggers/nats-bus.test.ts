// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { describe, expect, it, vi } from 'vitest';
import type { Trigger } from '@atelier/schemas';
import {
  NATS_TRIGGER_ENVELOPE_VERSION,
  NATSTriggerBus,
  type NATSLikeConnection,
  type NATSLikeMessage,
  type NATSLikeSubscription,
  type NATSTriggerEnvelope,
} from '../../src/triggers/nats-bus.js';

const SCHEMA_TRIGGER: Trigger = {
  type: 'capability.changed',
  app_id: 'mail.example.com',
  capability_id: 'thread.archive',
  old_v: '2.0.0',
  new_v: '2.1.0',
};

interface PendingPull {
  resolve: (value: IteratorResult<NATSLikeMessage>) => void;
}

/** A fake NATS subject queue. Backs `subscribe()` for one or more buses. */
class FakeSubject {
  readonly subscribers: FakeSubscription[] = [];
  publish(subject: string, data: string): void {
    for (const sub of this.subscribers) {
      if (sub.cancelled) continue;
      sub.deliver({ subject, data });
    }
  }
}

class FakeSubscription implements NATSLikeSubscription {
  readonly buffer: NATSLikeMessage[] = [];
  readonly pending: PendingPull[] = [];
  cancelled = false;
  constructor(readonly subject: string) {}
  deliver(msg: NATSLikeMessage): void {
    const next = this.pending.shift();
    if (next) {
      next.resolve({ value: msg, done: false });
    } else {
      this.buffer.push(msg);
    }
  }
  unsubscribe(): void {
    if (this.cancelled) return;
    this.cancelled = true;
    while (this.pending.length > 0) {
      const next = this.pending.shift()!;
      next.resolve({ value: undefined, done: true });
    }
  }
  [Symbol.asyncIterator](): AsyncIterator<NATSLikeMessage> {
    return {
      next: (): Promise<IteratorResult<NATSLikeMessage>> => {
        if (this.buffer.length > 0) {
          const value = this.buffer.shift()!;
          return Promise.resolve({ value, done: false });
        }
        if (this.cancelled) {
          return Promise.resolve({
            value: undefined as unknown as NATSLikeMessage,
            done: true,
          });
        }
        return new Promise((resolve) => {
          this.pending.push({ resolve });
        });
      },
      return: (): Promise<IteratorResult<NATSLikeMessage>> => {
        this.unsubscribe();
        return Promise.resolve({
          value: undefined as unknown as NATSLikeMessage,
          done: true,
        });
      },
    };
  }
}

class FakeConnection implements NATSLikeConnection {
  readonly published: Array<{ subject: string; data: string }> = [];
  constructor(private readonly subjects: Map<string, FakeSubject>) {}
  publish(subject: string, data: Uint8Array | string): void {
    const text = typeof data === 'string' ? data : new TextDecoder().decode(data);
    this.published.push({ subject, data: text });
    this.subjects.get(subject)?.publish(subject, text);
  }
  subscribe(subject: string): NATSLikeSubscription {
    let s = this.subjects.get(subject);
    if (!s) {
      s = new FakeSubject();
      this.subjects.set(subject, s);
    }
    const sub = new FakeSubscription(subject);
    s.subscribers.push(sub);
    return sub;
  }
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

describe('NATSTriggerBus', () => {
  it('publishes a v1 envelope on emit', async () => {
    const subjects = new Map<string, FakeSubject>();
    const conn = new FakeConnection(subjects);
    const bus = new NATSTriggerBus({
      connection: conn,
      appId: 'mail.example.com',
      originId: 'origin-A',
    });
    await bus.start();
    await bus.emit(SCHEMA_TRIGGER);
    expect(conn.published).toHaveLength(1);
    expect(conn.published[0]!.subject).toBe('atelier.triggers.mail.example.com');
    const env = JSON.parse(conn.published[0]!.data) as NATSTriggerEnvelope;
    expect(env.v).toBe(NATS_TRIGGER_ENVELOPE_VERSION);
    expect(env.origin).toBe('origin-A');
    expect(env.trigger).toEqual(SCHEMA_TRIGGER);
    await bus.close();
  });

  it('routes inbound messages from another instance to local listeners', async () => {
    const subjects = new Map<string, FakeSubject>();
    const connA = new FakeConnection(subjects);
    const connB = new FakeConnection(subjects);
    const busA = new NATSTriggerBus({ connection: connA, appId: 'app', originId: 'A' });
    const busB = new NATSTriggerBus({ connection: connB, appId: 'app', originId: 'B' });
    await busA.start();
    await busB.start();
    const handler = vi.fn();
    busB.subscribe('*', handler);
    await busA.emit(SCHEMA_TRIGGER);
    await flush();
    expect(handler).toHaveBeenCalledWith(SCHEMA_TRIGGER);
    expect(handler).toHaveBeenCalledTimes(1);
    await busA.close();
    await busB.close();
  });

  it('drops self-echoes via origin so emitter handlers fire exactly once', async () => {
    const subjects = new Map<string, FakeSubject>();
    const conn = new FakeConnection(subjects);
    const bus = new NATSTriggerBus({ connection: conn, appId: 'app', originId: 'A' });
    await bus.start();
    const handler = vi.fn();
    bus.subscribe('*', handler);
    await bus.emit(SCHEMA_TRIGGER);
    await flush();
    expect(handler).toHaveBeenCalledTimes(1);
    await bus.close();
  });

  it('fans out to multiple subscribers on the same subject', async () => {
    const subjects = new Map<string, FakeSubject>();
    const a = new NATSTriggerBus({
      connection: new FakeConnection(subjects),
      appId: 'app',
      originId: 'A',
    });
    const b = new NATSTriggerBus({
      connection: new FakeConnection(subjects),
      appId: 'app',
      originId: 'B',
    });
    const c = new NATSTriggerBus({
      connection: new FakeConnection(subjects),
      appId: 'app',
      originId: 'C',
    });
    await Promise.all([a.start(), b.start(), c.start()]);
    const hB = vi.fn();
    const hC = vi.fn();
    b.subscribe('*', hB);
    c.subscribe('*', hC);
    await a.emit(SCHEMA_TRIGGER);
    await flush();
    expect(hB).toHaveBeenCalledTimes(1);
    expect(hC).toHaveBeenCalledTimes(1);
    await Promise.all([a.close(), b.close(), c.close()]);
  });

  it('routes typed subscribers correctly', async () => {
    const subjects = new Map<string, FakeSubject>();
    const a = new NATSTriggerBus({
      connection: new FakeConnection(subjects),
      appId: 'app',
      originId: 'A',
    });
    const b = new NATSTriggerBus({
      connection: new FakeConnection(subjects),
      appId: 'app',
      originId: 'B',
    });
    await a.start();
    await b.start();
    const matched = vi.fn();
    const ignored = vi.fn();
    b.subscribe('capability.changed', matched);
    b.subscribe('capability.added', ignored);
    await a.emit(SCHEMA_TRIGGER);
    await flush();
    expect(matched).toHaveBeenCalledWith(SCHEMA_TRIGGER);
    expect(ignored).not.toHaveBeenCalled();
    await Promise.all([a.close(), b.close()]);
  });

  it('honors a custom subject prefix', () => {
    const conn = new FakeConnection(new Map());
    const bus = new NATSTriggerBus({
      connection: conn,
      appId: 'mail',
      subjectPrefix: 'cir',
    });
    expect(bus.subject).toBe('cir.triggers.mail');
  });

  it('reports parse errors via onParseError', async () => {
    const subjects = new Map<string, FakeSubject>();
    const conn = new FakeConnection(subjects);
    const onParseError = vi.fn();
    const bus = new NATSTriggerBus({
      connection: conn,
      appId: 'app',
      originId: 'A',
      onParseError,
    });
    await bus.start();
    // Send a malformed message via a separate connection so origin doesn't drop it.
    const other = new FakeConnection(subjects);
    other.publish('atelier.triggers.app', 'not json{');
    await flush();
    expect(onParseError).toHaveBeenCalledTimes(1);
    await bus.close();
  });

  it('drops envelopes with the wrong version', async () => {
    const subjects = new Map<string, FakeSubject>();
    const conn = new FakeConnection(subjects);
    const onParseError = vi.fn();
    const bus = new NATSTriggerBus({
      connection: conn,
      appId: 'app',
      originId: 'A',
      onParseError,
    });
    await bus.start();
    const handler = vi.fn();
    bus.subscribe('*', handler);
    const other = new FakeConnection(subjects);
    other.publish(
      'atelier.triggers.app',
      JSON.stringify({ v: 999, origin: 'X', trigger: SCHEMA_TRIGGER }),
    );
    await flush();
    expect(handler).not.toHaveBeenCalled();
    expect(onParseError).toHaveBeenCalledTimes(1);
    await bus.close();
  });

  it('handles Uint8Array payloads', async () => {
    const subjects = new Map<string, FakeSubject>();
    const conn = new FakeConnection(subjects);
    const bus = new NATSTriggerBus({
      connection: conn,
      appId: 'app',
      originId: 'A',
    });
    await bus.start();
    const handler = vi.fn();
    bus.subscribe('*', handler);
    const subject = subjects.get('atelier.triggers.app')!;
    const payload = JSON.stringify({ v: 1, origin: 'X', trigger: SCHEMA_TRIGGER });
    const bytes = new TextEncoder().encode(payload);
    for (const sub of subject.subscribers) {
      sub.deliver({ subject: 'atelier.triggers.app', data: bytes });
    }
    await flush();
    expect(handler).toHaveBeenCalledWith(SCHEMA_TRIGGER);
    await bus.close();
  });

  it('prefers msg.string() when present', async () => {
    const subjects = new Map<string, FakeSubject>();
    const conn = new FakeConnection(subjects);
    const bus = new NATSTriggerBus({
      connection: conn,
      appId: 'app',
      originId: 'A',
    });
    await bus.start();
    const handler = vi.fn();
    bus.subscribe('*', handler);
    const subject = subjects.get('atelier.triggers.app')!;
    const payload = JSON.stringify({ v: 1, origin: 'X', trigger: SCHEMA_TRIGGER });
    for (const sub of subject.subscribers) {
      sub.deliver({
        subject: 'atelier.triggers.app',
        data: new Uint8Array(),
        string: () => payload,
      });
    }
    await flush();
    expect(handler).toHaveBeenCalledWith(SCHEMA_TRIGGER);
    await bus.close();
  });

  it('emits to local listeners even before start()', async () => {
    const conn = new FakeConnection(new Map());
    const bus = new NATSTriggerBus({ connection: conn, appId: 'app', originId: 'A' });
    const handler = vi.fn();
    bus.subscribe('*', handler);
    await bus.emit(SCHEMA_TRIGGER);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(conn.published).toHaveLength(1);
  });

  it('start() is idempotent', async () => {
    const conn = new FakeConnection(new Map());
    const subSpy = vi.spyOn(conn, 'subscribe');
    const bus = new NATSTriggerBus({ connection: conn, appId: 'app' });
    await bus.start();
    await bus.start();
    await bus.start();
    expect(subSpy).toHaveBeenCalledTimes(1);
    await bus.close();
  });

  it('close() makes emit a no-op and is idempotent', async () => {
    const conn = new FakeConnection(new Map());
    const bus = new NATSTriggerBus({ connection: conn, appId: 'app', originId: 'A' });
    await bus.start();
    await bus.close();
    await bus.close();
    await bus.emit(SCHEMA_TRIGGER);
    expect(conn.published).toHaveLength(0);
  });

  it('exposes subject + originId metadata', () => {
    const bus = new NATSTriggerBus({
      connection: new FakeConnection(new Map()),
      appId: 'mail.example.com',
      originId: 'origin-Z',
    });
    expect(bus.subject).toBe('atelier.triggers.mail.example.com');
    expect(bus.originId).toBe('origin-Z');
    expect(bus.appId).toBe('mail.example.com');
  });
});
