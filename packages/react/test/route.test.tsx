// @vitest-environment happy-dom
import './setup.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import type { Trigger } from '@cir/schemas';
import { MapComponentRegistry } from '@cir/runtime/testing';
import { CirRuntime } from '../src/context/runtime-provider.js';
import { CirRoute } from '../src/render/route.js';
import { __resetMissingBindingWarnings } from '../src/render/render-node.js';
import { buildTestServices } from '../src/testing/build-test-services.js';
import { makeManifest } from './fixtures.js';

function Greeting({ message }: { message: string }): React.ReactElement {
  return <div data-testid="greet">{message}</div>;
}

function buildRegistry(): MapComponentRegistry {
  return new MapComponentRegistry({
    Stack: {
      id: 'Stack',
      factory: ({ children }: { children?: React.ReactNode }) => (
        <section data-testid="stack">{children}</section>
      ),
    },
    Greeting: { id: 'Greeting', factory: Greeting },
  });
}

beforeEach(() => __resetMissingBindingWarnings());
afterEach(() => __resetMissingBindingWarnings());

describe('<CirRoute>', () => {
  it('renders fallback while loading then content', async () => {
    const registry = buildRegistry();
    const services = buildTestServices({
      componentRegistry: registry,
      manifestsByRoute: { '/today': makeManifest() },
    });
    const { getByTestId, getByText } = render(
      <CirRuntime services={services}>
        <CirRoute path="/today" />
      </CirRuntime>,
    );
    expect(getByText('Loading...')).toBeTruthy();
    await waitFor(() => expect(getByTestId('greet').textContent).toBe('hello'));
  });

  it('renders custom fallback prop', () => {
    const registry = buildRegistry();
    const services = buildTestServices({
      componentRegistry: registry,
      manifestsByRoute: { '/today': makeManifest() },
    });
    const { getByText } = render(
      <CirRuntime services={services}>
        <CirRoute path="/today" fallback={<div>spinning</div>} />
      </CirRuntime>,
    );
    expect(getByText('spinning')).toBeTruthy();
  });

  it('renders error fallback when manifest fetch fails', async () => {
    const registry = buildRegistry();
    const services = buildTestServices({
      componentRegistry: registry,
      manifestsByRoute: {}, // every route will 404
    });
    const { container } = render(
      <CirRuntime services={services}>
        <CirRoute path="/missing" />
      </CirRuntime>,
    );
    await waitFor(() => {
      expect(container.querySelector('[data-cir-error]')).not.toBeNull();
    });
  });

  it('uses custom errorFallback', async () => {
    const registry = buildRegistry();
    const services = buildTestServices({
      componentRegistry: registry,
      manifestsByRoute: {},
    });
    const { findByText } = render(
      <CirRuntime services={services}>
        <CirRoute path="/x" errorFallback={(e) => <div>OH:{e.message}</div>} />
      </CirRuntime>,
    );
    expect(await findByText(/^OH:/)).toBeTruthy();
  });

  it('refetches when path changes', async () => {
    const ma = makeManifest({ manifest_id: 'm_a', routes: makeManifest().routes });
    const mb = makeManifest({
      manifest_id: 'm_b',
      routes: [
        {
          path: '/b',
          title: 'B',
          layout: {
            component: 'Stack',
            children: [{ component: 'Greeting', props: { message: 'world' } }],
          },
        },
      ],
    });
    const registry = buildRegistry();
    const services = buildTestServices({
      componentRegistry: registry,
      manifestsByRoute: { '/today': ma, '/b': mb },
    });
    const { getByTestId, rerender } = render(
      <CirRuntime services={services}>
        <CirRoute path="/today" />
      </CirRuntime>,
    );
    await waitFor(() => expect(getByTestId('greet').textContent).toBe('hello'));
    rerender(
      <CirRuntime services={services}>
        <CirRoute path="/b" />
      </CirRuntime>,
    );
    await waitFor(() => expect(getByTestId('greet').textContent).toBe('world'));
  });

  it('auto-refreshes when a relevant trigger fires on the bus', async () => {
    const registry = buildRegistry();
    const services = buildTestServices({
      componentRegistry: registry,
      manifestsByRoute: { '/today': makeManifest() },
    });
    const { getByTestId } = render(
      <CirRuntime services={services}>
        <CirRoute path="/today" />
      </CirRuntime>,
    );
    await waitFor(() => expect(getByTestId('greet')).toBeTruthy());
    // Spy on resolver.resolve before emitting.
    const spy = vi.spyOn(services.resolver, 'resolve');
    const trigger: Trigger = {
      type: 'user.recompile_route',
      user_id: 'test-user',
      route: '/today',
    };
    await act(async () => {
      await services.bus.emit(trigger);
    });
    await waitFor(() => expect(spy).toHaveBeenCalled());
    spy.mockRestore();
  });

  it('ignores triggers that do not affect this route', async () => {
    const registry = buildRegistry();
    const services = buildTestServices({
      componentRegistry: registry,
      manifestsByRoute: { '/today': makeManifest() },
    });
    const { getByTestId } = render(
      <CirRuntime services={services}>
        <CirRoute path="/today" />
      </CirRuntime>,
    );
    await waitFor(() => expect(getByTestId('greet')).toBeTruthy());
    const spy = vi.spyOn(services.resolver, 'resolve');
    const trigger: Trigger = {
      type: 'user.recompile_route',
      user_id: 'someone-else',
      route: '/today',
    };
    await act(async () => {
      await services.bus.emit(trigger);
    });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it.each([
    {
      label: 'policy.changed (matching app_id)',
      trigger: { type: 'policy.changed', app_id: 'test-app', rule_id: 'r1' },
      expectRefetch: true,
    },
    {
      label: 'intent.lens_switched (matching user)',
      trigger: {
        type: 'intent.lens_switched',
        user_id: 'test-user',
        app: 'test-app',
        lens: 'inbox',
      },
      expectRefetch: true,
    },
    {
      label: 'user.try_lens (matching user)',
      trigger: { type: 'user.try_lens', user_id: 'test-user', lens_name: 'l' },
      expectRefetch: true,
    },
    {
      label: 'turn.classified (unhandled trigger family)',
      trigger: { type: 'turn.classified', conversation_id: 'c', classification: 'continue' },
      expectRefetch: false,
    },
    {
      label: 'capability.added (matching app_id)',
      trigger: {
        type: 'capability.added',
        app_id: 'test-app',
        capability_id: 'thread.archive',
      },
      expectRefetch: true,
    },
    {
      label: 'capability.added (non-matching app_id)',
      trigger: {
        type: 'capability.added',
        app_id: 'other-app',
        capability_id: 'thread.archive',
      },
      expectRefetch: false,
    },
    {
      label: 'intent.preference_changed (non-matching user)',
      trigger: {
        type: 'intent.preference_changed',
        user_id: 'someone-else',
        scope: 'global',
      },
      expectRefetch: false,
    },
    {
      label: 'user.recompile_all (matching user)',
      trigger: { type: 'user.recompile_all', user_id: 'test-user' },
      expectRefetch: true,
    },
  ] as const)('refresh decision for $label', async ({ trigger, expectRefetch }) => {
    const registry = buildRegistry();
    const services = buildTestServices({
      componentRegistry: registry,
      manifestsByRoute: { '/today': makeManifest() },
    });
    const { getByTestId } = render(
      <CirRuntime services={services}>
        <CirRoute path="/today" />
      </CirRuntime>,
    );
    await waitFor(() => expect(getByTestId('greet')).toBeTruthy());
    const spy = vi.spyOn(services.resolver, 'resolve');
    await act(async () => {
      await services.bus.emit(trigger as never);
    });
    if (expectRefetch) {
      await waitFor(() => expect(spy).toHaveBeenCalled());
    } else {
      expect(spy).not.toHaveBeenCalled();
    }
    spy.mockRestore();
  });

  it('errorFallback fires for non-renderable routes (redirect-only)', async () => {
    const registry = buildRegistry();
    const services = buildTestServices({
      componentRegistry: registry,
      manifestsByRoute: {
        '/redir': makeManifest({
          routes: [{ path: '/redir', redirect: '/today' }],
        }),
      },
    });
    const { container } = render(
      <CirRuntime services={services}>
        <CirRoute path="/redir" />
      </CirRuntime>,
    );
    await waitFor(() => {
      expect(container.querySelector('[data-cir-error]')).not.toBeNull();
    });
  });
});
