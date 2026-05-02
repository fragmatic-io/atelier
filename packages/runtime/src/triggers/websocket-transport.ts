// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * WebSocket transport for the trigger bus.
 *
 * Sibling of `SseTriggerTransport`. SSE covers ~95% of cases; WebSocket
 * matters for proxy compatibility, bidirectional control channels, and
 * platforms (notably Cloudflare) that prefer WS over long-lived HTTP. This
 * adapter is purely additive — it never modifies the `TriggerSubscription`
 * interface, it just wraps a bus and forwards parsed `Trigger` frames into
 * `bus.emit()`.
 *
 * Wire format (text frames, one Trigger per frame):
 *
 *   client → server (optional, on connect):
 *     { "kind": "hello", "last_seen_version": 42 }
 *
 *   server → client (one Trigger per frame, JSON):
 *     { "type": "capability.schema_changed",
 *       "app_id": "mail.example.com",
 *       "capability_id": "thread.archive",
 *       "old_v": "1.0.0",
 *       "new_v": "2.0.0" }
 *
 *   server → client (heartbeat, every 30s):
 *     { "kind": "heartbeat" }
 *
 * Server contract:
 *   - Server SHOULD accept the optional hello envelope. If `last_seen_version`
 *     is present, it MAY replay missed triggers from that watermark. Servers
 *     without resume support ignore the hello — the client tolerates that.
 *   - Server SHOULD emit `{ "kind": "heartbeat" }` every 30 seconds during
 *     idle periods.
 *   - Server SHOULD send exactly one Trigger per text frame (no batching).
 *
 * Client contract:
 *   - Treats absence of any frame for 60 seconds as a stale connection,
 *     closes the socket, and reconnects through the backoff schedule.
 *   - Auto-reconnects with capped exponential backoff
 *     (default `[1000, 2000, 4000, 8000]` ms; configurable). Once the schedule
 *     is exhausted, the transport gives up and stays closed; callers can call
 *     `connect()` again to retry from the top.
 *   - Logs a single `note: reconnecting...` message per failure (mirrors the
 *     tail UX in `cir dev --tail`); silent thereafter so an outage doesn't
 *     flood the consumer.
 *
 * Lifecycle:
 *   const transport = new WebSocketTriggerTransport({
 *     url: 'wss://example.com/api/triggers/stream',
 *     bus,
 *   });
 *   transport.connect();
 *   // ... later ...
 *   transport.close();
 *
 * `connect()` is idempotent (no-op if already open or scheduled). `close()`
 * is safe to call multiple times.
 *
 * Tests inject a fake `WebSocket` implementation via `opts.webSocketImpl`.
 */

import type { Trigger } from '@atelier/schemas';
import type { TriggerSubscription } from './subscription.js';

