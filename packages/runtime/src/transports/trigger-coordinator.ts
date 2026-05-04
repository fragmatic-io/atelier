// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `createTriggerCoordinator()` — a small Node HTTP request handler that
 * fans out POSTed triggers to every connected SSE client. Pair with
 * `SseTriggerTransport` on the host side; mount under any path the host
 * chooses. The API surface here is path-relative.
 *
 * State is in-memory — triggers are ephemeral by design. There is NO
 * persistence, NO replay, NO durability. A coordinator restart drops every
 * subscriber; clients reconnect (EventSource auto-reconnects) and resume
 * receiving from the next published trigger forward. Hosts that need
 * durable delivery wire a different transport (Redis, NATS, …) — those are
 * host responsibilities.
 *
 * Endpoints (path-relative; the host strips its own prefix):
 *   POST /triggers/publish    — body is a `TriggerEnvelope` JSON.
 *                                Returns 202 { ok: true }. Body shape:
 *                                  { origin_node_id: string, trigger: Trigger }
 *   GET  /triggers/subscribe  — SSE stream. Emits one `event: trigger\n
 *                                data: <envelope-json>\n\n` frame per
 *                                published trigger. Origin header preserved
 *                                so subscribers can drop self-echoes.
 *   GET  /triggers/health     — JSON `{ subscribers: N, lastPublishedAt: ISO|null }`.
 *
 * Wire envelope (deliberately matches `TriggerEnvelope` from the transport
 * interface — keeps the SSE client + coordinator byte-compatible):
 *
 *   { "origin_node_id": "<uuid>",
 *     "trigger": { "type": "capability.changed", ... } }
 *
 * Why path-relative:
 *   Hosts mount the coordinator under whatever route fits — Next.js
 *   `/api/atelier/`, an Express router at `/internal/triggers/`, raw Node
 *   on `:9100/`. The handler dispatches on `req.url` after the host's
 *   prefix is stripped (`stripPrefix` option). When `stripPrefix` is
 *   omitted the handler matches against the full `req.url`.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { TriggerEnvelope } from '../triggers/trigger-transport.js';

/** Heartbeat comment frame. Keeps proxies from idling the connection. */
const HEARTBEAT_FRAME = ': keep-alive\n\n';

/** Default heartbeat interval. */
const DEFAULT_HEARTBEAT_MS = 25_000;

export interface TriggerCoordinatorOptions {
  /**
   * Path prefix to strip before route matching. Default: empty string
   * (match the full request url).
   */
  stripPrefix?: string;
  /**
   * Heartbeat interval in milliseconds. SSE connections receive a `:` comment
   * frame at this cadence to keep proxies + load balancers from closing the
   * stream. Default: 25 seconds. Pass 0 to disable.
   */
  heartbeatMs?: number;
  /**
   * Optional listener invoked after a trigger is fanned out. Useful for
   * audit / metrics. Errors thrown here are swallowed.
   */
  onPublish?: (envelope: TriggerEnvelope) => void;
  /**
   * Optional listener for malformed POST bodies. Default: silent.
   */
  onParseError?: (raw: string, err: unknown) => void;
}

export interface TriggerCoordinator {
  /** Mountable Node HTTP request handler. */
  handler: (req: IncomingMessage, res: ServerResponse) => void;
  /** Current SSE subscriber count. */
  subscriberCount(): number;
  /** ISO timestamp of the most recent published trigger, or null. */
  lastPublishedAt(): string | null;
  /**
   * Close every active SSE connection and release the heartbeat interval.
   * Idempotent. Hosts call this during shutdown so the process can exit.
   */
  close(): void;
}

interface SseClient {
  res: ServerResponse;
  heartbeat: NodeJS.Timeout | null;
}

/**
 * Strip a prefix from a request url. Returns null when the url doesn't
 * start with the prefix (caller should 404 in that case).
 */
function stripPrefix(url: string, prefix: string): string | null {
  if (!prefix) return url;
  if (!url.startsWith(prefix)) return null;
  const rest = url.slice(prefix.length);
  return rest.startsWith('/') ? rest : `/${rest}`;
}

