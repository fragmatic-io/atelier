// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Server-side trigger bus singleton. Holds connected SSE clients and
 * broadcasts trigger payloads to all of them.
 *
 * Survives hot reload via globalThis. Cleared when the Next.js server
 * restarts. In a real deployment this would be replaced by a real broker
 * (Redis pub/sub, NATS, etc.) — the SSE endpoints in `app/api/triggers/`
 * are thin shims over this singleton.
 */

const KEY = '__cir_demo_trigger_clients';
type GlobalWithBus = typeof globalThis & {
  [KEY]?: Set<ReadableStreamDefaultController<Uint8Array>>;
};
const g = globalThis as GlobalWithBus;

const clients = (): Set<ReadableStreamDefaultController<Uint8Array>> => {
  if (!g[KEY]) g[KEY] = new Set();
  return g[KEY];
};

const encoder = new TextEncoder();

export function addClient(c: ReadableStreamDefaultController<Uint8Array>): void {
  clients().add(c);
}

export function removeClient(c: ReadableStreamDefaultController<Uint8Array>): void {
  clients().delete(c);
}

export function broadcast(event: unknown): number {
  const payload = encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
  let delivered = 0;
  for (const c of clients()) {
    try {
      c.enqueue(payload);
      delivered += 1;
    } catch {
      // Closed controller; drop it.
      clients().delete(c);
    }
  }
  return delivered;
}
