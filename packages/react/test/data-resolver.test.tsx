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

  it('resolver rejection sets the error prop', async () => {
    function Listy({
      error,
      loading,
    }: {
      error?: Error | null;
      loading?: boolean;
    }): React.ReactElement {
      return <div data-testid="row">{loading ? 'l' : error ? `err:${error.message}` : 'nope'}</div>;
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
            children: [{ component: 'Listy', data: { source: 'fail' } }],
          },
        },
      ],
    });
    const plan = buildRenderPlan(manifest, '/today', registry);
    const services = buildTestServices({ componentRegistry: registry });
    const resolver = (): Promise<never> => Promise.reject(new Error('boom'));
    const { getByTestId } = render(
      <CirRuntime services={services} dataResolver={resolver}>
        <RenderNode node={plan.root} />
      </CirRuntime>,
    );
    await waitFor(() => expect(getByTestId('row').textContent).toBe('err:boom'));
  });
});
