// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
import { describe, expect, it, vi } from 'vitest';
import type { Trigger } from '@cir/schemas';
import { InMemoryTriggerBus } from '../../src/triggers/memory-bus.ts';
import {
  DEFAULT_WS_RECONNECT_BACKOFF_MS,
  WebSocketTriggerTransport,
  type WebSocketCtor,
  type WebSocketLike,
} from '../../src/triggers/websocket-transport.ts';

// ---------------------------------------------------------------------------
// FakeWebSocket — minimal seam that mirrors the WHATWG WebSocket surface this
// transport actually uses. Each new instance is captured in the `instances`
// array so tests can drive the transport through deterministic state changes.
// ---------------------------------------------------------------------------

class FakeWebSocket implements WebSocketLike {
  static instances: FakeWebSocket[] = [];
  readyState = 0; // CONNECTING
  onopen: ((ev: unknown) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  sent: string[] = [];
  closeCalled = 0;
  lastCloseCode: number | undefined;

  constructor(
    public url: string,
    public protocols?: string | string[],
  ) {
    FakeWebSocket.instances.push(this);
  }
  open(): void {
    this.readyState = 1;
    this.onopen?.({});
  }
  message(data: string): void {
    this.onmessage?.({ data });
  }
  binary(data: ArrayBuffer): void {
    this.onmessage?.({ data });
  }
  errorOut(err: unknown): void {
    this.onerror?.(err);
  }
  /** Simulate a network/server-driven close. */
  closeFromPeer(code = 1006, reason = 'abnormal'): void {
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(code?: number): void {
    this.closeCalled += 1;
    this.lastCloseCode = code;
    this.readyState = 3;
  }
}

const FakeWebSocketCtor = FakeWebSocket as unknown as WebSocketCtor;

// ---------------------------------------------------------------------------
// Manual scheduler — drives setTimeout-based reconnect/idle timers without
// relying on real timers. Tests advance the scheduler explicitly so the
// reconnect/idle logic stays deterministic.
// ---------------------------------------------------------------------------

interface ScheduledTask {
  cb: () => void;
  ms: number;
  cancelled: boolean;
}

function makeScheduler(): {
  setTimeoutImpl: (cb: () => void, ms: number) => unknown;
  clearTimeoutImpl: (handle: unknown) => void;
  pending: () => ScheduledTask[];
  runNext: () => number | null;
  runAll: () => void;
} {
  const tasks: ScheduledTask[] = [];
  return {
    setTimeoutImpl: (cb: () => void, ms: number): unknown => {
      const task: ScheduledTask = { cb, ms, cancelled: false };
      tasks.push(task);
      return task;
    },
    clearTimeoutImpl: (handle: unknown): void => {
      const t = handle as ScheduledTask | undefined;
      if (t) t.cancelled = true;
    },
    pending: (): ScheduledTask[] => tasks.filter((t) => !t.cancelled),
    runNext: (): number | null => {
      const next = tasks.find((t) => !t.cancelled);
      if (!next) return null;
      next.cancelled = true;
      next.cb();
      return next.ms;
    },
    runAll: (): void => {
      // Drain all currently-pending tasks. New tasks scheduled inside a
      // callback are picked up on the next iteration.
      let safety = 0;
      while (tasks.some((t) => !t.cancelled)) {
        safety += 1;
        if (safety > 100) throw new Error('runAll: scheduler safety limit hit');
        const next = tasks.find((t) => !t.cancelled);
        if (!next) break;
        next.cancelled = true;
        next.cb();
      }
    },
  };
}

const sampleTrigger: Trigger = {
  type: 'capability.schema_changed',
  app_id: 'mail.example.com',
  capability_id: 'thread.archive',
  old_v: '1.0.0',
  new_v: '2.0.0',
};

function freshFakeRegistry(): void {
  FakeWebSocket.instances = [];
}

describe('WebSocketTriggerTransport', () => {
  it('forwards a single Trigger frame to the bus', async () => {
    freshFakeRegistry();
    const bus = new InMemoryTriggerBus();
    const handler = vi.fn();
    bus.subscribe('*', handler);

    const transport = new WebSocketTriggerTransport({
      url: 'wss://example.com/triggers',
      bus,
      webSocketImpl: FakeWebSocketCtor,
    });
    transport.connect();
    expect(FakeWebSocket.instances).toHaveLength(1);
    const ws = FakeWebSocket.instances[0]!;
    ws.open();
    ws.message(JSON.stringify(sampleTrigger));

    await Promise.resolve();
    await Promise.resolve();
    expect(handler).toHaveBeenCalledWith(sampleTrigger);
  });

  it('handles a multi-frame burst in order', async () => {
    freshFakeRegistry();
    const bus = new InMemoryTriggerBus();
    const seen: Trigger[] = [];
    bus.subscribe('*', (t) => {
      seen.push(t);
    });
    const transport = new WebSocketTriggerTransport({
      url: 'wss://example.com/triggers',
      bus,
      webSocketImpl: FakeWebSocketCtor,
    });
    transport.connect();
    const ws = FakeWebSocket.instances[0]!;
    ws.open();
    const t1 = sampleTrigger;
    const t2: Trigger = { ...sampleTrigger, capability_id: 'thread.label' };
    const t3: Trigger = { ...sampleTrigger, capability_id: 'thread.snooze' };
    ws.message(JSON.stringify(t1));
    ws.message(JSON.stringify(t2));
    ws.message(JSON.stringify(t3));
    await Promise.resolve();
    await Promise.resolve();
    expect(seen).toEqual([t1, t2, t3]);
  });

  it('logs and skips malformed JSON without crashing', () => {
    freshFakeRegistry();
    const bus = new InMemoryTriggerBus();
    const handler = vi.fn();
    bus.subscribe('*', handler);
    const onParseError = vi.fn();
    const transport = new WebSocketTriggerTransport({
      url: 'wss://example.com/triggers',
      bus,
      webSocketImpl: FakeWebSocketCtor,
      onParseError,
    });
    transport.connect();
    const ws = FakeWebSocket.instances[0]!;
    ws.open();
    ws.message('not-json{');
    expect(handler).not.toHaveBeenCalled();
    expect(onParseError).toHaveBeenCalledTimes(1);
    expect(onParseError.mock.calls[0]![0]).toBe('not-json{');
  });

  it('drops frames without a string `type` and reports onParseError', () => {
    freshFakeRegistry();
    const bus = new InMemoryTriggerBus();
    const handler = vi.fn();
    bus.subscribe('*', handler);
    const onParseError = vi.fn();
    const transport = new WebSocketTriggerTransport({
      url: 'wss://example.com/triggers',
      bus,
      webSocketImpl: FakeWebSocketCtor,
      onParseError,
    });
    transport.connect();
    const ws = FakeWebSocket.instances[0]!;
    ws.open();
    ws.message(JSON.stringify({ no_type: true }));
    expect(handler).not.toHaveBeenCalled();
    expect(onParseError).toHaveBeenCalledTimes(1);
  });

  it('sends the configured hello envelope on connect', () => {
    freshFakeRegistry();
    const bus = new InMemoryTriggerBus();
    const transport = new WebSocketTriggerTransport({
      url: 'wss://example.com/triggers',
      bus,
      webSocketImpl: FakeWebSocketCtor,
      hello: { last_seen_version: 42 },
    });
    transport.connect();
    const ws = FakeWebSocket.instances[0]!;
    ws.open();
    expect(ws.sent).toHaveLength(1);
    const frame = JSON.parse(ws.sent[0]!) as Record<string, unknown>;
    expect(frame).toEqual({ kind: 'hello', last_seen_version: 42 });
  });

  it('omits hello when not configured', () => {
    freshFakeRegistry();
    const bus = new InMemoryTriggerBus();
    const transport = new WebSocketTriggerTransport({
      url: 'wss://example.com/triggers',
      bus,
      webSocketImpl: FakeWebSocketCtor,
    });
    transport.connect();
    const ws = FakeWebSocket.instances[0]!;
    ws.open();
    expect(ws.sent).toEqual([]);
  });

  it('honours a custom webSocketImpl (test seam)', () => {
    freshFakeRegistry();
    const bus = new InMemoryTriggerBus();
    const transport = new WebSocketTriggerTransport({
      url: 'wss://example.com/triggers',
      bus,
      webSocketImpl: FakeWebSocketCtor,
    });
    transport.connect();
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0]!.url).toBe('wss://example.com/triggers');
  });

  it('throws when no WebSocket impl is available', () => {
    const bus = new InMemoryTriggerBus();
    // Stash any existing global so this test stays isolated.
    const original = (globalThis as { WebSocket?: unknown }).WebSocket;
    (globalThis as { WebSocket?: unknown }).WebSocket = undefined;
    try {
      const transport = new WebSocketTriggerTransport({
        url: 'wss://example.com/triggers',
        bus,
      });
      expect(() => transport.connect()).toThrow(/no WebSocket available/);
    } finally {
      if (original === undefined) {
        delete (globalThis as { WebSocket?: unknown }).WebSocket;
      } else {
        (globalThis as { WebSocket?: unknown }).WebSocket = original;
      }
    }
  });

  it('reconnects on close using the default backoff schedule', () => {
    freshFakeRegistry();
    const bus = new InMemoryTriggerBus();
    const sched = makeScheduler();
    const transport = new WebSocketTriggerTransport({
      url: 'wss://example.com/triggers',
      bus,
      webSocketImpl: FakeWebSocketCtor,
      // Disable the idle timer for this test so the only pending timers we
      // see are reconnect timers. Default backoff stays in effect.
      idleTimeoutMs: 0,
      setTimeoutImpl: sched.setTimeoutImpl,
      clearTimeoutImpl: sched.clearTimeoutImpl,
    });
    transport.connect();
    const ws1 = FakeWebSocket.instances[0]!;
    // No open() — drive a connect-time failure so `attempt` does not reset.
    ws1.closeFromPeer();
    expect(sched.pending().map((t) => t.ms)).toEqual([DEFAULT_WS_RECONNECT_BACKOFF_MS[0]]);
    sched.runNext();

    const ws2 = FakeWebSocket.instances[1]!;
    ws2.closeFromPeer();
    expect(sched.pending().map((t) => t.ms)).toEqual([DEFAULT_WS_RECONNECT_BACKOFF_MS[1]]);
    sched.runNext();

    const ws3 = FakeWebSocket.instances[2]!;
    ws3.closeFromPeer();
    expect(sched.pending().map((t) => t.ms)).toEqual([DEFAULT_WS_RECONNECT_BACKOFF_MS[2]]);
  });

  it('uses a custom backoff schedule when provided', () => {
    freshFakeRegistry();
    const bus = new InMemoryTriggerBus();
    const sched = makeScheduler();
    const transport = new WebSocketTriggerTransport({
      url: 'wss://example.com/triggers',
      bus,
      webSocketImpl: FakeWebSocketCtor,
      reconnectBackoffMs: [10, 20, 30],
      idleTimeoutMs: 0,
      setTimeoutImpl: sched.setTimeoutImpl,
      clearTimeoutImpl: sched.clearTimeoutImpl,
    });
    transport.connect();
    // Drive failures without successful opens between them so the attempt
    // counter advances through slot 0 → 1 → 2.
    const observed: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      const ws = FakeWebSocket.instances.at(-1)!;
      ws.closeFromPeer();
      const reconnectTimer = sched.pending()[0]!;
      observed.push(reconnectTimer.ms);
      sched.runNext();
    }
    expect(observed).toEqual([10, 20, 30]);
  });

