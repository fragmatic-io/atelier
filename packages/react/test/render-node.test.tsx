// @vitest-environment happy-dom
import './setup.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { buildRenderPlan } from '@cir/runtime';
import { MapComponentRegistry } from '@cir/runtime/testing';
import { RenderNode, __resetMissingBindingWarnings } from '../src/render/render-node.js';
import { CirRuntime } from '../src/context/runtime-provider.js';
import { DataResolverContext } from '../src/data/data-resolver.js';
import { buildTestServices } from '../src/testing/build-test-services.js';
import { archiveCapability, makeManifest } from './fixtures.js';

describe('RenderNode', () => {
  beforeEach(() => {
    __resetMissingBindingWarnings();
  });

  it('renders a registered component with verbatim props', () => {
    function Greeting({ message }: { message: string }): React.ReactElement {
      return <div data-testid="greet">{message}</div>;
    }
    const registry = new MapComponentRegistry({
      Stack: {
        id: 'Stack',
        factory: ({ children }: { children?: React.ReactNode }) => <section>{children}</section>,
      },
      Greeting: { id: 'Greeting', factory: Greeting },
    });
    const manifest = makeManifest();
    const plan = buildRenderPlan(manifest, '/today', registry);
    const services = buildTestServices({ componentRegistry: registry });
    const { getByTestId } = render(
      <CirRuntime services={services}>
        <RenderNode node={plan.root} />
      </CirRuntime>,
    );
    expect(getByTestId('greet').textContent).toBe('hello');
  });

  it('renders fallback and warns when binding missing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const registry = new MapComponentRegistry();
    const manifest = makeManifest();
    const plan = buildRenderPlan(manifest, '/today', registry);
    const services = buildTestServices({ componentRegistry: registry });
    const { container } = render(
      <CirRuntime services={services}>
        <RenderNode node={plan.root} />
      </CirRuntime>,
    );
    expect(container.querySelector('[data-cir-fallback="Stack"]')).not.toBeNull();
    expect(warn).toHaveBeenCalled();
    // De-dup: rendering again should not re-warn.
    warn.mockClear();
    render(
      <CirRuntime services={services}>
        <RenderNode node={plan.root} />
      </CirRuntime>,
    );
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('passes action props that dispatch on call (legacy capability-id-as-prop)', async () => {
    function Btn(props: Record<string, unknown>): React.ReactElement {
      const fn = props['thread.archive'] as (input: unknown) => Promise<unknown>;
      return (
        <button
          data-testid="btn"
          onClick={() => {
            void fn({ thread_id: 't1' });
          }}
        >
          go
        </button>
      );
    }
    const registry = new MapComponentRegistry({
      Stack: {
        id: 'Stack',
        factory: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
      },
      ActionBar: { id: 'ActionBar', factory: Btn },
    });
    const manifest = makeManifest({
      routes: [
        {
          path: '/today',
          title: 'Today',
          layout: {
            component: 'Stack',
            children: [{ component: 'ActionBar', actions: ['thread.archive'] }],
          },
        },
      ],
    });
    const plan = buildRenderPlan(manifest, '/today', registry);
    const services = buildTestServices({
      componentRegistry: registry,
      capabilities: { 'thread.archive': archiveCapability() },
    });
    services.actions.register('thread.archive', () => Promise.resolve({ archived_at: 'x' }));
    const { getByTestId } = render(
      <CirRuntime services={services}>
        <RenderNode node={plan.root} />
      </CirRuntime>,
    );
    await act(() => {
      getByTestId('btn').click();
      return Promise.resolve();
    });
    expect(services.dispatcher.canUndo()).toBe(true);
  });

  it('maps node.actions to declared actionSlots when the binding declares them', async () => {
    function Btn(props: Record<string, unknown>): React.ReactElement {
      const fn = props['onPrimaryAction'] as (input: unknown) => Promise<unknown>;
      return (
        <button
          data-testid="btn"
          onClick={() => {
            void fn({ thread_id: 't1' });
          }}
        >
          go
        </button>
      );
    }
    const registry = new MapComponentRegistry({
      Stack: {
        id: 'Stack',
        factory: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
      },
      ActionBar: { id: 'ActionBar', factory: Btn, actionSlots: ['onPrimaryAction'] },
    });
    const manifest = makeManifest({
      routes: [
        {
          path: '/today',
          title: 'Today',
          layout: {
            component: 'Stack',
            children: [{ component: 'ActionBar', actions: ['thread.archive'] }],
          },
        },
      ],
    });
    const plan = buildRenderPlan(manifest, '/today', registry);
    const services = buildTestServices({
      componentRegistry: registry,
      capabilities: { 'thread.archive': archiveCapability() },
    });
    services.actions.register('thread.archive', () => Promise.resolve({ archived_at: 'x' }));
    const { getByTestId } = render(
      <CirRuntime services={services}>
        <RenderNode node={plan.root} />
      </CirRuntime>,
    );
    await act(() => {
      getByTestId('btn').click();
      return Promise.resolve();
    });
    expect(services.dispatcher.canUndo()).toBe(true);
  });

  it('warns once per binding when actions are wired without actionSlots', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    function Btn(): React.ReactElement {
      return <button data-testid="btn">go</button>;
    }
    const registry = new MapComponentRegistry({
      Stack: {
        id: 'Stack',
        factory: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
      },
      ActionBar: { id: 'ActionBar', factory: Btn },
    });
    const manifest = makeManifest({
      routes: [
        {
          path: '/today',
          title: 'Today',
          layout: {
            component: 'Stack',
            children: [
              { component: 'ActionBar', actions: ['thread.archive'] },
              { component: 'ActionBar', actions: ['thread.archive'] },
            ],
          },
        },
      ],
    });
    const plan = buildRenderPlan(manifest, '/today', registry);
    const services = buildTestServices({
      componentRegistry: registry,
      capabilities: { 'thread.archive': archiveCapability() },
    });
    render(
      <CirRuntime services={services}>
        <RenderNode node={plan.root} />
      </CirRuntime>,
    );
    const legacyCalls = warn.mock.calls.filter((call: unknown[]) => {
      const msg = call[0];
      return typeof msg === 'string' && msg.includes('actionSlots');
    });
    expect(legacyCalls).toHaveLength(1);
    warn.mockRestore();
  });

  it('recurses into children', () => {
    function Wrapper({ children }: { children?: React.ReactNode }): React.ReactElement {
      return <div data-testid="wrap">{children}</div>;
    }
    function Leaf(): React.ReactElement {
      return <span data-testid="leaf">leaf</span>;
    }
    const registry = new MapComponentRegistry({
      Stack: { id: 'Stack', factory: Wrapper },
      Greeting: { id: 'Greeting', factory: Leaf },
    });
    const manifest = makeManifest();
    const plan = buildRenderPlan(manifest, '/today', registry);
    const services = buildTestServices({ componentRegistry: registry });
    const { getByTestId } = render(
      <CirRuntime services={services}>
        <RenderNode node={plan.root} />
      </CirRuntime>,
    );
    expect(getByTestId('wrap')).toBeTruthy();
    expect(getByTestId('leaf')).toBeTruthy();
  });

  it('resolves row_binding via registry and threads renderItem (Phase 2 #3)', () => {
    // Row factory receives `props.data` per row.
    function ProductCard(props: Record<string, unknown>): React.ReactElement {
      const data = props['data'] as { id: number; title: string } | undefined;
      return <div data-testid={`row-${String(data?.id)}`}>{data?.title ?? '<no-data>'}</div>;
    }
    // Host component declares an items mode keyed off `data` (mirrors what
    // `<List>` / `<Grid>` ship). It calls the runtime-supplied `renderItem`.
    function Collection(props: Record<string, unknown>): React.ReactElement {
      const items = (props['data'] as readonly unknown[] | undefined) ?? [];
      const renderItem = props['renderItem'] as
        | ((item: unknown, i: number) => React.ReactNode)
        | undefined;
      return (
        <ul data-testid="collection">
          {items.map((it, i) => (
            <li key={i}>{renderItem ? renderItem(it, i) : null}</li>
          ))}
        </ul>
      );
    }
    const registry = new MapComponentRegistry({
      Collection: { id: 'Collection', factory: Collection },
      ProductCard: { id: 'ProductCard', factory: ProductCard },
    });
    const manifest = makeManifest({
      routes: [
        {
          path: '/today',
          title: 'Today',
          layout: {
            component: 'Collection',
            data: { source: 'product.list' },
            row_binding: 'ProductCard',
          },
        },
      ],
    });
    const plan = buildRenderPlan(manifest, '/today', registry);
    const services = buildTestServices({ componentRegistry: registry });
    const products = [
      { id: 1, title: 'Phone' },
      { id: 2, title: 'Laptop' },
    ];
    const { findByTestId } = render(
      <CirRuntime services={services}>
        <DataResolverContext.Provider value={() => Promise.resolve(products)}>
          <RenderNode node={plan.root} />
        </DataResolverContext.Provider>
      </CirRuntime>,
    );
    return findByTestId('row-1').then((el) => {
      expect(el.textContent).toBe('Phone');
      return findByTestId('row-2').then((el2) => {
        expect(el2.textContent).toBe('Laptop');
      });
    });
  });

  it('warns and skips when row_binding cannot be resolved', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    function Collection(props: Record<string, unknown>): React.ReactElement {
      const renderItem = props['renderItem'];
      return <ul data-renderitem={typeof renderItem}></ul>;
    }
    const registry = new MapComponentRegistry({
      Collection: { id: 'Collection', factory: Collection },
    });
    const manifest = makeManifest({
      routes: [
        {
          path: '/today',
          title: 'Today',
          layout: {
            component: 'Collection',
            data: { source: 'product.list' },
            row_binding: 'NotRegistered',
          },
        },
      ],
    });
    const plan = buildRenderPlan(manifest, '/today', registry);
    const services = buildTestServices({ componentRegistry: registry });
    const { container } = render(
      <CirRuntime services={services}>
        <DataResolverContext.Provider value={() => Promise.resolve([])}>
          <RenderNode node={plan.root} />
        </DataResolverContext.Provider>
      </CirRuntime>,
    );
    expect(container.querySelector('ul')?.getAttribute('data-renderitem')).toBe('undefined');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('NotRegistered'));
    warn.mockRestore();
  });

  it('renders fallback children recursively when binding missing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const registry = new MapComponentRegistry();
    const manifest = makeManifest();
    const plan = buildRenderPlan(manifest, '/today', registry);
    const services = buildTestServices({ componentRegistry: registry });
    const { container } = render(
      <CirRuntime services={services}>
        <RenderNode node={plan.root} />
      </CirRuntime>,
    );
    // Outer fallback for Stack.
    expect(container.querySelector('[data-cir-fallback="Stack"]')).not.toBeNull();
    // Inner fallback for Greeting (rendered as nested fallback).
    expect(container.querySelector('[data-cir-fallback="Greeting"]')).not.toBeNull();
    warn.mockRestore();
  });
});

afterEach(() => {
  __resetMissingBindingWarnings();
});