/** Subset of the WHATWG WebSocket interface this transport depends on. */
export interface WebSocketLike {
  readonly readyState: number;
  onopen: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export type WebSocketCtor = new (url: string, protocols?: string | string[]) => WebSocketLike;

/** Hello message shape the client sends on connect. */
export interface WebSocketHello {
  /**
   * Highest manifest/registry version the client has already applied. A server
   * with replay support resumes from `last_seen_version + 1`; a server without
   * replay ignores this field.
   */
  last_seen_version?: number;
}

export interface WebSocketTriggerTransportOptions {
  /** WebSocket endpoint URL (`ws://` or `wss://`). */
  url: string;
  /** The local bus that `emit()` is forwarded to. */
  bus: TriggerSubscription;
  /** Optional sub-protocols passed to the WebSocket constructor. */
  protocols?: string | string[];
  /**
   * Optional WebSocket constructor. Defaults to `globalThis.WebSocket` (Node
   * 22 ships one natively; the browser provides one). Tests inject a fake.
   */
  webSocketImpl?: WebSocketCtor;
  /**
   * Backoff delays (ms) used in order on each reconnect attempt. Once the
   * schedule is exhausted, the transport gives up. Default
   * `[1000, 2000, 4000, 8000]` — capped exponential, matching `dev-tail`.
   */
  reconnectBackoffMs?: number[];
  /**
   * Optional hello envelope sent on each successful connect. Carries the
   * client's last-seen version so servers can replay or skip. Purely
   * additive — servers without resume support ignore it.
   */
  hello?: WebSocketHello;
  /**
   * Idle timeout (ms). If no frame arrives within this window, the socket is
   * considered stale, closed, and reconnected. Default 60_000 ms (matches the
   * 30 s server heartbeat × 2).
   */
  idleTimeoutMs?: number;
  /** Optional callback when connection opens. */
  onOpen?: () => void;
  /** Optional callback on connection error. */
  onError?: (err: unknown) => void;
  /** Optional callback when a malformed payload arrives. Default: silent. */
  onParseError?: (raw: string, err: unknown) => void;
  /**
   * Optional logger for the single `note: reconnecting...` line per failure.
   * Defaults to a no-op so the transport stays headless by default.
   */
  log?: (msg: string) => void;
  /**
   * Sleep shim used by the reconnect loop. Defaults to `setTimeout`. Tests
   * inject a controllable scheduler.
   */
  setTimeoutImpl?: (cb: () => void, ms: number) => unknown;
  /** Companion to `setTimeoutImpl`. Defaults to `clearTimeout`. */
  clearTimeoutImpl?: (handle: unknown) => void;
}

/** Default backoff schedule (ms). Capped exponential — see `dev-tail.ts`. */
export const DEFAULT_WS_RECONNECT_BACKOFF_MS: readonly number[] = [1000, 2000, 4000, 8000];

/** Default idle timeout (ms). 2× the documented 30 s server heartbeat. */
export const DEFAULT_WS_IDLE_TIMEOUT_MS = 60_000;

const READY_STATE_OPEN = 1;
const READY_STATE_CLOSED = 3;

export class WebSocketTriggerTransport {
  readonly #url: string;
  readonly #bus: TriggerSubscription;
  readonly #protocols: string | string[] | undefined;
  readonly #WebSocketImpl: WebSocketCtor | undefined;
  readonly #backoff: readonly number[];
  readonly #hello: WebSocketHello | undefined;
  readonly #idleTimeoutMs: number;
  readonly #onOpen: (() => void) | undefined;
  readonly #onError: ((err: unknown) => void) | undefined;
  readonly #onParseError: ((raw: string, err: unknown) => void) | undefined;
  readonly #log: (msg: string) => void;
  readonly #setTimeout: (cb: () => void, ms: number) => unknown;
  readonly #clearTimeout: (handle: unknown) => void;

  #ws: WebSocketLike | null = null;
  #closed = false;
  #attempt = 0;
  #reconnectHandle: unknown = null;
  #idleHandle: unknown = null;
  #printedReconnectingOnce = false;

  constructor(opts: WebSocketTriggerTransportOptions) {
    this.#url = opts.url;
    this.#bus = opts.bus;
    this.#protocols = opts.protocols;
    this.#WebSocketImpl =
      opts.webSocketImpl ??
      (typeof globalThis !== 'undefined' &&
      'WebSocket' in globalThis &&
      typeof (globalThis as { WebSocket?: unknown }).WebSocket === 'function'
        ? (globalThis as unknown as { WebSocket: WebSocketCtor }).WebSocket
        : undefined);
    this.#backoff =
      opts.reconnectBackoffMs && opts.reconnectBackoffMs.length > 0
        ? [...opts.reconnectBackoffMs]
        : DEFAULT_WS_RECONNECT_BACKOFF_MS;
    this.#hello = opts.hello;
    this.#idleTimeoutMs = opts.idleTimeoutMs ?? DEFAULT_WS_IDLE_TIMEOUT_MS;
    this.#onOpen = opts.onOpen;
    this.#onError = opts.onError;
    this.#onParseError = opts.onParseError;
    this.#log = opts.log ?? ((): void => {});
    this.#setTimeout =
      opts.setTimeoutImpl ?? ((cb: () => void, ms: number): unknown => setTimeout(cb, ms));
    this.#clearTimeout =
      opts.clearTimeoutImpl ??
      ((handle: unknown): void => {
        clearTimeout(handle as ReturnType<typeof setTimeout>);
      });
  }

  /** Connection state, mirroring WebSocket semantics. */
  get readyState(): number {
    return this.#ws?.readyState ?? READY_STATE_CLOSED;
  }