/** Read the full request body as utf-8. Caps at 1 MiB to avoid OOM. */
async function readBody(req: IncomingMessage, limit = 1 << 20): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > limit) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

function parseEnvelope(raw: string): TriggerEnvelope | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const env = parsed as Partial<TriggerEnvelope>;
  if (typeof env.origin_node_id !== 'string') return null;
  if (
    !env.trigger ||
    typeof env.trigger !== 'object' ||
    typeof (env.trigger as { type?: unknown }).type !== 'string'
  ) {
    return null;
  }
  return { origin_node_id: env.origin_node_id, trigger: env.trigger };
}

export function createTriggerCoordinator(opts: TriggerCoordinatorOptions = {}): TriggerCoordinator {
  const prefix = opts.stripPrefix ?? '';
  const heartbeatMs = opts.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
  const onPublish = opts.onPublish;
  const onParseError = opts.onParseError;
  const clients = new Set<SseClient>();
  let lastPublishedAt: string | null = null;
  let closed = false;

  const broadcast = (envelope: TriggerEnvelope): void => {
    const frame = `event: trigger\ndata: ${JSON.stringify(envelope)}\n\n`;
    for (const client of clients) {
      try {
        client.res.write(frame);
      } catch {
        // Best-effort. The 'close' listener will tear down dead clients.
      }
    }
  };

  const removeClient = (client: SseClient): void => {
    if (client.heartbeat) clearInterval(client.heartbeat);
    clients.delete(client);
  };

  const handlePublish = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    let raw: string;
    try {
      raw = await readBody(req);
    } catch {
      res.writeHead(413, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'payload too large' }));
      return;
    }
    const envelope = parseEnvelope(raw);
    if (!envelope) {
      onParseError?.(raw, new Error('invalid trigger envelope'));
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'invalid trigger envelope' }));
      return;
    }
    lastPublishedAt = new Date().toISOString();
    broadcast(envelope);
    try {
      onPublish?.(envelope);
    } catch {
      // Listener errors are not the publisher's problem.
    }
    res.writeHead(202, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  };

  const handleSubscribe = (req: IncomingMessage, res: ServerResponse): void => {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    // Initial comment frame so the client EventSource fires `open` promptly.
    res.write(': open\n\n');
    const client: SseClient = {
      res,
      heartbeat:
        heartbeatMs > 0
          ? setInterval(() => {
              try {
                res.write(HEARTBEAT_FRAME);
              } catch {
                removeClient(client);
              }
            }, heartbeatMs)
          : null,
    };
    clients.add(client);
    const teardown = (): void => {
      removeClient(client);
      try {
        res.end();
      } catch {
        // Already closed.
      }
    };
    req.on('close', teardown);
    req.on('error', teardown);
  };

  const handleHealth = (_req: IncomingMessage, res: ServerResponse): void => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        subscribers: clients.size,
        lastPublishedAt,
      }),
    );
  };

  const handler = (req: IncomingMessage, res: ServerResponse): void => {
    if (closed) {
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'coordinator closed' }));
      return;
    }
    const url = req.url ?? '/';
    const path = stripPrefix(url, prefix);
    if (path === null) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'not found' }));
      return;
    }
    // Strip query string for matching.
    const matchPath = path.split('?')[0] ?? path;
    const method = (req.method ?? 'GET').toUpperCase();
    if (matchPath === '/triggers/publish' && method === 'POST') {
      void handlePublish(req, res);
      return;
    }
    if (matchPath === '/triggers/subscribe' && method === 'GET') {
      handleSubscribe(req, res);
      return;
    }
    if (matchPath === '/triggers/health' && method === 'GET') {
      handleHealth(req, res);
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'not found' }));
  };

  return {
    handler,
    subscriberCount: () => clients.size,
    lastPublishedAt: () => lastPublishedAt,
    close: () => {
      if (closed) return;
      closed = true;
      for (const client of Array.from(clients)) {
        if (client.heartbeat) clearInterval(client.heartbeat);
        try {
          client.res.end();
        } catch {
          // Already closed.
        }
      }
      clients.clear();
    },
  };
}
