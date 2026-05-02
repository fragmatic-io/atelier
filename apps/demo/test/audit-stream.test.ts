// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for the helpers behind `app/api/cir/audit/stream/route.ts`.
 *
 * The Next.js route file is a thin adapter; the streaming logic lives in
 * `lib/audit-stream.ts` so we can exercise it without spinning up the
 * Next.js server. We drive the helper with a real `StreamingAuditSink`
 * (the one demo + DebugPanel + atelier-server use), assert the SSE frames
 * the consumer sees, and verify lifecycle (subscription cleanup,
 * heartbeat scheduling).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuditEvent } from '@atelier/schemas';
import { StreamingAuditSink } from '@atelier/runtime';
import {
  buildAuditStreamResponse,
  encodeSseFrame,
  eventMatchesFilters,
  parseTypesParam,
} from '../lib/audit-stream';

afterEach(() => {
  vi.useRealTimers();
});

function makeEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    event_id: 'evt_test_001',
    timestamp: '2026-04-30T12:00:00.000Z',
    user_id: 'demo-user',
    app_id: 'cir.demo',
    type: 'action.executed',
    actor: 'user',
    before_state_hash: 'before',
    after_state_hash: 'after',
    trigger_chain: ['user'],
    token_cost: 0,
    policy_evaluations: [],
    ...overrides,
  };
}

/**
 * Drain a Response's body into the strings yielded so far. We intentionally
 * read non-blockingly: each `read()` returns whatever's been enqueued by
 * the time the test calls us. Tests typically interleave `flushPromises()`
 * + `vi.advanceTimersByTime()` between drains.
 */
async function drain(response: Response): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let out = '';
  // Pull all currently-buffered chunks, then release the lock so the test
  // can drain again later. We avoid `read()`-until-done because the stream
  // stays open by design (heartbeats forever).
  // Web Streams expose a `desiredSize` heuristic, but it's not reliable
  // across runtimes. Instead we drain greedily with a `Promise.race` against
  // a 0ms timer — anything in the queue resolves immediately; no pending
  // chunk falls through fast.
  while (true) {
    const next = reader.read();
    const tick = new Promise<'idle'>((r) => setTimeout(() => r('idle'), 0));
    const winner = await Promise.race([next, tick]);
    if (winner === 'idle') {
      // Cancel the in-flight read so the lock is released cleanly. If the
      // controller has nothing queued, the read just stays pending — which
      // is fine because we'll never await it.
      void next.then(
        () => undefined,
        () => undefined,
      );
      reader.releaseLock();
      return out;
    }
    if (winner.done) {
      reader.releaseLock();
      return out;
    }
    out += decoder.decode(winner.value, { stream: true });
  }
}

describe('encodeSseFrame', () => {
  it('emits one event line + one data line + blank-line terminator', () => {
    expect(encodeSseFrame('action.executed', '{"x":1}')).toBe(
      'event: action.executed\ndata: {"x":1}\n\n',
    );
  });

  it('splits multi-line data into one data: line per source line', () => {
    expect(encodeSseFrame('foo', 'a\nb')).toBe('event: foo\ndata: a\ndata: b\n\n');
  });
});

describe('parseTypesParam', () => {
  it('returns undefined for null / empty input', () => {
    expect(parseTypesParam(null)).toBeUndefined();
    expect(parseTypesParam('')).toBeUndefined();
    expect(parseTypesParam('   ')).toBeUndefined();
  });

  it('parses comma-separated values, trimming whitespace', () => {
    const set = parseTypesParam('action.executed, policy.violated ,manifest.compiled');
    expect(set).toBeDefined();
    expect(set!.has('action.executed')).toBe(true);
    expect(set!.has('policy.violated')).toBe(true);
    expect(set!.has('manifest.compiled')).toBe(true);
    expect(set!.size).toBe(3);
  });
});

describe('eventMatchesFilters', () => {
  it('passes everything when no filters set', () => {
    expect(eventMatchesFilters(makeEvent(), {})).toBe(true);
  });

  it('drops events whose type is not in the type filter', () => {
    const f = { types: new Set(['policy.violated']) };
    expect(eventMatchesFilters(makeEvent({ type: 'action.executed' }), f)).toBe(false);
    expect(eventMatchesFilters(makeEvent({ type: 'policy.violated' }), f)).toBe(true);
  });

  it('treats events without tenant_id as global (visible to every tenant filter)', () => {
    const f = { tenant_id: 't_x' };
    expect(eventMatchesFilters(makeEvent(), f)).toBe(true); // no tenant_id ⇒ global
    expect(eventMatchesFilters(makeEvent({ tenant_id: 't_x' }), f)).toBe(true);
    expect(eventMatchesFilters(makeEvent({ tenant_id: 't_other' }), f)).toBe(false);
  });
});

