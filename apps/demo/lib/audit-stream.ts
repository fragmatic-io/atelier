// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Helper that backs `app/api/cir/audit/stream/route.ts`.
 *
 * Pulled out of the route file so the streaming logic is unit-testable
 * without spinning up Next.js. The route is a thin adapter that:
 *
 *   1. Pulls the demo's singleton `StreamingAuditSink` from `cir-server.ts`.
 *   2. Parses the optional `?tenant_id` and `?type=` query filters.
 *   3. Hands all of that to `buildAuditStreamResponse()` here, which owns
 *      the `ReadableStream` lifecycle (subscribe, encode SSE frames,
 *      heartbeat, unsubscribe on disconnect).
 *
 * The wire contract matches what `cir dev --tail` (Wave 4 / P-CLI-2) and
 * `<DebugPanel>` (Wave 5+) consume:
 *
 *     event: <AuditEvent.type>
 *     data: <JSON-encoded AuditEvent>
 *
 *     event: heartbeat
 *     data: {}
 *
 * Heartbeats fire every `heartbeatMs` (default 15s) so a stale TCP socket
 * is detected by the consumer.
 *
 * Filtering — `tenant_id` and `type` — is applied here rather than in the
 * sink because `StreamingAuditSink.subscribe()` is intentionally simple
 * (just a listener; no per-subscriber filter state). The filter contract
 * is documented in `packages/schemas/src/audit.ts`: events without a
 * `tenant_id` are treated as global and visible to every subscriber. A
 * `?tenant_id=t_x` filter therefore narrows to "events scoped to t_x OR
 * global"; pass no filter to see everything (the default).
 */

import type { AuditEvent } from '@cir/schemas';
import type { AuditListener, StreamingAuditSink } from '@cir/runtime';

/** What the route handler reads off the request URL. */
export interface AuditStreamFilters {
  /**
   * If set, only events with `tenant_id === filter` (or no `tenant_id` at
   * all) flow to the consumer. The demo isn't multi-tenant today, so this
   * is mostly a contract-readiness hook for downstream hosts; passing it
   * against the demo will narrow to the global stream.
   */
  tenant_id?: string;
  /**
   * If set, only events whose `type` is in the set flow to the consumer.
   * The route handler parses comma-separated `?type=action.executed,policy.violated`
   * into this set before calling.
   */
  types?: ReadonlySet<string>;
}

export interface BuildAuditStreamOptions {
  /** The sink whose events feed this stream. */
  sink: Pick<StreamingAuditSink, 'subscribe'>;
  /** Filters parsed from the request URL. */
  filters?: AuditStreamFilters;
  /** Abort signal — fires when the client disconnects. */
  signal?: AbortSignal;
  /**
   * Heartbeat cadence in ms. Default 15_000. Tests pass a small number
   * paired with `vi.useFakeTimers()` to assert the heartbeat frame.
   */
  heartbeatMs?: number;
  /**
   * Override `setInterval` / `clearInterval` so tests can drive the
   * heartbeat schedule with fake timers without leaking real timers.
   * Defaults to the global pair.
   */
  setInterval?: (handler: () => void, ms: number) => unknown;
  clearInterval?: (id: unknown) => void;
}

/** Default 15 seconds between heartbeat frames. */
export const DEFAULT_HEARTBEAT_MS = 15_000;

/**
 * Encode one SSE frame. Public so tests can assert exact bytes — the
 * `cir dev --tail` parser is byte-faithful (HTML5 SSE spec).
 */
export function encodeSseFrame(eventName: string, data: string): string {
  // The data field may legitimately span multiple lines (e.g. pretty-printed
  // JSON). Per the SSE spec, we MUST emit one `data:` line per source line —
  // a bare `\n` inside a data field would terminate the data run. We compact
  // to one line by JSON-encoding upstream, but be defensive in case a caller
  // hands us multi-line content.
  const dataLines = data.split('\n').map((line) => `data: ${line}`);
  return `event: ${eventName}\n${dataLines.join('\n')}\n\n`;
}