  it('gives up once the backoff schedule is exhausted', () => {
    freshFakeRegistry();
    const bus = new InMemoryTriggerBus();
    const sched = makeScheduler();
    const transport = new WebSocketTriggerTransport({
      url: 'wss://example.com/triggers',
      bus,
      webSocketImpl: FakeWebSocketCtor,
      reconnectBackoffMs: [5, 5],
      idleTimeoutMs: 0,
      setTimeoutImpl: sched.setTimeoutImpl,
      clearTimeoutImpl: sched.clearTimeoutImpl,
    });
    transport.connect();
    // First failure → slot 0 reconnect → second failure → slot 1 reconnect →
    // third failure → schedule exhausted, no further reconnect timer.
    FakeWebSocket.instances[0]!.closeFromPeer();
    sched.runNext(); // → slot 0
    FakeWebSocket.instances[1]!.closeFromPeer();
    sched.runNext(); // → slot 1
    FakeWebSocket.instances[2]!.closeFromPeer();
    expect(sched.pending()).toEqual([]);
    expect(FakeWebSocket.instances).toHaveLength(3);
  });

  it('logs a single `note: reconnecting...` per failure', () => {
    freshFakeRegistry();
    const bus = new InMemoryTriggerBus();
    const sched = makeScheduler();
    const log = vi.fn();
    const transport = new WebSocketTriggerTransport({
      url: 'wss://example.com/triggers',
      bus,
      webSocketImpl: FakeWebSocketCtor,
      reconnectBackoffMs: [5, 5, 5],
      setTimeoutImpl: sched.setTimeoutImpl,
      clearTimeoutImpl: sched.clearTimeoutImpl,
      log,
    });
    transport.connect();
    const ws1 = FakeWebSocket.instances[0]!;
    ws1.open();
    ws1.closeFromPeer();
    ws1.closeFromPeer(); // duplicate close — should not double-log
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]![0]).toMatch(/reconnecting/);
    // After a successful reopen, the next failure should log once again.
    sched.runNext();
    const ws2 = FakeWebSocket.instances[1]!;
    ws2.open();
    ws2.closeFromPeer();
    expect(log).toHaveBeenCalledTimes(2);
  });

  it('treats `{ kind: "heartbeat" }` as a frame that resets idle, not a Trigger', async () => {
    freshFakeRegistry();
    const bus = new InMemoryTriggerBus();
    const handler = vi.fn();
    bus.subscribe('*', handler);
    const onParseError = vi.fn();
    const transport = new WebSocketTriggerTransport({
      url: 'wss://example.com/triggers',
      bus,
      webSocketImpl: FakeWebSocketCtor,
      onParseError,
    });
    transport.connect();
    const ws = FakeWebSocket.instances[0]!;
    ws.open();
    ws.message(JSON.stringify({ kind: 'heartbeat' }));
    await Promise.resolve();
    expect(handler).not.toHaveBeenCalled();
    expect(onParseError).not.toHaveBeenCalled();
  });

  it('idle timeout closes the socket and triggers a reconnect', () => {
    freshFakeRegistry();
    const bus = new InMemoryTriggerBus();
    const sched = makeScheduler();
    const transport = new WebSocketTriggerTransport({
      url: 'wss://example.com/triggers',
      bus,
      webSocketImpl: FakeWebSocketCtor,
      idleTimeoutMs: 500,
      reconnectBackoffMs: [10],
      setTimeoutImpl: sched.setTimeoutImpl,
      clearTimeoutImpl: sched.clearTimeoutImpl,
    });
    transport.connect();
    const ws1 = FakeWebSocket.instances[0]!;
    ws1.open();
    // The idle timer is the only pending 500ms timer.
    const idle = sched.pending().find((t) => t.ms === 500);
    expect(idle).toBeDefined();
    // Fire it — the transport should close ws1 and schedule a reconnect.
    sched.runNext();
    expect(ws1.closeCalled).toBeGreaterThanOrEqual(1);
    const reconnect = sched.pending().find((t) => t.ms === 10);
    expect(reconnect).toBeDefined();
    sched.runNext();
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('a received frame re-arms the idle timer', () => {
    freshFakeRegistry();
    const bus = new InMemoryTriggerBus();
    const sched = makeScheduler();
    const transport = new WebSocketTriggerTransport({
      url: 'wss://example.com/triggers',
      bus,
      webSocketImpl: FakeWebSocketCtor,
      idleTimeoutMs: 500,
      setTimeoutImpl: sched.setTimeoutImpl,
      clearTimeoutImpl: sched.clearTimeoutImpl,
    });
    transport.connect();
    const ws = FakeWebSocket.instances[0]!;
    ws.open();
    const firstIdle = sched.pending().find((t) => t.ms === 500);
    expect(firstIdle).toBeDefined();
    ws.message(JSON.stringify({ kind: 'heartbeat' }));
    // The original idle timer should be cancelled; a fresh one of the same
    // duration replaces it.
    expect(firstIdle!.cancelled).toBe(true);
    const secondIdle = sched.pending().find((t) => t.ms === 500);
    expect(secondIdle).toBeDefined();
    expect(secondIdle).not.toBe(firstIdle);
  });

  it('ignores binary frames', async () => {
    freshFakeRegistry();
    const bus = new InMemoryTriggerBus();
    const handler = vi.fn();
    bus.subscribe('*', handler);
    const onParseError = vi.fn();
    const transport = new WebSocketTriggerTransport({
      url: 'wss://example.com/triggers',
      bus,
      webSocketImpl: FakeWebSocketCtor,
      onParseError,
    });
    transport.connect();
    const ws = FakeWebSocket.instances[0]!;
    ws.open();
    ws.binary(new ArrayBuffer(8));
    await Promise.resolve();
    expect(handler).not.toHaveBeenCalled();
    expect(onParseError).not.toHaveBeenCalled();
  });

  it('connect() is idempotent', () => {
    freshFakeRegistry();
    const bus = new InMemoryTriggerBus();
    const transport = new WebSocketTriggerTransport({
      url: 'wss://example.com/triggers',
      bus,
      webSocketImpl: FakeWebSocketCtor,
    });
    transport.connect();
    transport.connect();
    transport.connect();
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('close() closes cleanly and prevents reconnect', () => {
    freshFakeRegistry();
    const bus = new InMemoryTriggerBus();
    const sched = makeScheduler();
    const transport = new WebSocketTriggerTransport({
      url: 'wss://example.com/triggers',
      bus,
      webSocketImpl: FakeWebSocketCtor,
      reconnectBackoffMs: [5],
      setTimeoutImpl: sched.setTimeoutImpl,
      clearTimeoutImpl: sched.clearTimeoutImpl,
    });
    transport.connect();
    const ws = FakeWebSocket.instances[0]!;
    ws.open();
    transport.close();
    expect(ws.closeCalled).toBeGreaterThanOrEqual(1);
    // Calling close() again should be safe.
    transport.close();
    // A reconnect should not be scheduled after explicit close.
    sched.runAll();
    expect(FakeWebSocket.instances).toHaveLength(1);
    // Subsequent connect() after close is a no-op (mirrors SSE transport).
    transport.connect();
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('passes protocols through to the underlying WebSocket constructor', () => {
    freshFakeRegistry();
    const bus = new InMemoryTriggerBus();
    const transport = new WebSocketTriggerTransport({
      url: 'wss://example.com/triggers',
      bus,
      webSocketImpl: FakeWebSocketCtor,
      protocols: 'cir.triggers.v1',
    });
    transport.connect();
    const ws = FakeWebSocket.instances[0]!;
    expect(ws.protocols).toBe('cir.triggers.v1');
  });

  it('reports onOpen and onError callbacks', () => {
    freshFakeRegistry();
    const bus = new InMemoryTriggerBus();
    const onOpen = vi.fn();
    const onError = vi.fn();
    const transport = new WebSocketTriggerTransport({
      url: 'wss://example.com/triggers',
      bus,
      webSocketImpl: FakeWebSocketCtor,
      onOpen,
      onError,
    });
    transport.connect();
    const ws = FakeWebSocket.instances[0]!;
    ws.open();
    ws.errorOut(new Error('boom'));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
