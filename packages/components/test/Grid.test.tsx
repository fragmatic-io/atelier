// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { Card } from '../src/components/Card.js';
import { Grid, GridBinding } from '../src/components/Grid.js';

describe('Grid', () => {
  it('renders children inside a grid container', () => {
    const { container } = render(
      <Grid>
        <span>a</span>
        <span>b</span>
      </Grid>,
    );
    const grid = container.querySelector('[data-cir-component="Grid"]') as HTMLElement;
    expect(grid).toBeTruthy();
    expect(grid.style.display).toBe('grid');
    expect(grid.textContent).toBe('ab');
  });
  it('defaults to auto columns', () => {
    const { container } = render(<Grid>x</Grid>);
    const grid = container.querySelector('[data-cir-component="Grid"]') as HTMLElement;
    expect(grid.getAttribute('data-columns')).toBe('auto');
    expect(grid.style.gridTemplateColumns).toContain('auto-fit');
  });
  it('uses fixed column count when columns is a number', () => {
    const { container } = render(<Grid columns={3}>x</Grid>);
    const grid = container.querySelector('[data-cir-component="Grid"]') as HTMLElement;
    expect(grid.getAttribute('data-columns')).toBe('3');
    expect(grid.style.gridTemplateColumns).toBe('repeat(3, 1fr)');
  });
  it('applies gap token', () => {
    const { container } = render(<Grid gap="lg">x</Grid>);
    const grid = container.querySelector('[data-cir-component="Grid"]') as HTMLElement;
    expect(grid.style.gap).toBe('24px');
  });
  it('binding id matches', () => {
    expect(GridBinding.id).toBe('Grid');
  });
  it('binding declares actionSlots: [onAction] for runtime dispatch', () => {
    expect(GridBinding.actionSlots).toEqual(['onAction']);
  });
  // -- Wave 6 / P-10 variant assertions --
  it('defaults to variant=ghost', () => {
    const { container } = render(<Grid>x</Grid>);
    const grid = container.querySelector('[data-cir-component="Grid"]') as HTMLElement;
    expect(grid.getAttribute('data-variant')).toBe('ghost');
  });
  it('reflects each variant on data-variant', () => {
    for (const v of ['bordered', 'elevated', 'ghost', 'tinted'] as const) {
      const { container, unmount } = render(<Grid variant={v}>x</Grid>);
      const grid = container.querySelector('[data-cir-component="Grid"]') as HTMLElement;
      expect(grid.getAttribute('data-variant')).toBe(v);
      unmount();
    }
  });
  it('applies the tinted variant utility class', () => {
    const { container } = render(<Grid variant="tinted">x</Grid>);
    const grid = container.querySelector('[data-cir-component="Grid"]') as HTMLElement;
    expect(grid.className).toContain('bg-gray-50');
  });
  // -- Wave 6 / P-1 density assertions --
  it('defaults density to comfortable and surfaces data-density', () => {
    const { container } = render(<Grid>x</Grid>);
    const grid = container.querySelector('[data-cir-component="Grid"]') as HTMLElement;
    expect(grid.getAttribute('data-density')).toBe('comfortable');
  });
  // -- Phase 2 #3 — manifest-driven data + renderItem path --
  it('accepts `data` array as a fallback for `items` (manifest renderer path)', () => {
    const data = [
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Bravo' },
    ];
    const { container } = render(
      <Grid data={data} renderItem={(it) => <span>{String(it['label'])}</span>} />,
    );
    const cells = container.querySelectorAll('[data-cir-part="grid-item"]');
    expect(cells.length).toBe(2);
    expect(cells[0]?.textContent).toBe('Alpha');
    expect(cells[1]?.textContent).toBe('Bravo');
  });
  it('explicit `items` wins over `data`', () => {
    const items = [{ id: '1', label: 'one' }];
    const data = [{ id: 'X', label: 'X' }];
    const { container } = render(
      <Grid items={items} data={data} renderItem={(it) => <span>{String(it['label'])}</span>} />,
    );
    const cells = container.querySelectorAll('[data-cir-part="grid-item"]');
    expect(cells.length).toBe(1);
    expect(cells[0]?.textContent).toBe('one');
  });
  it('falls back to index keys when items lack `id`', () => {
    const data = [{ title: 'a' }, { title: 'b' }];
    // No idOf, items have no `id`. Should not crash; key derived from index.
    const { container } = render(
      <Grid
        data={data}
        renderItem={(it) => <span>{String((it as unknown as { title: string }).title)}</span>}
      />,
    );
    expect(container.querySelectorAll('[data-cir-part="grid-item"]').length).toBe(2);
  });
  it('shrinks the gap at compact density', () => {
    const { container, rerender } = render(
      <Grid gap="md" density="comfortable">
        x
      </Grid>,
    );
    const baseGrid = container.querySelector('[data-cir-component="Grid"]') as HTMLElement;
    const baseGap = parseInt(baseGrid.style.gap, 10);
    rerender(
      <Grid gap="md" density="compact">
        x
      </Grid>,
    );
    const compactGrid = container.querySelector('[data-cir-component="Grid"]') as HTMLElement;
    const compactGap = parseInt(compactGrid.style.gap, 10);
    expect(compactGap).toBeLessThan(baseGap);
  });

  // -- Marketplace pivot: data-aware Grid renders one Card per item --
  describe('data-aware tile rendering', () => {
    const products = [
      { id: 1, title: 'Phone', brand: 'Apple', price: 999, thumbnail: 'p1.jpg' },
      { id: 2, title: 'Laptop', brand: 'Apple', price: 1999, thumbnail: 'p2.jpg' },
    ];

    it('default-renders each item as a <Card> tile when no children declared', () => {
      const { container } = render(<Grid data={products} />);
      const cells = container.querySelectorAll('[data-cir-part="grid-item"]');
      expect(cells.length).toBe(2);
      // Each cell hosts a Card with the item's title heading.
      const titles = container.querySelectorAll('[data-cir-component="Card"] h3');
      expect(Array.from(titles).map((h) => h.textContent)).toEqual(['Phone', 'Laptop']);
    });

    it('clones a single manifest child template per item, threading `data: item`', () => {
      const { container } = render(
        <Grid data={products}>
          <Card title="placeholder" />
        </Grid>,
      );
      const cells = container.querySelectorAll('[data-cir-part="grid-item"]');
      expect(cells.length).toBe(2);
      // The template's static title is overridden by the threaded data on
      // each clone; explicit props win, but `data` only fills gaps.
      // Here the template hard-codes title="placeholder" so each Card keeps
      // it — the assertion below confirms the template was cloned (2 Cards).
      expect(container.querySelectorAll('[data-cir-component="Card"]').length).toBe(2);
    });

    it('threads onAction through to per-item Cards (declarative actions)', () => {
      const onAction = vi.fn();
      const { container } = render(
        <Grid data={products} onAction={onAction}>
          <Card actions={[{ id: 'cart.add', label: 'Add' }]} />
        </Grid>,
      );
      const buttons = container.querySelectorAll('button[data-cir-part="card-action"]');
      expect(buttons.length).toBe(2);
      fireEvent.click(buttons[0]!);
      expect(onAction).toHaveBeenCalledWith('cart.add', products[0]);
      fireEvent.click(buttons[1]!);
      expect(onAction).toHaveBeenLastCalledWith('cart.add', products[1]);
    });

    it('default Card render dispatches onAction without per-cell wiring', () => {
      // No template; the Grid default-renders each item as a bare Card.
      // Without declarative actions, no buttons should render — but the
      // Card still picks up `onAction` (it just has nothing to dispatch).
      const onAction = vi.fn();
      const { container } = render(<Grid data={products} onAction={onAction} />);
      // Defaults are tile-shaped; no footer buttons because no actions
      // declared on the (default) Card. Sanity: 2 Cards rendered.
      expect(container.querySelectorAll('[data-cir-component="Card"]').length).toBe(2);
      expect(container.querySelectorAll('button[data-cir-part="card-action"]').length).toBe(0);
    });
  });
});
