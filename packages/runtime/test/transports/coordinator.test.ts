// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Coordinator handler tests. Cover the three endpoints (`/triggers/publish`,
 * `/triggers/subscribe`, `/triggers/health`), payload validation, the
 * `stripPrefix` mount point, and shutdown cleanup.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Trigger } from '@atelier/schemas';
import {
  createTriggerCoordinator,
  type TriggerCoordinator,
} from '../../src/transports/trigger-coordinator.js';
import { startCoordinatorServer, type CoordinatorHandle } from './coordinator-helpers.js';

const SAMPLE: Trigger = {
  type: 'capability.changed',
  app_id: 'mail.example.com',
  capability_id: 'thread.archive',
  old_v: '1.0.0',
  new_v: '2.0.0',
};

async function withCoordinator<T>(
  opts: Parameters<typeof createTriggerCoordinator>[0] | undefined,
  fn: (handle: CoordinatorHandle, coord: TriggerCoordinator) => Promise<T>,
): Promise<T> {
  const coord = createTriggerCoordinator(opts);
  const handle = await startCoordinatorServer(coord);
  try {
    return await fn(handle, coord);
  } finally {
    coord.close();
    await handle.close();
  }
}

describe('createTriggerCoordinator', () => {
  let coord: TriggerCoordinator;
  let handle: CoordinatorHandle;

  beforeEach(async () => {
    coord = createTriggerCoordinator({ heartbeatMs: 0 });
    handle = await startCoordinatorServer(coord);
  });
  afterEach(async () => {
    coord.close();
    await handle.close();
  });

  it('GET /triggers/health reports zero subscribers initially', async () => {
    const res = await fetch(`${handle.url}/triggers/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      subscribers: number;
      lastPublishedAt: string | null;
    };
    expect(body.subscribers).toBe(0);
    expect(body.lastPublishedAt).toBeNull();
  });

  it('POST /triggers/publish returns 202 and updates lastPublishedAt', async () => {
    const res = await fetch(`${handle.url}/triggers/publish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ origin_node_id: 'A', trigger: SAMPLE }),
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    const health = await fetch(`${handle.url}/triggers/health`);
    const healthBody = (await health.json()) as { lastPublishedAt: string | null };
    expect(healthBody.lastPublishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('POST /triggers/publish rejects malformed envelopes with 400', async () => {
    const res = await fetch(`${handle.url}/triggers/publish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ trigger: SAMPLE }), // missing origin_node_id
    });
    expect(res.status).toBe(400);
  });

  it('POST /triggers/publish rejects non-JSON', async () => {
    const res = await fetch(`${handle.url}/triggers/publish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json',
    });
    expect(res.status).toBe(400);
  });

  it('unknown route returns 404', async () => {
    const res = await fetch(`${handle.url}/no/such/path`);
    expect(res.status).toBe(404);
  });

  it('wrong method on /triggers/publish returns 404', async () => {
    const res = await fetch(`${handle.url}/triggers/publish`); // GET
    expect(res.status).toBe(404);
  });

  it('GET /triggers/subscribe streams an event for each publish', async () => {
    // Pull the SSE stream manually so we can read the raw bytes.
    const ac = new AbortController();
    const subRes = await fetch(`${handle.url}/triggers/subscribe`, {
      signal: ac.signal,
    });
    expect(subRes.status).toBe(200);
    expect(subRes.headers.get('content-type')).toMatch(/text\/event-stream/);
    const reader = (subRes.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    // Wait until the coordinator registers our subscriber.
    for (let i = 0; i < 20; i++) {
      const h = await fetch(`${handle.url}/triggers/health`);
      const b = (await h.json()) as { subscribers: number };
      if (b.subscribers >= 1) break;
      await new Promise((r) => setTimeout(r, 5));
    }
    await fetch(`${handle.url}/triggers/publish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ origin_node_id: 'pub', trigger: SAMPLE }),
    });
    let buffer = '';
    let frame = '';
    for (let i = 0; i < 100; i++) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const idx = buffer.indexOf('event: trigger\n');
      if (idx !== -1) {
        const end = buffer.indexOf('\n\n', idx);
        if (end !== -1) {
          frame = buffer.slice(idx, end);
          break;
        }
      }
    }
    expect(frame).toContain('event: trigger');
    expect(frame).toContain('data:');
    const dataLine = frame.split('\n').find((l) => l.startsWith('data: '));
    expect(dataLine).toBeDefined();
    const parsed = JSON.parse(dataLine!.slice('data: '.length)) as {
      origin_node_id: string;
      trigger: Trigger;
    };
    expect(parsed.origin_node_id).toBe('pub');
    expect(parsed.trigger).toEqual(SAMPLE);
    ac.abort();
    try {
      await reader.cancel();
    } catch {
      // already aborted
    }
  });

  it('close() rejects subsequent requests with 503', async () => {
    coord.close();
    const res = await fetch(`${handle.url}/triggers/health`);
    expect(res.status).toBe(503);
  });
});

describe('createTriggerCoordinator — stripPrefix', () => {
  it('matches paths after stripping the configured prefix', async () => {
    await withCoordinator({ stripPrefix: '/api/atelier', heartbeatMs: 0 }, async (h) => {
      const ok = await fetch(`${h.url}/api/atelier/triggers/health`);
      expect(ok.status).toBe(200);
      const miss = await fetch(`${h.url}/triggers/health`);
      expect(miss.status).toBe(404);
    });
  });

  it('publishes through the prefixed path', async () => {
    await withCoordinator({ stripPrefix: '/internal', heartbeatMs: 0 }, async (h) => {
      const res = await fetch(`${h.url}/internal/triggers/publish`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ origin_node_id: 'A', trigger: SAMPLE }),
      });
      expect(res.status).toBe(202);
    });
  });
});

describe('createTriggerCoordinator — onPublish hook', () => {
  it('invokes onPublish with the parsed envelope', async () => {
    const seen: Array<{ origin_node_id: string; trigger: Trigger }> = [];
    await withCoordinator({ heartbeatMs: 0, onPublish: (e) => seen.push(e) }, async (h) => {
      await fetch(`${h.url}/triggers/publish`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ origin_node_id: 'A', trigger: SAMPLE }),
      });
      expect(seen).toHaveLength(1);
      expect(seen[0]?.origin_node_id).toBe('A');
    });
  });
});
