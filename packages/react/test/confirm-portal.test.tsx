// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import type { ConfirmationDecision, ConfirmationRequest } from '@cir/runtime';
import { ConfirmPortal } from '../src/confirm/confirm-portal.js';
import { createConfirmStore } from '../src/confirm/confirm-store.js';
import { useReactConfirmation } from '../src/confirm/use-confirmation.js';
import { archiveCapability, deleteCapability } from './fixtures.js';

function makeRequest(): ConfirmationRequest {
  return {
    capability: deleteCapability(),
    level: 'modal',
    input: { task_id: 't1' },
    ctx: { user_id: 'u', app_id: 'a' },
  };
}

describe('ConfirmPortal + useReactConfirmation', () => {
  it('renders nothing when the queue is empty', () => {
    const store = createConfirmStore();
    const { container } = render(<ConfirmPortal store={store} />);
    expect(container.querySelector('dialog')).toBeNull();
  });

  it('confirm button resolves with confirmed: true', async () => {
    const store = createConfirmStore();
    let decision: ConfirmationDecision | undefined;
    const { container } = render(<ConfirmPortal store={store} />);
    act(() => {
      store.enqueue({
        request: makeRequest(),
        resolve: (d) => (decision = d),
      });
    });
    await waitFor(() => expect(container.querySelector('dialog')).not.toBeNull());
    const ok = container.querySelector('[data-cir-confirm-ok]') as HTMLButtonElement;
    act(() => ok.click());
    await waitFor(() => expect(decision).toEqual({ confirmed: true }));
  });

  it('cancel button resolves with confirmed: false', async () => {
    const store = createConfirmStore();
    let decision: ConfirmationDecision | undefined;
    const { container } = render(<ConfirmPortal store={store} />);
    act(() => {
      store.enqueue({
        request: makeRequest(),
        resolve: (d) => (decision = d),
      });
    });
    await waitFor(() => expect(container.querySelector('dialog')).not.toBeNull());
    const cancel = container.querySelector('[data-cir-confirm-cancel]') as HTMLButtonElement;
    act(() => cancel.click());
    await waitFor(() => {
      expect(decision?.confirmed).toBe(false);
    });
  });

  it('queues subsequent requests in order', () => {
    const store = createConfirmStore();
    const decisions: ConfirmationDecision[] = [];
    const reqA = makeRequest();
    const reqB = { ...makeRequest(), capability: archiveCapability() };
    render(<ConfirmPortal store={store} />);
    act(() => {
      store.enqueue({ request: reqA, resolve: (d) => decisions.push(d) });
      store.enqueue({ request: reqB, resolve: (d) => decisions.push(d) });
    });
    expect(store.size()).toBe(2);
    act(() => store.resolveHead({ confirmed: true }));
    expect(store.size()).toBe(1);
    act(() => store.resolveHead({ confirmed: false }));
    expect(store.size()).toBe(0);
    expect(decisions).toEqual([{ confirmed: true }, { confirmed: false }]);
  });

  it('resolveHead with empty queue is a no-op', () => {
    const store = createConfirmStore();
    expect(() => store.resolveHead({ confirmed: true })).not.toThrow();
    expect(store.size()).toBe(0);
  });

  it('useReactConfirmation: confirm() returns a promise resolved by the portal', async () => {
    function Harness({ onResult }: { onResult: (d: ConfirmationDecision) => void }) {
      const { confirm, Portal } = useReactConfirmation();
      return (
        <>
          <button
            data-testid="ask"
            onClick={() => {
              void Promise.resolve(confirm(makeRequest())).then(onResult);
            }}
          >
            ask
          </button>
          <Portal />
        </>
      );
    }
    let result: ConfirmationDecision | undefined;
    const { getByTestId, container } = render(<Harness onResult={(d) => (result = d)} />);
    act(() => {
      getByTestId('ask').click();
    });
    await waitFor(() => expect(container.querySelector('dialog')).not.toBeNull());
    const ok = container.querySelector('[data-cir-confirm-ok]') as HTMLButtonElement;
    act(() => {
      ok.click();
    });
    await waitFor(() => expect(result?.confirmed).toBe(true));
  });

  it('Escape key cancels (resolves with confirmed: false)', async () => {
    const store = createConfirmStore();
    let decision: ConfirmationDecision | undefined;
    const { container } = render(<ConfirmPortal store={store} />);
    act(() => {
      store.enqueue({ request: makeRequest(), resolve: (d) => (decision = d) });
    });
    await waitFor(() => expect(container.querySelector('dialog')).not.toBeNull());
    const dialog = container.querySelector('dialog') as HTMLDialogElement;
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    act(() => {
      dialog.dispatchEvent(event);
    });
    await waitFor(() => expect(decision?.confirmed).toBe(false));
  });

  it('renders generic description when capability has no side_effects', async () => {
    const store = createConfirmStore();
    const { container } = render(<ConfirmPortal store={store} />);
    const cap = archiveCapability();
    cap.side_effects = [];
    act(() => {
      store.enqueue({
        request: { capability: cap, level: 'modal', input: {}, ctx: { user_id: 'u', app_id: 'a' } },
        resolve: () => {},
      });
    });
    await waitFor(() => {
      const desc = container.querySelector('#cir-confirm-desc');
      expect(desc?.textContent).toBe('Please confirm this action.');
    });
  });

  it('closes the dialog when the queue empties (head -> null)', async () => {
    const store = createConfirmStore();
    const { container } = render(<ConfirmPortal store={store} />);
    act(() => {
      store.enqueue({ request: makeRequest(), resolve: () => {} });
    });
    await waitFor(() => {
      const dlg = container.querySelector('dialog');
      expect(dlg?.hasAttribute('open') || dlg?.open).toBeTruthy();
    });
    act(() => {
      store.resolveHead({ confirmed: true });
    });
    await waitFor(() => expect(container.querySelector('dialog')).toBeNull());
  });

  it('subscribe / unsubscribe lifecycle on the store works', () => {
    const store = createConfirmStore();
    let count = 0;
    const unsub = store.subscribe(() => {
      count += 1;
    });
    store.enqueue({ request: makeRequest(), resolve: () => {} });
    expect(count).toBeGreaterThan(0);
    unsub();
    const before = count;
    store.enqueue({ request: makeRequest(), resolve: () => {} });
    expect(count).toBe(before);
  });
});
