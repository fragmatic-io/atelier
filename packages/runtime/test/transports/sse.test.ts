// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * SSE transport integration test. Spawns a real Node `http.Server`
 * wrapping the coordinator handler, attaches an `SseTriggerTransport`,
 * publishes a trigger, asserts the SSE-stream-delivered envelope is
 * byte-equal to what we sent.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Trigger } from '@atelier/schemas';
import { SseTriggerTransport } from '../../src/transports/sse-trigger-transport.js';
import {
  createTriggerCoordinator,
  type TriggerCoordinator,
} from '../../src/transports/trigger-coordinator.js';
import { startCoordinatorServer, type CoordinatorHandle } from './coordinator-helpers.js';
import { installNodeEventSource, uninstallNodeEventSource } from './node-event-source.js';

const SAMPLE: Trigger = {
  type: 'capability.changed',
  app_id: 'mail.example.com',
  capability_id: 'thread.archive',
  old_v: '1.0.0',
  new_v: '2.0.0',
};

const INTENT_SAMPLE: Trigger = {
  type: 'intent.lens_switched',
  user_id: 'vid',
  app: 'mail.example.com',
  lens: 'founder_inbox',
};

async function tick(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe('SseTriggerTransport (integration)', () => {
  let coord: TriggerCoordinator;
  let handle: CoordinatorHandle;

  beforeAll(() => {
    installNodeEventSource();
  });
  afterAll(() => {
    uninstallNodeEventSource();
  });
  beforeEach(async () => {
    coord = createTriggerCoordinator({ heartbeatMs: 0 });
    handle = await startCoordinatorServer(coord);
  });
  afterEach(async () => {
    coord.close();
    await handle.close();
  });

  it('publish → SSE → subscriber receives byte-equal trigger', async () => {
    const received: Trigger[] = [];
    const meta: Array<{ originNodeId?: string }> = [];
    const transport = new SseTriggerTransport({ endpoint: handle.url });
    transport.subscribe((t, m) => {
      received.push(t);
      meta.push(m ?? {});
    });
    await tick();
    await transport.publish(SAMPLE, 'origin-publisher');
    await tick();
    expect(received).toEqual([SAMPLE]);
    expect(meta[0]?.originNodeId).toBe('origin-publisher');
    await transport.close();
  });

  it('round-trips multiple triggers in order', async () => {
    const received: Trigger[] = [];
    const transport = new SseTriggerTransport({ endpoint: handle.url });
    transport.subscribe((t) => {
      received.push(t);
    });
    await tick();
    await transport.publish(SAMPLE, 'origin-A');
    await transport.publish(INTENT_SAMPLE, 'origin-A');
    await tick();
    expect(received).toEqual([SAMPLE, INTENT_SAMPLE]);
    await transport.close();
  });

  it('reports subscriber count to /triggers/health', async () => {
    const transport = new SseTriggerTransport({ endpoint: handle.url });
    transport.subscribe(() => {});
    await tick();
    const res = await fetch(`${handle.url}/triggers/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { subscribers: number };
    expect(body.subscribers).toBeGreaterThanOrEqual(1);
    await transport.close();
  });

  it('publish() throws when the coordinator returns non-2xx', async () => {
    coord.close();
    await handle.close();
    const transport = new SseTriggerTransport({ endpoint: handle.url });
    await expect(transport.publish(SAMPLE, 'origin-A')).rejects.toThrow();
    await transport.close();
    // re-spin so afterEach close works
    coord = createTriggerCoordinator({ heartbeatMs: 0 });
    handle = await startCoordinatorServer(coord);
  });

  it('close() detaches the SSE stream', async () => {
    const transport = new SseTriggerTransport({ endpoint: handle.url });
    const received: Trigger[] = [];
    transport.subscribe((t) => {
      received.push(t);
    });
    await tick();
    await transport.close();
    // After close, even if a publish lands at the coordinator, our shim
    // is gone and the local handler list is empty.
    await tick();
    const res = await fetch(`${handle.url}/triggers/health`);
    const body = (await res.json()) as { subscribers: number };
    expect(body.subscribers).toBe(0);
    expect(received).toEqual([]);
  });
});
