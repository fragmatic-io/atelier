// @vitest-environment happy-dom
import './setup.js';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { List, ListBinding } from '../src/components/List.js';
import type { BulkAction } from '../src/components/BulkActionBar.js';

describe('List', () => {
  it('renders one li per item', () => {
    const items = ['a', 'b', 'c'];
    const { container } = render(<List items={items} renderItem={(x) => <span>{x}</span>} />);
    expect(container.querySelectorAll('li').length).toBe(3);
  });
  it('reflects bordered as data attr', () => {
    const { container } = render(<List items={['a']} bordered renderItem={() => null} />);
    expect(container.querySelector('ul')?.getAttribute('data-bordered')).toBe('true');
  });
  it('binding id matches', () => {
    expect(ListBinding.id).toBe('List');
  });
  // -- Wave 6 / P-10 variant assertions --
  it('defaults to variant=ghost', () => {
    const { container } = render(<List items={['a']} renderItem={() => null} />);
    expect(container.querySelector('ul')?.getAttribute('data-variant')).toBe('ghost');
  });
  it('reflects each variant on data-variant', () => {
    for (const v of ['bordered', 'elevated', 'ghost', 'tinted'] as const) {
      const { container, unmount } = render(
        <List items={['a']} variant={v} renderItem={() => null} />,
      );
      expect(container.querySelector('ul')?.getAttribute('data-variant')).toBe(v);
      unmount();
    }
  });
  it('applies the elevated variant class', () => {
    const { container } = render(<List items={['a']} variant="elevated" renderItem={() => null} />);
    expect(container.querySelector('ul')?.className).toContain('shadow-md');
  });
  // -- Wave 6 / P-1 density assertions --
  it('defaults density to comfortable and surfaces data-density on the <ul>', () => {
    const { container } = render(<List items={['a']} renderItem={(x) => <span>{x}</span>} />);
    expect(container.querySelector('ul')?.getAttribute('data-density')).toBe('comfortable');
  });
  it('shrinks per-row vertical padding at compact density', () => {
    const { container, rerender } = render(
      <List items={['a']} renderItem={() => null} density="comfortable" />,
    );
    const comfyLi = container.querySelector('li') as HTMLElement | null;
    const comfyPad = parseInt(comfyLi?.style.paddingTop ?? '0', 10);
    rerender(<List items={['a']} renderItem={() => null} density="compact" />);
    const compactLi = container.querySelector('li') as HTMLElement | null;
    const compactPad = parseInt(compactLi?.style.paddingTop ?? '0', 10);
    expect(compactPad).toBeLessThan(comfyPad);
  });
  // -- Wave 7b / Nav-3 — pinned items --
  describe('pinned items', () => {
    interface Item {
      id: string;
      label: string;
      pinned?: boolean;
    }
    const renderRow = (x: Item) => <span data-testid={x.id}>{x.label}</span>;
    it('renders pinned items before unpinned regardless of source order', () => {
      const items: Item[] = [
        { id: 'a', label: 'Alpha' },
        { id: 'b', label: 'Bravo', pinned: true },
        { id: 'c', label: 'Charlie' },
      ];
      const { container } = render(<List items={items} renderItem={renderRow} />);
      const labels = Array.from(container.querySelectorAll('li [data-testid]')).map(
        (n) => n.textContent ?? '',
      );
      expect(labels).toEqual(['Bravo', 'Alpha', 'Charlie']);
    });
    it('stacks multiple pinned items in their source order', () => {
      const items: Item[] = [
        { id: 'a', label: 'Alpha', pinned: true },
        { id: 'b', label: 'Bravo' },
        { id: 'c', label: 'Charlie', pinned: true },
      ];
      const { container } = render(<List items={items} renderItem={renderRow} />);
      const pinnedRowText = Array.from(container.querySelectorAll('li[data-pinned="true"]')).map(
        (li) => li.querySelector('[data-testid]')?.textContent ?? '',
      );
      expect(pinnedRowText).toEqual(['Alpha', 'Charlie']);
    });
    it('does not change rendering when no pinned items present', () => {
      const items: Item[] = [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ];
      const { container } = render(<List items={items} renderItem={renderRow} />);
      expect(container.querySelectorAll('li[data-pinned="true"]').length).toBe(0);
      expect(container.querySelector('[data-cir-part="pinned-separator"]')).toBeNull();
      expect(container.querySelector('ul')?.getAttribute('data-has-pinned')).toBe('false');
    });
    it('marks pinned <li> with data-pinned="true"', () => {
      const items: Item[] = [{ id: 'a', label: 'Alpha', pinned: true }];
      const { container } = render(<List items={items} renderItem={renderRow} />);
      expect(container.querySelector('li[data-pinned="true"]')).not.toBeNull();
    });
    it('renders a pin indicator inside each pinned item', () => {
      const items: Item[] = [{ id: 'a', label: 'Alpha', pinned: true }];
      const { container } = render(<List items={items} renderItem={renderRow} />);
      const indicator = container.querySelector(
        'li[data-pinned="true"] [data-pin-indicator="true"]',
      );
      expect(indicator).not.toBeNull();
      expect(indicator?.textContent ?? '').toContain('\u{1F4CC}');
    });
    it('renders a separator when pinned items exist (default)', () => {
      const items: Item[] = [
        { id: 'a', label: 'A', pinned: true },
        { id: 'b', label: 'B' },
      ];
      const { container } = render(<List items={items} renderItem={renderRow} />);
      expect(container.querySelector('[data-cir-part="pinned-separator"]')).not.toBeNull();
    });
    it('omits the separator when showPinnedSeparator={false}', () => {
      const items: Item[] = [
        { id: 'a', label: 'A', pinned: true },
        { id: 'b', label: 'B' },
      ];
      const { container } = render(
        <List items={items} renderItem={renderRow} showPinnedSeparator={false} />,
      );
      expect(container.querySelector('[data-cir-part="pinned-separator"]')).toBeNull();
    });
    it('applies sticky CSS to pinned items', () => {
      const items: Item[] = [{ id: 'a', label: 'A', pinned: true }];
      const { container } = render(<List items={items} renderItem={renderRow} />);
      const li = container.querySelector<HTMLElement>('li[data-pinned="true"]');
      expect(li?.style.position).toBe('sticky');
      expect(li?.style.top).toBe('0px');
      expect(li?.style.zIndex).toBe('10');
    });
    it('uses pinAriaLabel callback for the aria-label on pinned items', () => {
      const items: Item[] = [{ id: 'a', label: 'Alpha', pinned: true }];
      const { container } = render(
        <List items={items} renderItem={renderRow} pinAriaLabel={(it) => `Pinned: ${it.label}`} />,
      );
      expect(container.querySelector('li[data-pinned="true"]')?.getAttribute('aria-label')).toBe(
        'Pinned: Alpha',
      );
    });
    it('defaults pinned aria-label to "Pinned"', () => {
      const items: Item[] = [{ id: 'a', label: 'Alpha', pinned: true }];
      const { container } = render(<List items={items} renderItem={renderRow} />);
      expect(container.querySelector('li[data-pinned="true"]')?.getAttribute('aria-label')).toBe(
        'Pinned',
      );
    });
  });
  // -- Wave 7c / track A — selectable integration --
  describe('selectable + bulk actions', () => {
    interface Row {
      id: string;
      label: string;
    }
    const rows: Row[] = [
      { id: 'r1', label: 'One' },
      { id: 'r2', label: 'Two' },
      { id: 'r3', label: 'Three' },
      { id: 'r4', label: 'Four' },
    ];
    const renderRow = (r: Row): ReactNode => <span>{r.label}</span>;
    const idOf = (r: Row): string => r.id;
    const actions: readonly BulkAction[] = [
      { id: 'archive', label: 'Archive' },
      { id: 'delete', label: 'Delete', variant: 'destructive' },
    ];

    it('renders a checkbox in every row when selectable=true', () => {
      const { container } = render(
        <List items={rows} renderItem={renderRow} selectable idOf={idOf} />,
      );
      const checkboxes = container.querySelectorAll<HTMLInputElement>(
        'input[data-cir-part="list-checkbox"]',
      );
      expect(checkboxes.length).toBe(rows.length);
      expect(container.querySelector('ul')?.getAttribute('data-selectable')).toBe('true');
    });

    it('click toggles selection and fires onSelectionChange', () => {
      const onSelectionChange = vi.fn();
      const { container } = render(
        <List
          items={rows}
          renderItem={renderRow}
          selectable
          idOf={idOf}
          onSelectionChange={onSelectionChange}
        />,
      );
      const checkboxes = container.querySelectorAll<HTMLInputElement>(
        'input[data-cir-part="list-checkbox"]',
      );
      fireEvent.click(checkboxes[1]!);
      const next = onSelectionChange.mock.calls[0]?.[0] as ReadonlySet<string>;
      expect(Array.from(next)).toEqual(['r2']);
    });

    it('shift-click range-selects between the anchor and the new row', () => {
      const onSelectionChange = vi.fn();
      const { container } = render(
        <List
          items={rows}
          renderItem={renderRow}
          selectable
          idOf={idOf}
          onSelectionChange={onSelectionChange}
        />,
      );
      const checkboxes = container.querySelectorAll<HTMLInputElement>(
        'input[data-cir-part="list-checkbox"]',
      );
      // First click anchors r1 (uncontrolled local fallback persists the
      // anchor across renders even when the host doesn't reflect state back).
      fireEvent.click(checkboxes[0]!);
      // Shift-click on r3 → expect r1, r2, r3 all selected.
      fireEvent.click(checkboxes[2]!, { shiftKey: true });
      const last = onSelectionChange.mock.calls.at(-1)?.[0] as ReadonlySet<string>;
      expect(Array.from(last).sort()).toEqual(['r1', 'r2', 'r3']);
    });

    it('reflects controlled selectedIds via data-selected', () => {
      const selected = new Set<string>(['r2', 'r4']);
      const { container } = render(
        <List items={rows} renderItem={renderRow} selectable idOf={idOf} selectedIds={selected} />,
      );
      const lis = container.querySelectorAll('li[data-cir-part="list-item"]');
      const states = Array.from(lis).map((li) => li.getAttribute('data-selected'));
      expect(states).toEqual(['false', 'true', 'false', 'true']);
    });

    it('does not auto-mount BulkActionBar with empty selection', () => {
      render(
        <List items={rows} renderItem={renderRow} selectable idOf={idOf} bulkActions={actions} />,
      );
      expect(document.querySelector('[data-cir-component="BulkActionBar"]')).toBeNull();
    });

    it('auto-mounts BulkActionBar once selection >= 1 (controlled)', () => {
      render(
        <List
          items={rows}
          renderItem={renderRow}
          selectable
          idOf={idOf}
          selectedIds={new Set(['r1'])}
          bulkActions={actions}
        />,
      );
      const bar = document.querySelector('[data-cir-component="BulkActionBar"]');
      expect(bar).not.toBeNull();
      expect(screen.getByText('1 selected')).toBeTruthy();
    });

    it('clicking an action button forwards onBulkAction(id)', () => {
      const onBulkAction = vi.fn();
      render(
        <List
          items={rows}
          renderItem={renderRow}
          selectable
          idOf={idOf}
          selectedIds={new Set(['r1', 'r2'])}
          bulkActions={actions}
          onBulkAction={onBulkAction}
        />,
      );
      const archiveBtn = document.querySelector<HTMLButtonElement>('[data-action-id="archive"]');
      fireEvent.click(archiveBtn!);
      expect(onBulkAction).toHaveBeenCalledWith('archive');
    });

    it('Esc on the bar clears the selection (uncontrolled)', () => {
      const { container } = render(
        <List items={rows} renderItem={renderRow} selectable idOf={idOf} bulkActions={actions} />,
      );
      const checkboxes = container.querySelectorAll<HTMLInputElement>(
        'input[data-cir-part="list-checkbox"]',
      );
      fireEvent.click(checkboxes[0]!);
      // Bar mounts because the local fallback persists the selection.
      expect(document.querySelector('[data-cir-component="BulkActionBar"]')).not.toBeNull();
      fireEvent.keyDown(window, { key: 'Escape' });
      // Bar unmounts because the local selection went back to empty.
      expect(document.querySelector('[data-cir-component="BulkActionBar"]')).toBeNull();
      // And no row carries data-selected="true" any more.
      const lis = container.querySelectorAll('li[data-cir-part="list-item"]');
      const states = Array.from(lis).map((li) => li.getAttribute('data-selected'));
      expect(states.every((s) => s === 'false')).toBe(true);
    });

    it('omitted bulkActions never mounts the bar even with selection', () => {
      render(
        <List
          items={rows}
          renderItem={renderRow}
          selectable
          idOf={idOf}
          selectedIds={new Set(['r1'])}
        />,
      );
      expect(document.querySelector('[data-cir-component="BulkActionBar"]')).toBeNull();
    });

    it('non-selectable list renders identically (backwards compat)', () => {
      const { container } = render(<List items={rows} renderItem={renderRow} />);
      expect(container.querySelectorAll('input[data-cir-part="list-checkbox"]').length).toBe(0);
      expect(container.querySelector('ul')?.getAttribute('data-selectable')).toBe('false');
    });

    it('selectable + pinned items coexist (pinned row also gets a checkbox)', () => {
      interface PinRow {
        id: string;
        label: string;
        pinned?: boolean;
      }
      const mixed: PinRow[] = [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B', pinned: true },
        { id: 'c', label: 'C' },
      ];
      const { container } = render(
        <List
          items={mixed}
          renderItem={(it) => <span>{it.label}</span>}
          selectable
          idOf={(it) => it.id}
        />,
      );
      const pinnedLi = container.querySelector('li[data-pinned="true"]');
      expect(pinnedLi).not.toBeNull();
      expect(pinnedLi?.querySelector('input[data-cir-part="list-checkbox"]')).not.toBeNull();
    });
  });
});
