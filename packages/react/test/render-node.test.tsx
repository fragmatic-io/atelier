// @vitest-environment happy-dom
import './setup.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { buildRenderPlan } from '@cir/runtime';
import { MapComponentRegistry } from '@cir/runtime/testing';
import { RenderNode, __resetMissingBindingWarnings } from '../src/render/render-node.js';
import { CirRuntime } from '../src/context/runtime-provider.js';
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

  // ---------------------------------------------------------------------------
  // Phase 2 #4 — Resolver fallback contract.
  // ---------------------------------------------------------------------------

  it('renders the resolver-default empty state when data resolves to []', async () => {
    function Listy(): React.ReactElement {
      return <div data-testid="row">component-rendered</div>;
    }
    function EmptyState({
      title,
      description,
    }: {
      title?: string;
      description?: string;
    }): React.ReactElement {
      return (
        <div data-testid="default-empty">
          {title}|{description}
        </div>
      );
    }
    const registry = new MapComponentRegistry({
      Stack: {
        id: 'Stack',
        factory: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
      },
      Listy: { id: 'Listy', factory: Listy },
      EmptyState: { id: 'EmptyState', factory: EmptyState },
    });
    const manifest = makeManifest({
      routes: [
        {
          path: '/today',
          title: 'Today',
          layout: {
            component: 'Stack',
            children: [{ component: 'Listy', data: { source: 'thread.list' } }],
          },
        },
      ],
    });
    const plan = buildRenderPlan(manifest, '/today', registry);
    const services = buildTestServices({ componentRegistry: registry });
    const { container, queryByTestId } = render(
      <CirRuntime services={services} dataResolver={() => []}>
        <RenderNode node={plan.root} />
      </CirRuntime>,
    );
    await waitFor(() => {
      const wrapper = container.querySelector('[data-cir-default-state="empty"]');
      expect(wrapper).not.toBeNull();
    });
    // Component itself never rendered — replaced by the default empty.
    expect(queryByTestId('row')).toBeNull();
    expect(queryByTestId('default-empty')?.textContent).toBe('No items|Nothing to show yet.');
  });

  it('honors a host-provided resolverDefaults override', async () => {
    function Listy(): React.ReactElement {
      return <div data-testid="row">x</div>;
    }
    function HostEmpty({ note }: { note?: string }): React.ReactElement {
      return <div data-testid="host-empty">{note}</div>;
    }
    const registry = new MapComponentRegistry({
      Stack: {
        id: 'Stack',
        factory: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
      },
      Listy: { id: 'Listy', factory: Listy },
      HostEmpty: { id: 'HostEmpty', factory: HostEmpty },
    });
    const manifest = makeManifest({
      routes: [
        {
          path: '/today',
          title: 'Today',
          layout: {
            component: 'Stack',
            children: [{ component: 'Listy', data: { source: 'thread.list' } }],
          },
        },
      ],
    });
    const plan = buildRenderPlan(manifest, '/today', registry);
    const services = buildTestServices({ componentRegistry: registry });
    services.resolverDefaults = {
      empty: {
        component: 'HostEmpty',
        props: { note: 'host says nothing here' },
        children: [],
      },
    };
    const { container, getByTestId } = render(
      <CirRuntime services={services} dataResolver={() => []}>
        <RenderNode node={plan.root} />
      </CirRuntime>,
    );
    await waitFor(() => expect(getByTestId('host-empty')).toBeTruthy());
    expect(getByTestId('host-empty').textContent).toBe('host says nothing here');
    expect(container.querySelector('[data-cir-default-state="empty"]')).not.toBeNull();
  });

  it('renders the manifest-declared empty_state slot in preference to the default', async () => {
    function Listy(): React.ReactElement {
      return <div data-testid="row">x</div>;
    }
    function CustomEmpty({ tag }: { tag?: string }): React.ReactElement {
      return <div data-testid="custom-empty">{tag}</div>;
    }
    const registry = new MapComponentRegistry({
      Stack: {
        id: 'Stack',
        factory: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
      },
      Listy: { id: 'Listy', factory: Listy },
      CustomEmpty: { id: 'CustomEmpty', factory: CustomEmpty },
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
                  source: 'thread.list',
                  empty_state: {
                    component: 'CustomEmpty',
                    props: { tag: 'inbox-zero' },
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
    const { container, getByTestId } = render(
      <CirRuntime services={services} dataResolver={() => []}>
        <RenderNode node={plan.root} />
      </CirRuntime>,
    );
    await waitFor(() => expect(getByTestId('custom-empty')).toBeTruthy());
    // Author-supplied slot — no resolver-default wrapper.
    expect(container.querySelector('[data-cir-default-state]')).toBeNull();
    expect(getByTestId('custom-empty').textContent).toBe('inbox-zero');
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
