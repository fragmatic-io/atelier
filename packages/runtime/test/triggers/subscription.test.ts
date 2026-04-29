import { describe, expect, it } from 'vitest';
import type { Trigger } from '@cir/schemas';
import { InMemoryTriggerBus } from '../../src/triggers/memory-bus.ts';
import {
  WILDCARD_TRIGGER_TYPE,
  type TriggerHandler,
  type TriggerSubscription,
} from '../../src/triggers/subscription.ts';

// This test is mostly a type-level conformance check: the in-memory bus
// satisfies the `TriggerSubscription` contract.
describe('TriggerSubscription contract', () => {
  it('InMemoryTriggerBus structurally satisfies TriggerSubscription', () => {
    const bus: TriggerSubscription = new InMemoryTriggerBus();
    expect(typeof bus.subscribe).toBe('function');
    expect(typeof bus.emit).toBe('function');
  });

  it('exports the WILDCARD_TRIGGER_TYPE sentinel', () => {
    expect(WILDCARD_TRIGGER_TYPE).toBe('*');
  });

  it('TriggerHandler may be sync or async', async () => {
    const bus = new InMemoryTriggerBus();
    const sync: TriggerHandler = () => {};
    const async_: TriggerHandler = async () => {};
    bus.subscribe('capability.changed', sync);
    bus.subscribe('capability.changed', async_);
    const event: Trigger = {
      type: 'capability.changed',
      app_id: 'a',
      capability_id: 'x',
    };
    await expect(bus.emit(event)).resolves.toBeUndefined();
  });
});
