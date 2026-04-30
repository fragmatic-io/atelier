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
});