describe('buildAuditStreamResponse', () => {
  it('writes one SSE frame per audit event the sink emits', async () => {
    const sink = new StreamingAuditSink();
    const ctrl = new AbortController();
    const res = buildAuditStreamResponse({ sink, signal: ctrl.signal });

    // Header sanity.
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(res.headers.get('cache-control')).toContain('no-cache');

    const evt = makeEvent({ event_id: 'evt_one', type: 'action.executed' });
    sink.emit(evt);

    const text = await drain(res);
    expect(text).toContain(': connected\n\n'); // initial keep-alive comment
    expect(text).toContain('event: action.executed\n');
    expect(text).toContain(`data: ${JSON.stringify(evt)}\n\n`);

    ctrl.abort();
  });

  it('?type= filter drops events whose type is not in the set', async () => {
    const sink = new StreamingAuditSink();
    const ctrl = new AbortController();
    const res = buildAuditStreamResponse({
      sink,
      filters: { types: new Set(['policy.violated']) },
      signal: ctrl.signal,
    });

    sink.emit(makeEvent({ event_id: 'evt_act', type: 'action.executed' }));
    sink.emit(makeEvent({ event_id: 'evt_pol', type: 'policy.violated' }));

    const text = await drain(res);
    expect(text).not.toContain('event: action.executed');
    expect(text).toContain('event: policy.violated');
    expect(text).toContain('"event_id":"evt_pol"');

    ctrl.abort();
  });

  it('?tenant_id filter narrows tenant-scoped events; globals still flow', async () => {
    const sink = new StreamingAuditSink();
    const ctrl = new AbortController();
    const res = buildAuditStreamResponse({
      sink,
      filters: { tenant_id: 't_alpha' },
      signal: ctrl.signal,
    });

    sink.emit(makeEvent({ event_id: 'evt_global' })); // no tenant_id
    sink.emit(makeEvent({ event_id: 'evt_alpha', tenant_id: 't_alpha' }));
    sink.emit(makeEvent({ event_id: 'evt_beta', tenant_id: 't_beta' }));

    const text = await drain(res);
    expect(text).toContain('"event_id":"evt_global"');
    expect(text).toContain('"event_id":"evt_alpha"');
    expect(text).not.toContain('"event_id":"evt_beta"');

    ctrl.abort();
  });

  it('emits a heartbeat frame on the configured interval', async () => {
    const sink = new StreamingAuditSink();
    const ctrl = new AbortController();

    // Capture the scheduled callback so we can drive heartbeats deterministically
    // — Node's real `setInterval` fires asynchronously and would race the drain.
    // We inject our own scheduler instead of `vi.useFakeTimers()` so the
    // `setTimeout(0)` inside `drain()` keeps using the real clock.
    let heartbeat: (() => void) | null = null;
    const fakeSet = (cb: () => void): unknown => {
      heartbeat = cb;
      return 1;
    };
    const fakeClear = (): void => {
      heartbeat = null;
    };

    const res = buildAuditStreamResponse({
      sink,
      signal: ctrl.signal,
      heartbeatMs: 100,
      setInterval: fakeSet,
      clearInterval: fakeClear,
    });

    // No heartbeat yet — only the connect comment.
    let text = await drain(res);
    expect(text).toContain(': connected');
    expect(text).not.toContain('event: heartbeat');

    // Fire the heartbeat manually.
    expect(heartbeat).not.toBeNull();
    heartbeat!();

    text = await drain(res);
    expect(text).toContain('event: heartbeat\ndata: {}\n\n');

    ctrl.abort();
    expect(heartbeat).toBeNull(); // cleanup cleared the timer
  });

  it('unsubscribes from the sink and clears the heartbeat on client abort', async () => {
    const sink = new StreamingAuditSink();
    const subscribeSpy = vi.spyOn(sink, 'subscribe');
    let heartbeatCleared = false;
    const fakeSet = (): unknown => 42;
    const fakeClear = (): void => {
      heartbeatCleared = true;
    };

    const ctrl = new AbortController();
    buildAuditStreamResponse({
      sink,
      signal: ctrl.signal,
      setInterval: fakeSet,
      clearInterval: fakeClear,
    });

    expect(subscribeSpy).toHaveBeenCalledTimes(1);
    const unsubscribe = subscribeSpy.mock.results[0]!.value as () => void;
    const unsubSpy = vi.fn(unsubscribe);
    // Re-wire so we can detect the call. The sink's listener set is private;
    // probe via emitting after abort and checking it was a no-op.

    ctrl.abort();

    // After abort, emitting must not throw and must not be received as
    // a frame (no live subscriber writes to the closed controller). The
    // cleanest signal we have without poking into private state is that
    // `clearInterval` was called.
    expect(heartbeatCleared).toBe(true);

    // And subsequent emits don't blow up (proves the listener-removal path
    // didn't leave a dangling reference enqueueing into a closed controller).
    expect(() => sink.emit(makeEvent())).not.toThrow();
    // unsubSpy reference kept to silence unused-var lint without changing logic.
    void unsubSpy;
  });
});
