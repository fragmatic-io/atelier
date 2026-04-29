// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it } from 'vitest';
import { act, render } from '@testing-library/react';
import { ALWAYS_DECLINE } from '@cir/runtime/testing';
import { CirRuntime } from '../src/context/runtime-provider.js';
import { useDispatcher } from '../src/hooks/use-dispatcher.js';
import { buildTestServices } from '../src/testing/build-test-services.js';
import { archiveCapability, deleteCapability } from './fixtures.js';

function Fire({
  capabilityId,
  onDone,
}: {
  capabilityId: string;
  onDone: (result: unknown) => void;
}): React.ReactElement {
  const dispatch = useDispatcher();
  return (
    <button
      data-testid="fire"
      onClick={() => {
        void dispatch(capabilityId, { thread_id: 't1' }).then(onDone);
      }}
    >
      fire
    </button>
  );
}

describe('useDispatcher', () => {
  it('dispatches via the registered handler', async () => {
    const services = buildTestServices({
      capabilities: { 'thread.archive': archiveCapability() },
    });
    services.actions.register('thread.archive', () => Promise.resolve({ archived_at: 'now' }));
    let result: unknown;
    const { getByTestId } = render(
      <CirRuntime services={services}>
        <Fire capabilityId="thread.archive" onDone={(r) => (result = r)} />
      </CirRuntime>,
    );
    await act(() => {
      getByTestId('fire').click();
      return Promise.resolve();
    });
    expect(result).toMatchObject({ ok: true });
  });

  it('declined confirmation produces a denied result', async () => {
    const services = buildTestServices({
      capabilities: { 'task.delete': deleteCapability() },
      confirm: ALWAYS_DECLINE,
    });
    services.actions.register('task.delete', () => Promise.resolve({}));
    let result: { ok: boolean; error?: string } | undefined;
    const { getByTestId } = render(
      <CirRuntime services={services} confirm={ALWAYS_DECLINE}>
        <Fire capabilityId="task.delete" onDone={(r) => (result = r as typeof result)} />
      </CirRuntime>,
    );
    await act(() => {
      getByTestId('fire').click();
      return Promise.resolve();
    });
    expect(result?.ok).toBe(false);
  });

  it('reversible action enables undo on the dispatcher', async () => {
    const services = buildTestServices({
      capabilities: { 'thread.archive': archiveCapability() },
    });
    services.actions.register('thread.archive', () => Promise.resolve({ archived_at: 'now' }));
    const { getByTestId } = render(
      <CirRuntime services={services}>
        <Fire capabilityId="thread.archive" onDone={() => {}} />
      </CirRuntime>,
    );
    await act(() => {
      getByTestId('fire').click();
      return Promise.resolve();
    });
    expect(services.dispatcher.canUndo()).toBe(true);
  });

  it('unknown capability returns an error result', async () => {
    const services = buildTestServices({ capabilities: {} });
    let result: { ok: boolean } | undefined;
    const { getByTestId } = render(
      <CirRuntime services={services}>
        <Fire capabilityId="does.not.exist" onDone={(r) => (result = r as typeof result)} />
      </CirRuntime>,
    );
    await act(() => {
      getByTestId('fire').click();
      return Promise.resolve();
    });
    expect(result?.ok).toBe(false);
  });
});
