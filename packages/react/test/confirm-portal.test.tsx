// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it } from 'vitest';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import type { ConfirmationDecision, ConfirmationRequest } from '@atelier/runtime';
import { ConfirmPortal } from '../src/confirm/confirm-portal.js';
import { createConfirmStore } from '../src/confirm/confirm-store.js';
import { useReactConfirmation } from '../src/confirm/use-confirmation.js';

function makeRequest(overrides: Partial<ConfirmationRequest> = {}): ConfirmationRequest {
  return {
    capability_id: 'task.delete',
    prompt: 'Confirm task.delete',
    side_effects: ['delete'],
    level: 'modal',
    ...overrides,
  };
}

function makeVerbalRequest(overrides: Partial<ConfirmationRequest> = {}): ConfirmationRequest {
  return makeRequest({
    capability_id: 'pulls.merge',
    prompt: 'Confirm pulls.merge',
    side_effects: ['publish'],
    level: 'verbal_required',
    verbal_phrase: 'merge',
    ...overrides,
  });
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
    const reqB = makeRequest({ capability_id: 'thread.archive', prompt: 'Confirm thread.archive' });
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

  it('renders generic description when request has no side_effects', async () => {
    const store = createConfirmStore();
    const { container } = render(<ConfirmPortal store={store} />);
    act(() => {
      store.enqueue({
        request: makeRequest({ side_effects: [] }),
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

  // ---------------------------------------------------------------------------
  // verbal_required behavior
  // ---------------------------------------------------------------------------

  describe('verbal_required', () => {
    it('renders the input + the required phrase', async () => {
      const store = createConfirmStore();
      const { container } = render(<ConfirmPortal store={store} />);
      act(() => {
        store.enqueue({ request: makeVerbalRequest(), resolve: () => {} });
      });
      await waitFor(() => expect(container.querySelector('dialog')).not.toBeNull());
      expect(container.querySelector('[data-cir-confirm-verbal-input]')).not.toBeNull();
      const phrase = container.querySelector('[data-cir-confirm-verbal-phrase]');
      expect(phrase?.textContent).toBe('merge');
      const dlg = container.querySelector('dialog');
      expect(dlg?.getAttribute('data-cir-confirm-level')).toBe('verbal_required');
    });

    it('Confirm button is disabled while input is empty', async () => {
      const store = createConfirmStore();
      const { container } = render(<ConfirmPortal store={store} />);
      act(() => {
        store.enqueue({ request: makeVerbalRequest(), resolve: () => {} });
      });
      await waitFor(() => expect(container.querySelector('dialog')).not.toBeNull());
      const ok = container.querySelector('[data-cir-confirm-ok]') as HTMLButtonElement;
      expect(ok.disabled).toBe(true);
    });

    it('Confirm button stays disabled when input does not match the phrase', async () => {
      const store = createConfirmStore();
      const { container } = render(<ConfirmPortal store={store} />);
      act(() => {
        store.enqueue({ request: makeVerbalRequest(), resolve: () => {} });
      });
      await waitFor(() => expect(container.querySelector('dialog')).not.toBeNull());
      const input = container.querySelector('[data-cir-confirm-verbal-input]') as HTMLInputElement;
      act(() => {
        fireEvent.change(input, { target: { value: 'mer' } });
      });
      const ok = container.querySelector('[data-cir-confirm-ok]') as HTMLButtonElement;
      expect(ok.disabled).toBe(true);
      // Wrong phrase entirely.
      act(() => {
        fireEvent.change(input, { target: { value: 'delete' } });
      });
      expect(ok.disabled).toBe(true);
    });

    it('Confirm button enables when input matches case-insensitively (with surrounding whitespace)', async () => {
      const store = createConfirmStore();
      const { container } = render(<ConfirmPortal store={store} />);
      act(() => {
        store.enqueue({ request: makeVerbalRequest(), resolve: () => {} });
      });
      await waitFor(() => expect(container.querySelector('dialog')).not.toBeNull());
      const input = container.querySelector('[data-cir-confirm-verbal-input]') as HTMLInputElement;
      const ok = container.querySelector('[data-cir-confirm-ok]') as HTMLButtonElement;
      act(() => {
        fireEvent.change(input, { target: { value: '  MERGE  ' } });
      });
      expect(ok.disabled).toBe(false);
    });

    it('clicking Confirm with a valid phrase resolves { confirmed: true }', async () => {
      const store = createConfirmStore();
      let decision: ConfirmationDecision | undefined;
      const { container } = render(<ConfirmPortal store={store} />);
      act(() => {
        store.enqueue({ request: makeVerbalRequest(), resolve: (d) => (decision = d) });
      });
      await waitFor(() => expect(container.querySelector('dialog')).not.toBeNull());
      const input = container.querySelector('[data-cir-confirm-verbal-input]') as HTMLInputElement;
      act(() => {
        fireEvent.change(input, { target: { value: 'merge' } });
      });
      const ok = container.querySelector('[data-cir-confirm-ok]') as HTMLButtonElement;
      act(() => {
        ok.click();
      });
      await waitFor(() => expect(decision).toEqual({ confirmed: true }));
    });

    it('Cancel still works regardless of input value', async () => {
      const store = createConfirmStore();
      let decision: ConfirmationDecision | undefined;
      const { container } = render(<ConfirmPortal store={store} />);
      act(() => {
        store.enqueue({ request: makeVerbalRequest(), resolve: (d) => (decision = d) });
      });
      await waitFor(() => expect(container.querySelector('dialog')).not.toBeNull());
      const input = container.querySelector('[data-cir-confirm-verbal-input]') as HTMLInputElement;
      act(() => {
        fireEvent.change(input, { target: { value: 'something else' } });
      });
      const cancel = container.querySelector('[data-cir-confirm-cancel]') as HTMLButtonElement;
      act(() => {
        cancel.click();
      });
      await waitFor(() => expect(decision?.confirmed).toBe(false));
    });
  });
});