  /** Open the WebSocket connection. No-op if already open or closed. */
  connect(): void {
    if (this.#ws || this.#closed || this.#reconnectHandle) return;
    if (!this.#WebSocketImpl) {
      throw new Error(
        'WebSocketTriggerTransport: no WebSocket available. In Node < 22, pass webSocketImpl explicitly.',
      );
    }
    this.#openSocket();
  }

  /** Close the connection. Idempotent. Cancels any pending reconnect. */
  close(): void {
    this.#closed = true;
    this.#cancelReconnect();
    this.#cancelIdle();
    if (this.#ws) {
      try {
        this.#ws.close();
      } catch {
        // Defensive: a fake socket might throw; we still want to drop the ref.
      }
      this.#ws = null;
    }
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  #openSocket(): void {
    if (!this.#WebSocketImpl) return;
    const Ctor = this.#WebSocketImpl;
    let ws: WebSocketLike;
    try {
      ws =
        this.#protocols === undefined ? new Ctor(this.#url) : new Ctor(this.#url, this.#protocols);
    } catch (err) {
      this.#onError?.(err);
      this.#scheduleReconnect(err);
      return;
    }
    this.#ws = ws;
    ws.onopen = (): void => this.#handleOpen();
    ws.onclose = (ev: unknown): void => this.#handleClose(ev);
    ws.onerror = (err: unknown): void => this.#onError?.(err);
    ws.onmessage = (ev: { data: unknown }): void => this.#handleMessage(ev);
  }

  #handleOpen(): void {
    this.#attempt = 0;
    this.#printedReconnectingOnce = false;
    if (this.#hello) {
      try {
        const helloFrame = JSON.stringify({
          kind: 'hello',
          ...this.#hello,
        });
        this.#ws?.send(helloFrame);
      } catch (err) {
        this.#onError?.(err);
      }
    }
    this.#onOpen?.();
    this.#armIdleTimer();
  }

  #handleClose(ev: unknown): void {
    if (this.#closed) return;
    this.#cancelIdle();
    this.#ws = null;
    this.#scheduleReconnect(ev);
  }

  #handleMessage(ev: { data: unknown }): void {
    this.#armIdleTimer();
    const raw = ev.data;
    if (typeof raw !== 'string') {
      // Binary frames are not part of the contract — ignore.
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      this.#onParseError?.(raw, err);
      return;
    }
    if (!parsed || typeof parsed !== 'object') {
      this.#onParseError?.(raw, new Error('not a trigger envelope'));
      return;
    }
    const kind = (parsed as { kind?: unknown }).kind;
    if (kind === 'heartbeat') {
      // Heartbeat already armed the idle timer above. Nothing else to do.
      return;
    }
    if (typeof (parsed as { type?: unknown }).type !== 'string') {
      this.#onParseError?.(raw, new Error('not a trigger envelope'));
      return;
    }
    void this.#bus.emit(parsed as Trigger);
  }

  #armIdleTimer(): void {
    this.#cancelIdle();
    if (this.#idleTimeoutMs <= 0) return;
    this.#idleHandle = this.#setTimeout(() => {
      this.#idleHandle = null;
      // No frame for the configured window: treat as stale, force reconnect.
      const stale = this.#ws;
      this.#ws = null;
      if (stale) {
        try {
          stale.close();
        } catch {
          // ignore — we're tearing down anyway.
        }
      }
      this.#scheduleReconnect(new Error('idle timeout'));
    }, this.#idleTimeoutMs);
  }

  #cancelIdle(): void {
    if (this.#idleHandle !== null) {
      this.#clearTimeout(this.#idleHandle);
      this.#idleHandle = null;
    }
  }

  #scheduleReconnect(reason: unknown): void {
    if (this.#closed || this.#reconnectHandle) return;
    if (this.#attempt >= this.#backoff.length) {
      // Schedule exhausted — give up. A future caller can `connect()` again
      // from a clean state by first calling `close()` on a fresh instance.
      return;
    }
    const delay = this.#backoff[this.#attempt] ?? 0;
    this.#attempt += 1;
    if (!this.#printedReconnectingOnce) {
      const reasonText =
        reason instanceof Error
          ? reason.message
          : typeof reason === 'string'
            ? reason
            : 'connection lost';
      this.#log(`note: reconnecting... (${reasonText})`);
      this.#printedReconnectingOnce = true;
    }
    this.#reconnectHandle = this.#setTimeout(() => {
      this.#reconnectHandle = null;
      if (this.#closed) return;
      this.#openSocket();
    }, delay);
  }

  #cancelReconnect(): void {
    if (this.#reconnectHandle !== null) {
      this.#clearTimeout(this.#reconnectHandle);
      this.#reconnectHandle = null;
    }
  }
}

/** Open WebSocket `readyState` constant — exported for callers/tests. */
export const WEBSOCKET_READY_STATE_OPEN = READY_STATE_OPEN;
/** Closed WebSocket `readyState` constant — exported for callers/tests. */
export const WEBSOCKET_READY_STATE_CLOSED = READY_STATE_CLOSED;
