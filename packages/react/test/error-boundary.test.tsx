// @vitest-environment happy-dom
import './setup.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { AuditEvent } from '@cir/schemas';
import type { AuditSink } from '@cir/runtime';
import { CirErrorBoundary } from '../src/error-boundary.js';

function Boom({ when }: { when: boolean }): React.ReactElement {
  if (when) throw new Error('kaboom');
  return <div>ok</div>;
}

describe('<CirErrorBoundary>', () => {
  // React logs caught errors to console.error; silence to keep test output clean.
  let spy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    spy.mockRestore();
  });

  it('renders children when no error', () => {
    const { getByText } = render(
      <CirErrorBoundary fallback={(e) => <div>fallback:{e.message}</div>}>
        <Boom when={false} />
      </CirErrorBoundary>,
    );
    expect(getByText('ok')).toBeTruthy();
  });

  it('renders fallback when child throws', () => {
    const { getByText } = render(
      <CirErrorBoundary fallback={(e) => <div>fallback:{e.message}</div>}>
        <Boom when={true} />
      </CirErrorBoundary>,
    );
    expect(getByText('fallback:kaboom')).toBeTruthy();
  });

  it('resets when resetKey changes', () => {
    const { getByText, rerender } = render(
      <CirErrorBoundary fallback={(e) => <div>fallback:{e.message}</div>} resetKey="a">
        <Boom when={true} />
      </CirErrorBoundary>,
    );
    expect(getByText('fallback:kaboom')).toBeTruthy();

    rerender(
      <CirErrorBoundary fallback={(e) => <div>fallback:{e.message}</div>} resetKey="b">
        <Boom when={false} />
      </CirErrorBoundary>,
    );
    expect(getByText('ok')).toBeTruthy();
  });

  it('emits an audit event when audit sink is provided', () => {
    const events: AuditEvent[] = [];
    const sink: AuditSink = {
      emit(e) {
        events.push(e);
      },
    };
    render(
      <CirErrorBoundary
        fallback={(e) => <div>fallback:{e.message}</div>}
        audit={sink}
        user_id="u"
        app_id="a"
      >
        <Boom when={true} />
      </CirErrorBoundary>,
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.user_id).toBe('u');
    expect(events[0]?.trigger_chain.join(',')).toMatch(/render_error:kaboom/);
  });

  it('swallows audit sink errors', () => {
    const sink: AuditSink = {
      emit() {
        throw new Error('sink boom');
      },
    };
    expect(() =>
      render(
        <CirErrorBoundary fallback={(e) => <div>fallback:{e.message}</div>} audit={sink}>
          <Boom when={true} />
        </CirErrorBoundary>,
      ),
    ).not.toThrow();
  });

  it('skips audit when no sink provided', () => {
    expect(() =>
      render(
        <CirErrorBoundary fallback={(e) => <div>{e.message}</div>}>
          <Boom when={true} />
        </CirErrorBoundary>,
      ),
    ).not.toThrow();
  });
});
