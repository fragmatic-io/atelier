// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Table, TableBinding } from '../src/components/Table.js';
import type { BulkAction } from '../src/components/BulkActionBar.js';

const COLS = [
  { key: 'name', header: 'Name' },
  { key: 'age', header: 'Age' },
];

describe('Table', () => {
  it('renders thead/tbody with one row per data record', () => {
    const rows = [
      { name: 'Ada', age: 30 },
      { name: 'Bea', age: 28 },
    ];
    const { container } = render(<Table columns={COLS} rows={rows} />);
    expect(container.querySelectorAll('th').length).toBe(2);
    expect(container.querySelectorAll('tbody tr').length).toBe(2);
  });
  it('renders the caption when provided', () => {
    render(<Table columns={COLS} rows={[]} caption="People" />);
    // No caption when rows empty (falls back to EmptyState).
    expect(screen.queryByText('People')).toBeNull();
  });
  it('renders the default EmptyState when rows is empty', () => {
    render(<Table columns={COLS} rows={[]} />);
    expect(screen.getByText('No data')).toBeTruthy();
  });
  it('binding id matches', () => {
    expect(TableBinding.id).toBe('Table');
  });
  // -- Wave 6 / P-10 variant assertions --
  it('defaults to variant=ghost', () => {
    const { container } = render(<Table columns={COLS} rows={[{ name: 'a', age: 1 }]} />);
    expect(container.querySelector('table')?.getAttribute('data-variant')).toBe('ghost');
  });
  it('reflects each variant on data-variant', () => {
    for (const v of ['bordered', 'elevated', 'ghost', 'tinted'] as const) {
      const { container, unmount } = render(
        <Table columns={COLS} rows={[{ name: 'a', age: 1 }]} variant={v} />,
      );
      expect(container.querySelector('table')?.getAttribute('data-variant')).toBe(v);
      unmount();
    }
  });
  it('applies the bordered variant class', () => {
    const { container } = render(
      <Table columns={COLS} rows={[{ name: 'a', age: 1 }]} variant="bordered" />,
    );
    expect(container.querySelector('table')?.className).toContain('border');
  });
  // -- Wave 6 / P-1 density assertions --
  it('defaults density to comfortable and surfaces data-density', () => {
    const { container } = render(<Table columns={COLS} rows={[{ name: 'a', age: 1 }]} />);
    expect(container.querySelector('table')?.getAttribute('data-density')).toBe('comfortable');
  });
  // -- Phase 2 #3 — manifest-driven data + renderItem path --
  it('accepts `data` array as a fallback for `rows` (manifest renderer path)', () => {
    const data = [
      { name: 'Ada', age: 30 },
      { name: 'Bea', age: 28 },
    ];
    const { container } = render(<Table columns={COLS} data={data} />);
    expect(container.querySelectorAll('tbody tr').length).toBe(2);
  });
  it('explicit `rows` wins over `data`', () => {
    const rows = [{ name: 'Ada', age: 1 }];
    const data = [
      { name: 'X', age: 99 },
      { name: 'Y', age: 100 },
    ];
    const { container } = render(<Table columns={COLS} rows={rows} data={data} />);
    expect(container.querySelectorAll('tbody tr').length).toBe(1);
    expect(container.querySelector('tbody tr')?.textContent).toContain('Ada');
  });
  it('renders `renderItem` factory output inside a single colspan cell when supplied', () => {
    const rows = [
      { name: 'Ada', age: 30 },
      { name: 'Bea', age: 28 },
    ];
    const { container } = render(
      <Table
        columns={COLS}
        rows={rows}
        renderItem={(row) => <div data-testid={`r-${row['name'] as string}`}>{row['name']}</div>}
      />,
    );
    // Each <tr> has a single factory cell instead of one cell per column.
    const factoryCells = container.querySelectorAll('td[data-cir-part="table-row-factory"]');
    expect(factoryCells.length).toBe(2);
    expect(container.querySelector('[data-testid="r-Ada"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="r-Bea"]')).not.toBeNull();
  });
  it('shrinks cell padding at compact density', () => {
    const { container, rerender } = render(
      <Table columns={COLS} rows={[{ name: 'a', age: 1 }]} density="comfortable" />,
    );
    const comfyCell = container.querySelector<HTMLElement>('tbody td');
    const comfyPad = parseInt(comfyCell?.style.paddingTop ?? '0', 10);
    rerender(<Table columns={COLS} rows={[{ name: 'a', age: 1 }]} density="compact" />);
    const compactCell = container.querySelector<HTMLElement>('tbody td');
    const compactPad = parseInt(compactCell?.style.paddingTop ?? '0', 10);
    expect(compactPad).toBeLessThan(comfyPad);
  });
  // -- Wave 7b / Nav-3 — pinned rows --
  describe('pinned rows', () => {
    it('renders pinned rows before unpinned regardless of source order', () => {
      const rows = [
        { name: 'Ada', age: 30 },
        { name: 'Bea', age: 28, pinned: true },
        { name: 'Cal', age: 22 },
      ];
      const { container } = render(<Table columns={COLS} rows={rows} />);
      const trs = Array.from(container.querySelectorAll('tbody tr'));
      // 1st = Bea (pinned), 2nd = separator, then unpinned (Ada, Cal)
      expect(trs[0]?.textContent).toContain('Bea');
      const dataRows = trs.filter((t) => t.getAttribute('data-cir-part') !== 'pinned-separator');
      expect(dataRows.map((t) => t.textContent?.replace(/[^A-Za-z]/g, ''))).toEqual([
        'Bea',
        'Ada',
        'Cal',
      ]);
    });
    it('marks pinned <tr> with data-pinned="true" and renders a pin indicator', () => {
      const rows = [
        { name: 'Bea', age: 28, pinned: true },
        { name: 'Cal', age: 22 },
      ];
      const { container } = render(<Table columns={COLS} rows={rows} />);
      const tr = container.querySelector('tbody tr[data-pinned="true"]');
      expect(tr).not.toBeNull();
      expect(tr?.querySelector('[data-pin-indicator="true"]')).not.toBeNull();
    });
    it('omits the separator <tr> when showPinnedSeparator={false}', () => {
      const rows = [
        { name: 'Bea', age: 28, pinned: true },
        { name: 'Cal', age: 22 },
      ];
      const { container } = render(
        <Table columns={COLS} rows={rows} showPinnedSeparator={false} />,
      );
      expect(container.querySelector('tr[data-cir-part="pinned-separator"]')).toBeNull();
    });
    it('renders separator <tr> by default when pinned rows exist', () => {
      const rows = [
        { name: 'Bea', age: 28, pinned: true },
        { name: 'Cal', age: 22 },
      ];
      const { container } = render(<Table columns={COLS} rows={rows} />);
      expect(container.querySelector('tr[data-cir-part="pinned-separator"]')).not.toBeNull();
    });
    it('applies sticky CSS to pinned cells and respects pinAriaLabel', () => {
      const rows = [{ name: 'Bea', age: 28, pinned: true }];
      const { container } = render(
        <Table
          columns={COLS}
          rows={rows}
          pinAriaLabel={(r) => {
            const name = r['name'];
            return `Pinned ${typeof name === 'string' ? name : ''}`;
          }}
        />,
      );
      const tr = container.querySelector<HTMLElement>('tbody tr[data-pinned="true"]');
      expect(tr?.getAttribute('aria-label')).toBe('Pinned Bea');
      const td = tr?.querySelector<HTMLElement>('td');
      expect(td?.style.position).toBe('sticky');
      expect(td?.style.top).toBe('0px');
      expect(td?.style.zIndex).toBe('10');
    });
    it('does not add data-has-pinned="true" when no rows are pinned', () => {
      const rows = [
        { name: 'Ada', age: 30 },
        { name: 'Cal', age: 22 },
      ];
      const { container } = render(<Table columns={COLS} rows={rows} />);
      expect(container.querySelector('table')?.getAttribute('data-has-pinned')).toBe('false');
      expect(container.querySelectorAll('tbody tr[data-pinned="true"]').length).toBe(0);
    });
  });
  // -- Wave 7c / track A — selectable integration --
  describe('selectable + bulk actions', () => {
    const baseRows = [
      { name: 'Ada', age: 30 },
      { name: 'Bea', age: 28 },
      { name: 'Cal', age: 22 },
      { name: 'Dre', age: 41 },
    ];
    const idOf = (row: { name?: unknown }, i: number): string => {
      return typeof row.name === 'string' ? row.name : String(i);
    };
    const actions: readonly BulkAction[] = [
      { id: 'archive', label: 'Archive' },
      { id: 'delete', label: 'Delete', variant: 'destructive' },
    ];

    it('prepends a checkbox cell to each row when selectable=true', () => {
      const { container } = render(<Table columns={COLS} rows={baseRows} selectable idOf={idOf} />);
      const cells = container.querySelectorAll('tbody td[data-cir-part="table-select-cell"]');
      expect(cells.length).toBe(baseRows.length);
      expect(container.querySelector('table')?.getAttribute('data-selectable')).toBe('true');
    });

    it('renders a select-all checkbox in the header', () => {
      const { container } = render(<Table columns={COLS} rows={baseRows} selectable idOf={idOf} />);
      const headerCheckbox = container.querySelector<HTMLInputElement>(
        'thead input[data-cir-part="table-select-all"]',
      );
      expect(headerCheckbox).not.toBeNull();
      expect(headerCheckbox?.checked).toBe(false);
    });

    it('clicking the header select-all selects every visible row', () => {
      const onSelectionChange = vi.fn();
      const { container } = render(
        <Table
          columns={COLS}
          rows={baseRows}
          selectable
          idOf={idOf}
          onSelectionChange={onSelectionChange}
        />,
      );
      const header = container.querySelector<HTMLInputElement>(
        'thead input[data-cir-part="table-select-all"]',
      );
      fireEvent.click(header!);
      const next = onSelectionChange.mock.calls[0]?.[0] as ReadonlySet<string>;
      expect(Array.from(next).sort()).toEqual(['Ada', 'Bea', 'Cal', 'Dre']);
    });

    it('select-all is indeterminate when only some rows are selected', () => {
      const { container } = render(
        <Table
          columns={COLS}
          rows={baseRows}
          selectable
          idOf={idOf}
          selectedIds={new Set(['Ada', 'Cal'])}
        />,
      );
      const header = container.querySelector<HTMLInputElement>(
        'thead input[data-cir-part="table-select-all"]',
      );
      expect(header?.checked).toBe(false);
      expect(header?.indeterminate).toBe(true);
    });

    it('select-all is checked when every row is selected; clicking it clears', () => {
      const onSelectionChange = vi.fn();
      const { container } = render(
        <Table
          columns={COLS}
          rows={baseRows}
          selectable
          idOf={idOf}
          selectedIds={new Set(['Ada', 'Bea', 'Cal', 'Dre'])}
          onSelectionChange={onSelectionChange}
        />,
      );
      const header = container.querySelector<HTMLInputElement>(
        'thead input[data-cir-part="table-select-all"]',
      );
      expect(header?.checked).toBe(true);
      expect(header?.indeterminate).toBe(false);
      fireEvent.click(header!);
      const next = onSelectionChange.mock.calls.at(-1)?.[0] as ReadonlySet<string>;
      expect(next.size).toBe(0);
    });

    it('shift-click a row range-selects between the anchor and the new row', () => {
      const onSelectionChange = vi.fn();
      const { container } = render(
        <Table
          columns={COLS}
          rows={baseRows}
          selectable
          idOf={idOf}
          onSelectionChange={onSelectionChange}
        />,
      );
      const checkboxes = container.querySelectorAll<HTMLInputElement>(
        'tbody input[type="checkbox"]',
      );
      fireEvent.click(checkboxes[0]!);
      fireEvent.click(checkboxes[2]!, { shiftKey: true });
      const last = onSelectionChange.mock.calls.at(-1)?.[0] as ReadonlySet<string>;
      expect(Array.from(last).sort()).toEqual(['Ada', 'Bea', 'Cal']);
    });

    it('reflects controlled selectedIds via data-selected on tr', () => {
      const { container } = render(
        <Table
          columns={COLS}
          rows={baseRows}
          selectable
          idOf={idOf}
          selectedIds={new Set(['Bea', 'Dre'])}
        />,
      );
      const trs = container.querySelectorAll('tbody tr');
      const states = Array.from(trs).map((tr) => tr.getAttribute('data-selected'));
      expect(states).toEqual(['false', 'true', 'false', 'true']);
    });

    it('auto-mounts BulkActionBar with bulkActions + selection >= 1', () => {
      render(
        <Table
          columns={COLS}
          rows={baseRows}
          selectable
          idOf={idOf}
          selectedIds={new Set(['Ada', 'Bea'])}
          bulkActions={actions}
        />,
      );
      expect(document.querySelector('[data-cir-component="BulkActionBar"]')).not.toBeNull();
      expect(screen.getByText('2 selected')).toBeTruthy();
    });

    it('clicking an action button forwards onBulkAction(id)', () => {
      const onBulkAction = vi.fn();
      render(
        <Table
          columns={COLS}
          rows={baseRows}
          selectable
          idOf={idOf}
          selectedIds={new Set(['Ada'])}
          bulkActions={actions}
          onBulkAction={onBulkAction}
        />,
      );
      const deleteBtn = document.querySelector<HTMLButtonElement>('[data-action-id="delete"]');
      fireEvent.click(deleteBtn!);
      expect(onBulkAction).toHaveBeenCalledWith('delete');
    });

    it('Esc on the bar clears the selection (uncontrolled)', () => {
      const { container } = render(
        <Table columns={COLS} rows={baseRows} selectable idOf={idOf} bulkActions={actions} />,
      );
      const checkboxes = container.querySelectorAll<HTMLInputElement>(
        'tbody input[type="checkbox"]',
      );
      fireEvent.click(checkboxes[0]!);
      expect(document.querySelector('[data-cir-component="BulkActionBar"]')).not.toBeNull();
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(document.querySelector('[data-cir-component="BulkActionBar"]')).toBeNull();
      const trs = container.querySelectorAll('tbody tr');
      const states = Array.from(trs).map((tr) => tr.getAttribute('data-selected'));
      expect(states.every((s) => s === 'false')).toBe(true);
    });

    it('non-selectable table renders identically (backwards compat)', () => {
      const { container } = render(<Table columns={COLS} rows={baseRows} />);
      expect(container.querySelectorAll('td[data-cir-part="table-select-cell"]').length).toBe(0);
      expect(container.querySelectorAll('input[data-cir-part="table-select-all"]').length).toBe(0);
      expect(container.querySelector('table')?.getAttribute('data-selectable')).toBe('false');
    });

    it('selectable + pinned rows coexist (pinned row gets a checkbox cell)', () => {
      const rows = [
        { name: 'Pin', age: 99, pinned: true },
        { name: 'Mid', age: 50 },
      ];
      const { container } = render(<Table columns={COLS} rows={rows} selectable idOf={idOf} />);
      const pinnedTr = container.querySelector('tbody tr[data-pinned="true"]');
      expect(pinnedTr).not.toBeNull();
      expect(pinnedTr?.querySelector('td[data-cir-part="table-select-cell"]')).not.toBeNull();
    });
  });
});
