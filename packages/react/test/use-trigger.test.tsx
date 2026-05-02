// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import type { Trigger } from '@atelier/schemas';
import { CirRuntime } from '../src/context/runtime-provider.js';
import { useTrigger } from '../src/hooks/use-trigger.js';
import { buildTestServices } from '../src/testing/build-test-services.js';

function Listener({
  type,
  onEvent,
}: {
  type: Trigger['type'] | '*';
  onEvent: (e: Trigger) => void;
}): React.ReactElement {
  useTrigger(type, onEvent);
  return <div />;
}

const sampleTrigger: Trigger = {
  type: 'user.recompile_route',
  user_id: 'test-user',
  route: '/today',
};

describe('useTrigger', () => {
  it('subscribes on mount and receives events', async () => {
    const services = buildTestServices();
    const seen: Trigger[] = [];
    render(
      <CirRuntime services={services}>
        <Listener type="user.recompile_route" onEvent={(e) => seen.push(e)} />
      </CirRuntime>,
    );
    await services.bus.emit(sampleTrigger);
    expect(seen).toHaveLength(1);
  });

  it('unsubscribes on unmount', async () => {
    const services = buildTestServices();
    const seen: Trigger[] = [];
    const { unmount } = render(
      <CirRuntime services={services}>
        <Listener type="user.recompile_route" onEvent={(e) => seen.push(e)} />
      </CirRuntime>,
    );
    unmount();
    await services.bus.emit(sampleTrigger);
    expect(seen).toHaveLength(0);
  });

  it('re-subscribes when eventType changes', async () => {
    const services = buildTestServices();
    const seen: Trigger[] = [];
    const { rerender } = render(
      <CirRuntime services={services}>
        <Listener type="user.recompile_route" onEvent={(e) => seen.push(e)} />
      </CirRuntime>,
    );
    rerender(
      <CirRuntime services={services}>
        <Listener type="*" onEvent={(e) => seen.push(e)} />
      </CirRuntime>,
    );
    await services.bus.emit(sampleTrigger);
    // The handler is bound via wildcard now; should still see one event.
    expect(seen.length).toBeGreaterThan(0);
  });
});
