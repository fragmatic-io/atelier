// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `atelier dev --tail` / `atelier dev --tail-only` — Server-Sent Events tail.
 *
 * Streams audit events from a Atelier dev server's SSE endpoint and prints them
 * to stderr in a colored compact format. The `dev.ts` command spawns
 * `next dev`; this module owns the SSE consumer (parser + reconnect loop) so
 * the parser is unit-testable in isolation.
 *
 *   [12:34:56] compile.ok       m_a7b3c9d1   gemini-2.5-pro   1.2s
 *   [12:34:57] policy.fail      reversibility_surfaced   issue.create
 *   [12:34:58] action.executed  thread.archive  user=demo-user
 *
 * Reconnect schedule: capped exponential backoff (1s, 2s, 4s, max 8s). On the
 * first failure we print one `note: reconnecting...` line; subsequent retries
 * are silent so a long outage doesn't flood the terminal.
 *
 * If the audit endpoint is unreachable we print a clear note and exit 0.
 * The contract is "demos that opt in implement
 * `/api/cir/audit/stream`" — we never fabricate it.
 */

import type { AuditEvent } from '@atelier/schemas';

// ---------------------------------------------------------------------------
// SSE parser. Pure: takes a chunk of decoded text plus parser state, returns
// the new state and any complete events extracted. The contract follows the
// HTML5 SSE spec (https://html.spec.whatwg.org/#server-sent-events):
//
//   - Events are delimited by a blank line.
//   - Inside an event, `event:`/`data:`/`id:`/`retry:` lines are the headers.
//   - Multiple `data:` lines within one event are concatenated with `\n`.
//   - Lines starting with `:` are comments — ignored.
// ---------------------------------------------------------------------------

export interface SsePartialEvent {
  event: string | null;
  data: string;
  id: string | null;
}

export interface SseParserState {
  /** Buffer carrying the tail of an incomplete chunk. */
  buffer: string;
  /** The event currently being assembled. Reset after each blank-line flush. */
  current: SsePartialEvent;
}

/** Initial parser state for a new connection. */
export function newSseParserState(): SseParserState {
  return { buffer: '', current: { event: null, data: '', id: null } };
}

/**
 * Append `chunk` to the parser state and emit any events that completed.
 *
 * Returns `{ events, state }`. The state is mutated in place AND returned so
 * tests can assert against it without holding a reference; the caller can
 * either pattern (state-mutating loop or pure functional thread) work.
 */
export function feedSse(
  state: SseParserState,
  chunk: string,
): { events: SsePartialEvent[]; state: SseParserState } {
  state.buffer += chunk;
  const events: SsePartialEvent[] = [];
  // Split on \n; keep the trailing partial line in the buffer.
  const lines = state.buffer.split('\n');
  state.buffer = lines.pop() ?? '';

  for (const rawLine of lines) {
    // Spec: \r\n is also a line terminator. After splitting on \n we might
    // have a trailing \r — strip it.
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;

    if (line === '') {
      // Blank line: dispatch the current event if it has any data.
      if (state.current.data !== '' || state.current.event !== null) {
        // Strip a single trailing newline that was added by `data:` aggregation.
        const flushed: SsePartialEvent = {
          event: state.current.event,
          data: state.current.data.endsWith('\n')
            ? state.current.data.slice(0, -1)
            : state.current.data,
          id: state.current.id,
        };
        events.push(flushed);
      }
      state.current = { event: null, data: '', id: null };
      continue;
    }

    if (line.startsWith(':')) {
      // Comment line — ignore.
      continue;
    }

    const colonIdx = line.indexOf(':');
    const field = colonIdx === -1 ? line : line.slice(0, colonIdx);
    let value = colonIdx === -1 ? '' : line.slice(colonIdx + 1);
    if (value.startsWith(' ')) value = value.slice(1);

    switch (field) {
      case 'event':
        state.current.event = value;
        break;
      case 'data':
        state.current.data += `${value}\n`;
        break;
      case 'id':
        state.current.id = value;
        break;
      // 'retry' is intentionally ignored; we own the backoff schedule.
      default:
      // Unknown field — ignore.
    }
  }

  return { events, state };
}

