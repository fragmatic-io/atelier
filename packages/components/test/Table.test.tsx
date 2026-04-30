// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Table, TableBinding } from '../src/components/Table.js';

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
});
