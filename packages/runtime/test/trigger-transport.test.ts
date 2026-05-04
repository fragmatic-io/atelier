// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Shared `TriggerTransport` compliance suite. Every reference impl runs
 * the same scenarios so we can catch contract drift in CI:
 *
 *   - publish → subscribe(handler) delivers the trigger to handler
 *   - the meta arg carries the originNodeId we passed to publish
 *   - multiple subscribers each receive every published trigger
 *   - unsubscribe stops further deliveries to that handler
 *   - close() makes publish() / subscribe() no-op gracefully
 *
 * Network-level concerns (HTTP framing, SSE format, …) live in the
 * impl-specific suites under test/transports/.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Trigger } from '@atelier/schemas';
import { InMemoryTriggerBus } from '../src/triggers/memory-bus.js';
import { InMemoryTriggerTransport } from '../src/transports/in-memory-trigger-transport.js';
import { SseTriggerTransport } from '../src/transports/sse-trigger-transport.js';
import { createTriggerCoordinator } from '../src/transports/trigger-coordinator.js';
import {
  startCoordinatorServer,
  type CoordinatorHandle,
} from './transports/coordinator-helpers.js';
import {
  installNodeEventSource,
  uninstallNodeEventSource,
} from './transports/node-event-source.js';
import type {
  TriggerTransport,
  TriggerTransportHandler,
} from '../src/triggers/trigger-transport.js';

const SAMPLE: Trigger = {
  type: 'capability.changed',
  app_id: 'mail.example.com',
  capability_id: 'thread.archive',
  old_v: '1.0.0',
  new_v: '2.0.0',
};

interface Harness {
  transport: TriggerTransport;
  /** Wait until at least one inbound delivery has been observed. */
  flush?: () => Promise<void>;
  teardown: () => Promise<void>;
}

function makeInMemoryHarness(): Promise<Harness> {
  const transport = new InMemoryTriggerTransport();
  return Promise.resolve({
    transport,
    teardown: async () => {
      await transport.close();
    },
  });
}

async function makeSseHarness(): Promise<Harness> {
  const coord = createTriggerCoordinator();
  const handle: CoordinatorHandle = await startCoordinatorServer(coord);
  installNodeEventSource();
  const transport = new SseTriggerTransport({ endpoint: handle.url });
  return {
    transport,
    flush: async () => {
      // SSE delivery is async — give the loop a couple of ticks to drain.
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 5));
      }
    },
    teardown: async () => {
      await transport.close();
      uninstallNodeEventSource();
      coord.close();
      await handle.close();
    },
  };
}

const SUITES: Array<{ name: string; make: () => Promise<Harness> }> = [
  { name: 'InMemoryTriggerTransport', make: makeInMemoryHarness },
  { name: 'SseTriggerTransport', make: makeSseHarness },
];

for (const suite of SUITES) {
  describe(`TriggerTransport contract — ${suite.name}`, () => {
    let harness: Harness;

    beforeEach(async () => {
      harness = await suite.make();
    });
    afterEach(async () => {
      await harness.teardown();
    });

    it('delivers published triggers to subscribed handlers', async () => {
      const received: Trigger[] = [];
      const handler: TriggerTransportHandler = (t) => {
        received.push(t);
      };
      harness.transport.subscribe(handler);
      // Give the inbound stream a moment to wire up (SSE).
      await harness.flush?.();
      await harness.transport.publish(SAMPLE, 'origin-A');
      await harness.flush?.();
      expect(received).toEqual([SAMPLE]);
    });

    it('passes the originNodeId via meta', async () => {
      const seen: Array<{ originNodeId?: string }> = [];
      harness.transport.subscribe((_t, meta) => {
        seen.push(meta ?? {});
      });
      await harness.flush?.();
      await harness.transport.publish(SAMPLE, 'origin-XYZ');
      await harness.flush?.();
      expect(seen).toHaveLength(1);
      expect(seen[0]?.originNodeId).toBe('origin-XYZ');
    });

    it('delivers to multiple subscribers', async () => {
      const a: Trigger[] = [];
      const b: Trigger[] = [];
      harness.transport.subscribe((t) => {
        a.push(t);
      });
      harness.transport.subscribe((t) => {
        b.push(t);
      });
      await harness.flush?.();
      await harness.transport.publish(SAMPLE, 'origin-A');
      await harness.flush?.();
      expect(a).toEqual([SAMPLE]);
      expect(b).toEqual([SAMPLE]);
    });

    it('unsubscribe stops further deliveries', async () => {
      const received: Trigger[] = [];
      const off = harness.transport.subscribe((t) => {
        received.push(t);
      });
      await harness.flush?.();
      off();
      await harness.transport.publish(SAMPLE, 'origin-A');
      await harness.flush?.();
      expect(received).toEqual([]);
    });

    it('close() makes subsequent publish a no-op', async () => {
      const received: Trigger[] = [];
      harness.transport.subscribe((t) => {
        received.push(t);
      });
      await harness.flush?.();
      await harness.transport.close?.();
      await expect(harness.transport.publish(SAMPLE, 'origin-A')).resolves.toBeUndefined();
      await harness.flush?.();
      expect(received).toEqual([]);
    });
  });
}