// ---------------------------------------------------------------------------
// Reconnect schedule. Pure: given an attempt count, return the delay (ms).
// Capped exponential: 1s, 2s, 4s, then 8s forever.
// ---------------------------------------------------------------------------

/** Returns the delay before the Nth (1-indexed) reconnect attempt. */
export function reconnectDelayMs(attempt: number): number {
  const a = Math.max(1, Math.floor(attempt));
  const exp = Math.min(8, 2 ** (a - 1));
  return exp * 1000;
}

// ---------------------------------------------------------------------------
// Formatter. Pure: takes an audit event and a `noColor` flag, returns the
// rendered string (one line). `severityColor` decides the color band.
// ---------------------------------------------------------------------------

const ESC = '\x1b[';
const COLORS = {
  reset: `${ESC}0m`,
  dim: `${ESC}2m`,
  red: `${ESC}31m`,
  green: `${ESC}32m`,
  yellow: `${ESC}33m`,
  blue: `${ESC}34m`,
  cyan: `${ESC}36m`,
} as const;

type ColorName = keyof typeof COLORS;

function paint(noColor: boolean, color: ColorName, s: string): string {
  if (noColor) return s;
  return `${COLORS[color]}${s}${COLORS.reset}`;
}

/**
 * Map a raw `audit.type` string + payload into the simplified event-name +
 * severity color used in the printed line. The brief lists three example
 * categories; we expand to the full `AuditEventType` enum.
 */
export function severityColor(type: string): ColorName {
  if (type === 'manifest.compiled') return 'green';
  if (type === 'manifest.served') return 'blue';
  if (type === 'manifest.rolled_back' || type === 'manifest.invalidated') return 'yellow';
  if (type === 'action.executed') return 'cyan';
  if (type === 'action.denied' || type === 'policy.violated') return 'red';
  if (type === 'policy.evaluated') return 'dim';
  return 'dim';
}

/**
 * Map the wire `AuditEvent.type` into the compact display name. Two cases
 * the brief explicitly mentions get prettier names: `manifest.compiled` →
 * `compile.ok`, `policy.violated` → `policy.fail`.
 */
export function displayName(type: string): string {
  if (type === 'manifest.compiled') return 'compile.ok';
  if (type === 'policy.violated') return 'policy.fail';
  return type;
}

/** Format a single audit event into a one-line printable string. */
export function formatAuditLine(event: AuditEvent, noColor: boolean): string {
  const ts = formatTimestamp(event.timestamp);
  const name = displayName(event.type);
  const color = severityColor(event.type);
  const tag = paint(noColor, color, name.padEnd(15));
  const detail = formatDetail(event);
  return `${paint(noColor, 'dim', `[${ts}]`)} ${tag} ${detail}`;
}

function formatTimestamp(iso: string): string {
  // Keep just HH:MM:SS for compactness. Falls back to the raw string if the
  // ISO didn't parse — defensive only; the schema requires ISO-8601.
  const m = /T(\d{2}:\d{2}:\d{2})/.exec(iso);
  if (m) return m[1] ?? iso;
  // Best-effort: drop everything before the last 'T' or ' '.
  return iso.slice(-8);
}

function formatDetail(event: AuditEvent): string {
  const parts: string[] = [];
  if (event.manifest_id) parts.push(event.manifest_id);
  // Surface the first failed policy if any — matches the brief's example
  // "policy.fail      reversibility_surfaced   issue.create".
  const failed = event.policy_evaluations.find((p) => !p.passed);
  if (failed) {
    parts.push(failed.policy_id);
    if (failed.detail) parts.push(failed.detail);
  }
  if (event.user_id && event.actor === 'user') parts.push(`user=${event.user_id}`);
  if (event.token_cost > 0) parts.push(`${event.token_cost.toFixed(0)}tk`);
  return parts.join('  ');
}

