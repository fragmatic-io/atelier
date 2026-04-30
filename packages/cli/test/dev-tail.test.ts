// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Tests for `cir dev --tail` SSE plumbing.
 *
 * The parser (event splitting, multi-line data, comments) and the reconnect
 * schedule are pure functions and tested directly. The connect-loop is
 * exercised with an injected fetchImpl + sleep shim — no real network.
 */

import { describe, expect, it } from 'vitest';

import {
  feedSse,
  formatAuditLine,
  newSseParserState,
  reconnectDelayMs,
  runDevTail,
  severityColor,
} from '../src/commands/dev-tail.ts';
import type { AuditEvent } from '@cir/schemas';

// -----------------------------------------------------------------------------
// Helpers.
// -----------------------------------------------------------------------------

function compileEvent(): AuditEvent {
  return {
    event_id: 'evt_1',
    timestamp: '2026-04-30T12:34:56Z',
    user_id: 'demo-user',
    app_id: 'cir.demo',
    type: 'manifest.compiled',
    actor: 'agent',
    before_state_hash: 'h0',
    after_state_hash: 'h1',
    trigger_chain: [],
    token_cost: 1234,
    policy_evaluations: [],
    manifest_id: 'm_a7b3c9d1',
  };
}

function policyFailEvent(): AuditEvent {
  return {
    ...compileEvent(),
    event_id: 'evt_2',
    type: 'policy.violated',
    policy_evaluations: [
      { policy_id: 'reversibility_surfaced', passed: false, detail: 'issue.create' },
    ],
    token_cost: 0,
  };
}

// -----------------------------------------------------------------------------
// SSE parser.
// -----------------------------------------------------------------------------

describe('feedSse — single events', () => {
  it('emits one complete event after a blank line', () => {
    const state = newSseParserState();
    const { events } = feedSse(state, 'data: {"a":1}\n\n');
    expect(events).toHaveLength(1);
    expect(events[0]?.data).toBe('{"a":1}');
    expect(events[0]?.event).toBeNull();
  });

  it('does not emit before the blank line arrives', () => {
    const state = newSseParserState();
    const a = feedSse(state, 'data: hello');
    expect(a.events).toEqual([]);
    const b = feedSse(state, '\n\n');
    expect(b.events).toHaveLength(1);
    expect(b.events[0]?.data).toBe('hello');
  });

  it('handles \\r\\n line endings', () => {
    const state = newSseParserState();
    const { events } = feedSse(state, 'event: ping\r\ndata: 1\r\n\r\n');
    expect(events).toHaveLength(1);
    expect(events[0]?.event).toBe('ping');
    expect(events[0]?.data).toBe('1');
  });

  it('ignores comment lines starting with `:`', () => {
    const state = newSseParserState();
    const { events } = feedSse(state, ': heartbeat\ndata: ok\n\n');
    expect(events).toHaveLength(1);
    expect(events[0]?.data).toBe('ok');
  });
});

describe('feedSse — multi-line data + event:', () => {
  it('joins multiple data: lines with \\n', () => {
    const state = newSseParserState();
    const { events } = feedSse(state, 'data: line1\ndata: line2\ndata: line3\n\n');
    expect(events).toHaveLength(1);
    expect(events[0]?.data).toBe('line1\nline2\nline3');
  });

  it('separates event: from data:', () => {
    const state = newSseParserState();
    const { events } = feedSse(state, 'event: audit\ndata: {"x":1}\nid: 7\n\n');
    expect(events).toHaveLength(1);
    expect(events[0]?.event).toBe('audit');
    expect(events[0]?.data).toBe('{"x":1}');
    expect(events[0]?.id).toBe('7');
  });

  it('handles two events in one chunk', () => {
    const state = newSseParserState();
    const { events } = feedSse(state, 'data: a\n\ndata: b\n\n');
    expect(events).toHaveLength(2);
    expect(events[0]?.data).toBe('a');
    expect(events[1]?.data).toBe('b');
  });

  it('preserves an in-flight event across chunk boundaries', () => {
    const state = newSseParserState();
    feedSse(state, 'event: au');
    feedSse(state, 'dit\ndata: {"a":');
    const { events } = feedSse(state, '1}\n\n');
    expect(events).toHaveLength(1);
    expect(events[0]?.event).toBe('audit');
    expect(events[0]?.data).toBe('{"a":1}');
  });
});

// -----------------------------------------------------------------------------
// Reconnect schedule.
// -----------------------------------------------------------------------------

describe('reconnectDelayMs', () => {
  it('uses capped exponential backoff: 1s, 2s, 4s, 8s, 8s, ...', () => {
    expect(reconnectDelayMs(1)).toBe(1000);
    expect(reconnectDelayMs(2)).toBe(2000);
    expect(reconnectDelayMs(3)).toBe(4000);
    expect(reconnectDelayMs(4)).toBe(8000);
    expect(reconnectDelayMs(5)).toBe(8000);
    expect(reconnectDelayMs(99)).toBe(8000);
  });
  it('clamps non-positive attempts to 1', () => {
    expect(reconnectDelayMs(0)).toBe(1000);
    expect(reconnectDelayMs(-3)).toBe(1000);
  });
});

// -----------------------------------------------------------------------------
// Formatter / colors.
// -----------------------------------------------------------------------------