describe('InMemoryTriggerBus.setTransport', () => {
  it('emit() writes to BOTH local subscribers and the transport', async () => {
    const transport = new InMemoryTriggerTransport();
    const bus = new InMemoryTriggerBus({ originNodeId: 'self' });
    const transportHandler = vi.fn();
    transport.subscribe(transportHandler);
    bus.setTransport(transport);

    const localHandler = vi.fn();
    bus.subscribe('capability.changed', localHandler);

    await bus.emit(SAMPLE);
    expect(localHandler).toHaveBeenCalledTimes(1);
    expect(transportHandler).toHaveBeenCalledTimes(1);
    expect(transportHandler).toHaveBeenCalledWith(SAMPLE, { originNodeId: 'self' });
  });

  it('triggers from the transport reach local subscribers', async () => {
    const transport = new InMemoryTriggerTransport();
    const bus = new InMemoryTriggerBus({ originNodeId: 'me' });
    bus.setTransport(transport);

    const handler = vi.fn();
    bus.subscribe('capability.changed', handler);

    // Simulate an inbound trigger from a different node.
    await transport.publish(SAMPLE, 'someone-else');
    expect(handler).toHaveBeenCalledWith(SAMPLE);
  });

  it('drops self-echoes — local emit + transport echo never re-fires', async () => {
    const transport = new InMemoryTriggerTransport();
    const bus = new InMemoryTriggerBus({ originNodeId: 'me' });
    bus.setTransport(transport);

    const handler = vi.fn();
    bus.subscribe('capability.changed', handler);

    await bus.emit(SAMPLE);
    // The transport fans the trigger back to the same bus; the bus drops
    // it because the meta.originNodeId matches its own id.
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('detaches the previous transport when a new one is set', () => {
    const t1 = new InMemoryTriggerTransport();
    const t2 = new InMemoryTriggerTransport();
    const bus = new InMemoryTriggerBus({ originNodeId: 'me' });
    bus.setTransport(t1);
    expect(t1.subscriberCount).toBe(1);

    bus.setTransport(t2);
    expect(t1.subscriberCount).toBe(0);
    expect(t2.subscriberCount).toBe(1);
  });

  it('setTransport(null) detaches without re-attaching', async () => {
    const transport = new InMemoryTriggerTransport();
    const bus = new InMemoryTriggerBus({ originNodeId: 'me' });
    bus.setTransport(transport);
    expect(transport.subscriberCount).toBe(1);

    bus.setTransport(null);
    expect(transport.subscriberCount).toBe(0);

    // After detach, emit no longer touches the transport.
    const transportHandler = vi.fn();
    transport.subscribe(transportHandler);
    await bus.emit(SAMPLE);
    expect(transportHandler).not.toHaveBeenCalled();
  });

  it('routes transport publish failures through onError', async () => {
    const onError = vi.fn();
    const bus = new InMemoryTriggerBus({ originNodeId: 'me', onError });
    const broken: TriggerTransport = {
      publish: () => Promise.reject(new Error('network down')),
      subscribe: () => () => {},
    };
    bus.setTransport(broken);
    await bus.emit(SAMPLE);
    expect(onError).toHaveBeenCalledOnce();
    const firstCall = onError.mock.calls[0] as [unknown, Trigger];
    const err = firstCall[0];
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('network down');
  });

  it('cross-bus fan-out via shared transport (a→b)', async () => {
    const transport = new InMemoryTriggerTransport();
    const busA = new InMemoryTriggerBus({ originNodeId: 'A' });
    const busB = new InMemoryTriggerBus({ originNodeId: 'B' });
    busA.setTransport(transport);
    busB.setTransport(transport);

    const aHandler = vi.fn();
    const bHandler = vi.fn();
    busA.subscribe('capability.changed', aHandler);
    busB.subscribe('capability.changed', bHandler);

    await busA.emit(SAMPLE);
    expect(aHandler).toHaveBeenCalledTimes(1); // local fan-out only
    expect(bHandler).toHaveBeenCalledTimes(1); // received via transport
  });
});