// ---------------------------------------------------------------------------
// SSE consumer loop.
// ---------------------------------------------------------------------------

export interface DevTailOptions {
  /** Audit endpoint URL. Default `http://localhost:3000/api/cir/audit/stream`. */
  auditUrl?: string;
  /** Suppress ANSI color escapes. Defaults to false. */
  noColor?: boolean;
  /** Injected fetch (tests). Defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Sink for printed lines. Defaults to `process.stderr.write`. */
  print?: (line: string) => void;
  /** Sleep for `ms` ms. Tests inject a synchronous shim. */
  sleep?: (ms: number) => Promise<void>;
  /** Abort signal — stops the loop on abort. */
  signal?: AbortSignal;
  /** Max reconnect attempts before giving up. Default Infinity. */
  maxAttempts?: number;
}

const DEFAULT_AUDIT_URL = 'http://localhost:3000/api/cir/audit/stream';

/**
 * Run the SSE tail loop until `signal` aborts or the endpoint is unreachable
 * on the first connect. Returns the exit code (0 on a clean exit, 1 on a
 * fatal error that wasn't a simple unreachable endpoint).
 */
export async function runDevTail(opts: DevTailOptions = {}): Promise<number> {
  const auditUrl = opts.auditUrl ?? DEFAULT_AUDIT_URL;
  const noColor = opts.noColor ?? false;
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const print = opts.print ?? ((line: string) => process.stderr.write(line));
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const maxAttempts = opts.maxAttempts ?? Infinity;

  let attempt = 0;
  let connectedOnce = false;
  let printedReconnectingOnce = false;

  while (!opts.signal?.aborted) {
    try {
      const fetchInit: RequestInit = {
        headers: { Accept: 'text/event-stream' },
      };
      if (opts.signal) fetchInit.signal = opts.signal;
      const res = await fetchImpl(auditUrl, fetchInit);
      if (!res.ok) {
        throw new Error(`HTTP ${String(res.status)} ${res.statusText}`);
      }
      const body = res.body;
      if (!body) {
        throw new Error('response had no body');
      }
      connectedOnce = true;
      attempt = 0;
      printedReconnectingOnce = false;

      const reader = body.getReader();
      const decoder = new TextDecoder('utf-8');
      const state = newSseParserState();
      let streamDone = false;
      while (!streamDone && !opts.signal?.aborted) {
        const result = await reader.read();
        if (result.done) {
          streamDone = true;
          break;
        }
        // result.value is typed loosely (DOM's `any`); narrow to Uint8Array.
        const value = result.value as Uint8Array;
        const chunk = decoder.decode(value, { stream: true });
        const { events } = feedSse(state, chunk);
        for (const evt of events) {
          if (evt.data === '') continue;
          let parsed: AuditEvent;
          try {
            parsed = JSON.parse(evt.data) as AuditEvent;
          } catch {
            continue;
          }
          print(`${formatAuditLine(parsed, noColor)}\n`);
        }
      }
      // Stream closed cleanly — try to reconnect.
    } catch (err) {
      if (opts.signal?.aborted) return 0;
      if (!connectedOnce) {
        // First-attempt failure: this is the documented "endpoint not
        // reachable" path. Print the contract note and exit cleanly.
        print(
          'note: audit endpoint not reachable; the dev server may not expose /api/cir/audit/stream yet\n',
        );
        return 0;
      }
      const dim = (s: string): string => paint(noColor, 'dim', s);
      const reason = err instanceof Error ? err.message : String(err);
      if (!printedReconnectingOnce) {
        print(`${dim(`note: reconnecting... (${reason})`)}\n`);
        printedReconnectingOnce = true;
      }
    }

    attempt += 1;
    if (attempt > maxAttempts) return 0;
    await sleep(reconnectDelayMs(attempt));
  }
  return 0;
}