/** Returns true iff `event` should be delivered under `filters`. */
export function eventMatchesFilters(event: AuditEvent, filters: AuditStreamFilters): boolean {
  if (filters.types && !filters.types.has(event.type)) return false;
  if (filters.tenant_id !== undefined) {
    // Global events (no tenant_id) are visible to every per-tenant
    // subscriber; tenant-scoped events are gated to a matching id.
    const evtTenant = event.tenant_id;
    if (evtTenant !== undefined && evtTenant !== filters.tenant_id) return false;
  }
  return true;
}

/**
 * Parse `?type=a,b,c` into a Set. An empty / missing param returns
 * `undefined` so the caller knows to skip filtering entirely.
 */
export function parseTypesParam(raw: string | null): ReadonlySet<string> | undefined {
  if (!raw) return undefined;
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) return undefined;
  return new Set(parts);
}

/**
 * Build the streaming `Response` for the audit endpoint.
 *
 * Lifecycle:
 *   1. On `start`, subscribe to the sink with a listener that filters then
 *      enqueues an SSE frame. Also write a `: connected` comment so the
 *      browser/CLI knows the socket is up before any real event arrives.
 *   2. Schedule a heartbeat interval that writes `event: heartbeat\ndata: {}`.
 *   3. On `signal.abort` (client disconnect) or stream `cancel`, unsubscribe,
 *      clear the heartbeat, and close the controller.
 *
 * The implementation tolerates `controller.enqueue()` throwing on a closed
 * controller — that race is normal when the client drops mid-write.
 */
export function buildAuditStreamResponse(opts: BuildAuditStreamOptions): Response {
  const { sink, filters = {}, signal } = opts;
  const heartbeatMs = opts.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
  // The injected scheduler returns and accepts an opaque id; we treat the
  // type as `unknown` so tests can return any token they like (e.g. `42`)
  // without leaking Node's `Timeout` into the contract. The cast on the
  // global fallback is the price of accepting the same opaque shape.
  const setIntervalImpl: (handler: () => void, ms: number) => unknown =
    opts.setInterval ?? ((handler, ms) => globalThis.setInterval(handler, ms));
  const clearIntervalImpl: (id: unknown) => void =
    opts.clearInterval ??
    ((id) => {
      // Node's clearInterval accepts a Timeout instance; we cast the opaque
      // id back into that shape so the global signature is satisfied.
      globalThis.clearInterval(id as ReturnType<typeof setInterval>);
    });
  const encoder = new TextEncoder();

  let unsubscribe: (() => void) | null = null;
  let heartbeatId: unknown = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const safeEnqueue = (chunk: string): void => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // Controller already closed — happens on a racing disconnect.
          closed = true;
        }
      };

      const cleanup = (): void => {
        if (closed) return;
        closed = true;
        if (unsubscribe) {
          try {
            unsubscribe();
          } catch {
            // sink listener removal can't poison the close path.
          }
          unsubscribe = null;
        }
        if (heartbeatId !== null) {
          clearIntervalImpl(heartbeatId);
          heartbeatId = null;
        }
        try {
          controller.close();
        } catch {
          // already closed.
        }
      };

      // Comment line — keeps proxies (nginx, cloudflare) from buffering
      // the response while we wait for the first real event.
      safeEnqueue(': connected\n\n');

      const listener: AuditListener = (event) => {
        if (!eventMatchesFilters(event, filters)) return;
        safeEnqueue(encodeSseFrame(event.type, JSON.stringify(event)));
      };
      unsubscribe = sink.subscribe(listener);

      heartbeatId = setIntervalImpl(() => {
        safeEnqueue(encodeSseFrame('heartbeat', '{}'));
      }, heartbeatMs);

      if (signal) {
        if (signal.aborted) {
          cleanup();
        } else {
          signal.addEventListener('abort', cleanup, { once: true });
        }
      }
    },
    cancel() {
      // The consumer (or runtime) closed the stream — clean up the same
      // way an abort would. `start()`'s closure owns the cleanup; we just
      // poke it via the same path.
      closed = true;
      if (unsubscribe) {
        try {
          unsubscribe();
        } catch {
          // ignore
        }
        unsubscribe = null;
      }
      if (heartbeatId !== null) {
        clearIntervalImpl(heartbeatId);
        heartbeatId = null;
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      // Disable proxy buffering (nginx) so frames flush as they're written.
      'x-accel-buffering': 'no',
    },
  });
}