describe('formatAuditLine', () => {
  it('paints compile.ok green and includes manifest id', () => {
    const line = formatAuditLine(compileEvent(), false);
    // green = \x1b[32m. We don't assert exact escapes elsewhere — just that
    // the right escape is present for `manifest.compiled`.
    expect(line).toContain(`${String.fromCharCode(27)}[32m`);
    expect(line).toContain('compile.ok');
    expect(line).toContain('m_a7b3c9d1');
    expect(line).toContain('[12:34:56]');
  });

  it('paints policy.fail red and surfaces the failing policy', () => {
    const line = formatAuditLine(policyFailEvent(), false);
    expect(line).toContain(`${String.fromCharCode(27)}[31m`);
    expect(line).toContain('policy.fail');
    expect(line).toContain('reversibility_surfaced');
    expect(line).toContain('issue.create');
  });

  it('respects noColor', () => {
    const line = formatAuditLine(compileEvent(), true);
    const ESC = String.fromCharCode(27);
    expect(line.includes(ESC)).toBe(false);
    expect(line).toContain('compile.ok');
  });
});

describe('severityColor', () => {
  it('maps documented event types', () => {
    expect(severityColor('manifest.compiled')).toBe('green');
    expect(severityColor('policy.violated')).toBe('red');
    expect(severityColor('action.executed')).toBe('cyan');
    expect(severityColor('action.denied')).toBe('red');
  });
  it('falls back to dim for unknown types', () => {
    expect(severityColor('mystery')).toBe('dim');
  });
});

// -----------------------------------------------------------------------------
// runDevTail with injected fetch.
// -----------------------------------------------------------------------------

/** Build a Response-like object whose body streams chunks via getReader(). */
function streamedResponse(chunks: string[]): Response {
  let i = 0;
  const enc = new TextEncoder();
  const reader = {
    read(): Promise<ReadableStreamReadResult<Uint8Array>> {
      if (i >= chunks.length) {
        return Promise.resolve({ done: true, value: undefined });
      }
      const value = enc.encode(chunks[i] ?? '');
      i += 1;
      return Promise.resolve({ done: false, value });
    },
    releaseLock(): void {
      // no-op
    },
    cancel(): Promise<void> {
      return Promise.resolve();
    },
    closed: Promise.resolve(undefined),
  };
  const body = {
    getReader(): ReadableStreamDefaultReader<Uint8Array> {
      return reader;
    },
  };
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    body: body as unknown as ReadableStream<Uint8Array>,
  } as unknown as Response;
}

type FetchFn = typeof fetch;

describe('runDevTail', () => {
  it('prints the unreachable-endpoint note on initial failure and exits 0', async () => {
    const lines: string[] = [];
    const fakeFetch = ((): Promise<Response> =>
      Promise.reject(new Error('ECONNREFUSED'))) as unknown as FetchFn;
    const code = await runDevTail({
      auditUrl: 'http://localhost:9999/missing',
      fetchImpl: fakeFetch,
      print: (s) => lines.push(s),
      sleep: () => Promise.resolve(),
      noColor: true,
      maxAttempts: 0,
    });
    expect(code).toBe(0);
    const all = lines.join('');
    expect(all).toContain('audit endpoint not reachable');
    expect(all).toContain('/api/cir/audit/stream');
  });

  it('parses streamed events and prints formatted lines', async () => {
    const event = compileEvent();
    const sse = `data: ${JSON.stringify(event)}\n\n`;
    const lines: string[] = [];
    let calls = 0;
    const fakeFetch = ((): Promise<Response> => {
      calls += 1;
      if (calls === 1) return Promise.resolve(streamedResponse([sse]));
      // Subsequent reconnect: simulate a permanent failure so the loop
      // exits via maxAttempts after the first stream completes.
      return Promise.reject(new Error('ECONNREFUSED'));
    }) as unknown as FetchFn;
    const code = await runDevTail({
      auditUrl: 'http://localhost:3000/api/cir/audit/stream',
      fetchImpl: fakeFetch,
      print: (s) => lines.push(s),
      sleep: () => Promise.resolve(),
      noColor: true,
      maxAttempts: 0,
    });
    expect(code).toBe(0);
    const all = lines.join('');
    expect(all).toContain('compile.ok');
    expect(all).toContain('m_a7b3c9d1');
  });

  it('uses the configured audit URL', async () => {
    const seenUrls: string[] = [];
    const fakeFetch = ((url: string): Promise<Response> => {
      seenUrls.push(url);
      return Promise.reject(new Error('boom'));
    }) as unknown as FetchFn;
    await runDevTail({
      auditUrl: 'http://example.test/audit',
      fetchImpl: fakeFetch,
      print: () => undefined,
      sleep: () => Promise.resolve(),
      maxAttempts: 0,
    });
    expect(seenUrls).toEqual(['http://example.test/audit']);
  });

  it('prints the reconnect note once after a successful connect drops', async () => {
    const event = compileEvent();
    const sse = `data: ${JSON.stringify(event)}\n\n`;
    const lines: string[] = [];
    let calls = 0;
    const fakeFetch = ((): Promise<Response> => {
      calls += 1;
      if (calls === 1) return Promise.resolve(streamedResponse([sse]));
      if (calls === 2) return Promise.reject(new Error('ECONNRESET'));
      if (calls === 3) return Promise.reject(new Error('ECONNRESET'));
      return Promise.reject(new Error('done'));
    }) as unknown as FetchFn;
    await runDevTail({
      auditUrl: 'http://localhost:3000/api/cir/audit/stream',
      fetchImpl: fakeFetch,
      print: (s) => lines.push(s),
      sleep: () => Promise.resolve(),
      noColor: true,
      maxAttempts: 2,
    });
    const reconnectLines = lines.filter((l) => l.includes('reconnecting'));
    expect(reconnectLines).toHaveLength(1);
  });
});
