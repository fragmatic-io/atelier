import { describe, expect, it, vi } from 'vitest';
import type { Trigger } from '@atelier/schemas';
import { InMemoryTriggerBus } from '../../src/triggers/memory-bus.js';

const SCHEMA_TRIGGER: Trigger = {
  type: 'capability.changed',
  app_id: 'mail.example.com',
  capability_id: 'thread.archive',
  old_v: '2.0.0',
  new_v: '2.1.0',
};

const INTENT_TRIGGER: Trigger = {
  type: 'intent.lens_switched',
  user_id: 'vid',
  app: 'mail.example.com',
  lens: 'founder_inbox',
};

describe('InMemoryTriggerBus', () => {
  it('emits to typed subscribers', async () => {
    const bus = new InMemoryTriggerBus();
    const handler = vi.fn();
    bus.subscribe('capability.changed', handler);
    await bus.emit(SCHEMA_TRIGGER);
    expect(handler).toHaveBeenCalledWith(SCHEMA_TRIGGER);
  });

  it('does not emit to mismatched typed subscribers', async () => {
    const bus = new InMemoryTriggerBus();
    const handler = vi.fn();
    bus.subscribe('capability.added', handler);
    await bus.emit(SCHEMA_TRIGGER);
    expect(handler).not.toHaveBeenCalled();
  });

  it('emits to wildcard subscribers regardless of type', async () => {
    const bus = new InMemoryTriggerBus();
    const handler = vi.fn();
    bus.subscribe('*', handler);
    await bus.emit(SCHEMA_TRIGGER);
    await bus.emit(INTENT_TRIGGER);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('unsubscribe stops further deliveries', async () => {
    const bus = new InMemoryTriggerBus();
    const handler = vi.fn();
    const off = bus.subscribe('capability.changed', handler);
    off();
    await bus.emit(SCHEMA_TRIGGER);
    expect(handler).not.toHaveBeenCalled();
    expect(bus.subscriberCount()).toBe(0);
  });

  it('unsubscribe also removes wildcard subscribers', async () => {
    const bus = new InMemoryTriggerBus();
    const handler = vi.fn();
    const off = bus.subscribe('*', handler);
    off();
    await bus.emit(SCHEMA_TRIGGER);
    expect(handler).not.toHaveBeenCalled();
  });

  it('awaits async handlers before resolving emit', async () => {
    const bus = new InMemoryTriggerBus();
    let settled = false;
    bus.subscribe('capability.changed', async () => {
      await new Promise((r) => setTimeout(r, 5));
      settled = true;
    });
    await bus.emit(SCHEMA_TRIGGER);
    expect(settled).toBe(true);
  });

  it('swallows handler errors and surfaces them via onError', async () => {
    const onError = vi.fn();
    const bus = new InMemoryTriggerBus({ onError });
    const survived = vi.fn();
    bus.subscribe('capability.changed', () => {
      throw new Error('boom');
    });
    bus.subscribe('capability.changed', survived);
    await bus.emit(SCHEMA_TRIGGER);
    expect(onError).toHaveBeenCalledOnce();
    expect(survived).toHaveBeenCalledOnce();
  });

  it('swallows errors from onError itself', async () => {
    const bus = new InMemoryTriggerBus({
      onError: () => {
        throw new Error('onError failed');
      },
    });
    bus.subscribe('capability.changed', () => {
      throw new Error('boom');
    });
    await expect(bus.emit(SCHEMA_TRIGGER)).resolves.toBeUndefined();
  });

  it('multiple subscribers get the event in registration order', async () => {
    const bus = new InMemoryTriggerBus();
    const order: string[] = [];
    bus.subscribe('capability.changed', () => {
      order.push('a');
    });
    bus.subscribe('capability.changed', () => {
      order.push('b');
    });
    bus.subscribe('*', () => {
      order.push('c');
    });
    await bus.emit(SCHEMA_TRIGGER);
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('removes the typed bucket when emptied', () => {
    const bus = new InMemoryTriggerBus();
    const off = bus.subscribe('capability.changed', () => {});
    expect(bus.subscriberCount()).toBe(1);
    off();
    expect(bus.subscriberCount()).toBe(0);
  });
});
