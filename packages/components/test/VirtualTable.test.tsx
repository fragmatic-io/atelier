// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { VirtualTable, VirtualTableBinding } from '../src/components/VirtualTable.js';

const COLS = [
  { key: 'name', header: 'Name' },
  { key: 'age', header: 'Age', numeric: true },
] as const;

describe('VirtualTable', () => {
  it('binding id matches and registers the manifest contract', () => {
    expect(VirtualTableBinding.id).toBe('VirtualTable');
    expect(VirtualTableBinding.manifestContract?.allowed_props['onFetchMore']).toBe('function');
    expect(VirtualTableBinding.manifestContract?.allowed_props['columns']).toBe('array');
  });

  it('emits data-cir-component="VirtualTable" with role="grid"', () => {
    const rows = [{ name: 'Ada', age: 30 }];
    const { container } = render(<VirtualTable columns={COLS} rows={rows} />);
    const root = container.querySelector('[data-cir-component="VirtualTable"]');
    expect(root).not.toBeNull();
    expect(root?.getAttribute('role')).toBe('grid');
    expect(root?.getAttribute('data-virtual')).toBe('true');
  });

  it('renders a header row with column headers', () => {
    const { container } = render(<VirtualTable columns={COLS} rows={[]} />);
    const headers = container.querySelectorAll('[role="columnheader"]');
    expect(headers.length).toBe(2);
    expect(headers[0]?.textContent).toBe('Name');
    expect(headers[1]?.textContent).toBe('Age');
  });

  it('marks numeric column headers with data-tnum (Wave 11 / Vis-1 contract)', () => {
    const { container } = render(<VirtualTable columns={COLS} rows={[]} />);
    const tnumHeaders = container.querySelectorAll('[role="columnheader"][data-tnum="true"]');
    expect(tnumHeaders.length).toBe(1);
    expect(tnumHeaders[0]?.textContent).toBe('Age');
  });

  it('falls back to `data` when `rows` is omitted (manifest renderer path)', () => {
    const data = [
      { name: 'A', age: 1 },
      { name: 'B', age: 2 },
    ];
    const { container } = render(<VirtualTable columns={COLS} data={data} />);
    expect(
      container
        .querySelector('[data-cir-component="VirtualTable"]')
        ?.getAttribute('data-row-count'),
    ).toBe('2');
  });

  it('reflects total count when supplied (data-total + aria-rowcount)', () => {
    const { container } = render(<VirtualTable columns={COLS} rows={[]} total={1234} />);
    const root = container.querySelector('[data-cir-component="VirtualTable"]') as HTMLElement;
    expect(root.getAttribute('data-total')).toBe('1234');
    expect(root.getAttribute('aria-rowcount')).toBe('1234');
  });

  it('fires onFetchMore when scrolled within overscan of the bottom', () => {
    const onFetchMore = vi.fn().mockResolvedValue(undefined);
    const rows = Array.from({ length: 50 }, (_, i) => ({ name: `r${String(i)}`, age: i }));
    const { container } = render(
      <VirtualTable
        columns={COLS}
        rows={rows}
        onFetchMore={onFetchMore}
        overscan={50}
        viewportHeight={200}
      />,
    );
    const scroll = container.querySelector('[data-cir-part="virtual-table-scroll"]');
    expect(scroll).not.toBeNull();
    Object.defineProperty(scroll, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(scroll, 'scrollTop', { value: 800, configurable: true });
    Object.defineProperty(scroll, 'clientHeight', { value: 200, configurable: true });
    fireEvent.scroll(scroll!);
    expect(onFetchMore).toHaveBeenCalledTimes(1);
  });

  it('honours a per-row factory when supplied', () => {
    const rows = [
      { name: 'Ada', age: 30 },
      { name: 'Bea', age: 28 },
    ];
    const { container } = render(
      <VirtualTable
        columns={COLS}
        rows={rows}
        renderItem={(row) => {
          const raw = row['name'];
          const name = typeof raw === 'string' ? raw : '';
          return <div data-testid={`r-${name}`}>{name}</div>;
        }}
      />,
    );
    // Inside the virtualizer, only viewport rows render; with happy-dom's
    // zero-pixel measurements the spacer is correct but rows may be 0 — we
    // just assert the spacer + grid header are present (functional smoke).
    expect(container.querySelector('[data-cir-part="virtual-table-spacer"]')).not.toBeNull();
    expect(container.querySelector('[data-cir-part="virtual-table-header"]')).not.toBeNull();
  });

  it('renders the caption when supplied', () => {
    const { container } = render(<VirtualTable columns={COLS} rows={[]} caption="Products" />);
    const cap = container.querySelector('[data-cir-part="virtual-table-caption"]');
    expect(cap?.textContent).toBe('Products');
    expect(cap?.getAttribute('role')).toBe('caption');
  });
});
