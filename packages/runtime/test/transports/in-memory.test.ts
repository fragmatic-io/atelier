// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { describe, expect, it, vi } from 'vitest';
import type { Trigger } from '@atelier/schemas';
import { InMemoryTriggerTransport } from '../../src/transports/in-memory-trigger-transport.js';
import { InMemoryTriggerBus } from '../../src/triggers/memory-bus.js';

const SAMPLE: Trigger = {
  type: 'capability.changed',
  app_id: 'mail.example.com',
  capability_id: 'thread.archive',
  old_v: '1.0.0',
  new_v: '2.0.0',
};

describe('InMemoryTriggerTransport', () => {
  it('fans out a→b across two buses sharing one transport', async () => {
    const transport = new InMemoryTriggerTransport();
    const busA = new InMemoryTriggerBus({ originNodeId: 'A' });
    const busB = new InMemoryTriggerBus({ originNodeId: 'B' });
    busA.setTransport(transport);
    busB.setTransport(transport);

    const handlerB = vi.fn();
    busB.subscribe('capability.changed', handlerB);

    await busA.emit(SAMPLE);
    expect(handlerB).toHaveBeenCalledWith(SAMPLE);
  });

  it('does not deliver self-echo to the publishing bus', async () => {
    const transport = new InMemoryTriggerTransport();
    const bus = new InMemoryTriggerBus({ originNodeId: 'solo' });
    bus.setTransport(transport);

    const handler = vi.fn();
    bus.subscribe('capability.changed', handler);

    await bus.emit(SAMPLE);
    // Local fan-out fires once. Transport echoes back the same trigger
    // tagged with our own origin — the bus drops it.
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('subscriberCount reflects attach/detach', () => {
    const transport = new InMemoryTriggerTransport();
    expect(transport.subscriberCount).toBe(0);
    const off = transport.subscribe(() => {});
    expect(transport.subscriberCount).toBe(1);
    off();
    expect(transport.subscriberCount).toBe(0);
  });

  it('close() drops every handler and short-circuits publish', async () => {
    const transport = new InMemoryTriggerTransport();
    const handler = vi.fn();
    transport.subscribe(handler);
    await transport.close();
    expect(transport.subscriberCount).toBe(0);
    await transport.publish(SAMPLE, 'origin-A');
    expect(handler).not.toHaveBeenCalled();
  });

  it('subscribe after close is a no-op', async () => {
    const transport = new InMemoryTriggerTransport();
    await transport.close();
    const handler = vi.fn();
    const off = transport.subscribe(handler);
    expect(transport.subscriberCount).toBe(0);
    off(); // does not throw
  });

  it('handler exceptions do not poison the transport', async () => {
    const transport = new InMemoryTriggerTransport();
    transport.subscribe(() => {
      throw new Error('boom');
    });
    const survived = vi.fn();
    transport.subscribe(survived);
    await transport.publish(SAMPLE, 'origin-A');
    expect(survived).toHaveBeenCalled();
  });
});
