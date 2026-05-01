// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { buildRenderPlan } from '@cir/runtime';
import { MapComponentRegistry } from '@cir/runtime/testing';
import { CirRuntime } from '../src/context/runtime-provider.js';
import { RenderNode } from '../src/render/render-node.js';
import { EmptyDataResolver, type DataBinding } from '../src/data/data-resolver.js';
import { buildTestServices } from '../src/testing/build-test-services.js';
import { makeManifest } from './fixtures.js';

describe('DataResolver protocol', () => {
  it('EmptyDataResolver returns undefined', async () => {
    expect(await Promise.resolve(EmptyDataResolver({ source: 'x' }))).toBeUndefined();
  });

  it('component receives data + loading + error props from a custom resolver', async () => {
    function Listy({
      data,
      loading,
      error,
    }: {
      data?: unknown;
      loading?: boolean;
      error?: Error | null;
    }): React.ReactElement {
      return (
        <div data-testid="row">
          {loading ? 'loading' : error ? `err:${error.message}` : JSON.stringify(data)}
        </div>
      );
    }
    const registry = new MapComponentRegistry({
      Stack: {
        id: 'Stack',
        factory: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
      },
      Listy: { id: 'Listy', factory: Listy },
    });
    const manifest = makeManifest({
      routes: [
        {
          path: '/today',
          title: 'Today',
          layout: {
            component: 'Stack',
            children: [
              {
                component: 'Listy',
                data: { source: 'task.list', filter: 'open' },
              },
            ],
          },
        },
      ],
    });
    const plan = buildRenderPlan(manifest, '/today', registry);
    const services = buildTestServices({ componentRegistry: registry });

    const seen: DataBinding[] = [];
    const resolver = (b: DataBinding): unknown => {
      seen.push(b);
      return [{ id: 1 }, { id: 2 }];
    };

    const { getByTestId } = render(
      <CirRuntime services={services} dataResolver={resolver}>
        <RenderNode node={plan.root} />
      </CirRuntime>,
    );
    await waitFor(() => expect(getByTestId('row').textContent).toBe('[{"id":1},{"id":2}]'));
    expect(seen).toEqual([{ source: 'task.list', filter: 'open' }]);
  });

  it('renders the resolver-supplied error default when the resolver rejects (Phase 2 #4)', async () => {
    // The renderer now intercepts the error condition and renders the
    // resolver default in place of the data-bound component. The default
    // node carries `data-cir-default-state="error"` so tests / audit
    // tooling can detect it.
    function Listy(): React.ReactElement {
      return <div data-testid="row">component-rendered</div>;
    }
    function Alert({ title }: { title?: string }): React.ReactElement {
      return <div data-testid="default-error">{title}</div>;
    }
    const registry = new MapComponentRegistry({
      Stack: {
        id: 'Stack',
        factory: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
      },
      Listy: { id: 'Listy', factory: Listy },
      Alert: { id: 'Alert', factory: Alert },
    });
    const manifest = makeManifest({
      routes: [
        {
          path: '/today',
          title: 'Today',
          layout: {
            component: 'Stack',
            children: [{ component: 'Listy', data: { source: 'fail' } }],
          },
        },
      ],
    });
    const plan = buildRenderPlan(manifest, '/today', registry);
    const services = buildTestServices({ componentRegistry: registry });
    const resolver = (): Promise<never> => Promise.reject(new Error('boom'));
    const { container, queryByTestId } = render(
      <CirRuntime services={services} dataResolver={resolver}>
        <RenderNode node={plan.root} />
      </CirRuntime>,
    );
    await waitFor(() => {
      const wrapper = container.querySelector('[data-cir-default-state="error"]');
      expect(wrapper).not.toBeNull();
    });
    // The data-bound component itself is replaced by the default — `row`
    // never renders. The default Alert with the baseline title does.
    expect(queryByTestId('row')).toBeNull();
    expect(queryByTestId('default-error')?.textContent).toBe('Failed to load');
  });

  it('uses the manifest-declared error_state slot in preference to the resolver default', async () => {
    function Listy(): React.ReactElement {
      return <div data-testid="row">component-rendered</div>;
    }
    function CustomErr({ headline }: { headline?: string }): React.ReactElement {
      return <div data-testid="custom-err">{headline}</div>;
    }
    const registry = new MapComponentRegistry({
      Stack: {
        id: 'Stack',
        factory: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
      },
      Listy: { id: 'Listy', factory: Listy },
      CustomErr: { id: 'CustomErr', factory: CustomErr },
    });
    const manifest = makeManifest({
      routes: [
        {
          path: '/today',
          title: 'Today',
          layout: {
            component: 'Stack',
            children: [
              {
                component: 'Listy',
                data: {
                  source: 'fail',
                  error_state: {
                    component: 'CustomErr',
                    props: { headline: 'Something distinctive' },
                  },
                },
              },
            ],
          },
        },
      ],
    });
    const plan = buildRenderPlan(manifest, '/today', registry);
    const services = buildTestServices({ componentRegistry: registry });
    const resolver = (): Promise<never> => Promise.reject(new Error('boom'));
    const { container, queryByTestId, getByTestId } = render(
      <CirRuntime services={services} dataResolver={resolver}>
        <RenderNode node={plan.root} />
      </CirRuntime>,
    );
    await waitFor(() => expect(getByTestId('custom-err')).toBeTruthy());
    // No data-cir-default-state wrapper — the slot was author-supplied, not
    // a resolver fallback.
    expect(container.querySelector('[data-cir-default-state]')).toBeNull();
    expect(queryByTestId('row')).toBeNull();
    expect(getByTestId('custom-err').textContent).toBe('Something distinctive');
  });
});
