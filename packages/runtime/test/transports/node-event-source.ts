// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Minimal Node EventSource shim for tests.
 *
 * Node 18+ does NOT ship a built-in `EventSource`. The `eventsource` npm
 * package would work but is overkill for an integration test — we only
 * need to parse the SSE wire format the coordinator emits (`event: <name>\n
 * data: <json>\n\n` and `:` heartbeat comments). This shim does exactly
 * that, exposes the `EventSourceLike` shape the transport depends on,
 * and re-emits parsed frames as either `onmessage` (for unnamed events)
 * or via `addEventListener('<name>', …)` for named events.
 *
 * `installNodeEventSource()` mounts the shim on `globalThis.EventSource`
 * so the production transport's auto-detection picks it up; the
 * `uninstall…()` companion restores the prior value on teardown.
 *
 * Auto-reconnect, last-event-id, and binary frames are NOT implemented —
 * tests don't need them.
 */

import { request, type ClientRequest, type IncomingMessage } from 'node:http';

interface InstalledState {
  prior: unknown;
  hadProperty: boolean;
}

let installed: InstalledState | null = null;

const CONNECTING = 0;
const OPEN = 1;
const CLOSED = 2;

type Listener = (ev: { data: string }) => void;

class NodeEventSource {
  static readonly CONNECTING = CONNECTING;
  static readonly OPEN = OPEN;
  static readonly CLOSED = CLOSED;

  readyState = CONNECTING;
  onmessage: Listener | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onopen: ((ev: unknown) => void) | null = null;
  readonly #listeners = new Map<string, Set<Listener>>();
  #req: ClientRequest | null = null;
  #buffer = '';

  constructor(url: string) {
    const parsed = new URL(url);
    this.#req = request(
      {
        method: 'GET',
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        headers: { accept: 'text/event-stream' },
      },
      (res: IncomingMessage) => {
        this.readyState = OPEN;
        this.onopen?.({});
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          this.#buffer += chunk;
          this.#drainFrames();
        });
        res.on('end', () => {
          this.readyState = CLOSED;
        });
        res.on('error', (err) => {
          this.onerror?.(err);
        });
      },
    );
    this.#req.on('error', (err) => {
      this.readyState = CLOSED;
      this.onerror?.(err);
    });
    this.#req.end();
  }

  addEventListener(type: string, listener: Listener): void {
    let bucket = this.#listeners.get(type);
    if (!bucket) {
      bucket = new Set();
      this.#listeners.set(type, bucket);
    }
    bucket.add(listener);
  }

  close(): void {
    this.readyState = CLOSED;
    try {
      this.#req?.destroy();
    } catch {
      // Already torn down.
    }
    this.#req = null;
  }

  #drainFrames(): void {
    // SSE frames are separated by blank lines (`\n\n`). Per spec we should
    // also accept `\r\n\r\n`, but the coordinator only emits `\n` so the
    // test shim narrows accordingly.
    let idx = this.#buffer.indexOf('\n\n');
    while (idx !== -1) {
      const frame = this.#buffer.slice(0, idx);
      this.#buffer = this.#buffer.slice(idx + 2);
      this.#dispatchFrame(frame);
      idx = this.#buffer.indexOf('\n\n');
    }
  }

  #dispatchFrame(frame: string): void {
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of frame.split('\n')) {
      if (line.startsWith(':') || line.length === 0) continue; // comment / blank
      const colon = line.indexOf(':');
      const field = colon === -1 ? line : line.slice(0, colon);
      const valueRaw = colon === -1 ? '' : line.slice(colon + 1);
      const value = valueRaw.startsWith(' ') ? valueRaw.slice(1) : valueRaw;
      if (field === 'event') event = value;
      else if (field === 'data') dataLines.push(value);
    }
    if (dataLines.length === 0) return;
    const ev = { data: dataLines.join('\n') };
    if (event === 'message') {
      this.onmessage?.(ev);
    }
    const bucket = this.#listeners.get(event);
    if (bucket) {
      for (const listener of bucket) {
        try {
          listener(ev);
        } catch {
          // Test shim — listener errors don't tear down the connection.
        }
      }
    }
  }
}

/** Install the shim on globalThis.EventSource. Idempotent. */
export function installNodeEventSource(): void {
  if (installed) return;
  const g = globalThis as Record<string, unknown>;
  installed = {
    prior: g['EventSource'],
    hadProperty: 'EventSource' in g,
  };
  g['EventSource'] = NodeEventSource;
}

/** Restore globalThis.EventSource to its prior state. Idempotent. */
export function uninstallNodeEventSource(): void {
  if (!installed) return;
  const g = globalThis as Record<string, unknown>;
  if (installed.hadProperty) {
    g['EventSource'] = installed.prior;
  } else {
    delete g['EventSource'];
  }
  installed = null;
}

export { NodeEventSource };
