// @vitest-environment happy-dom
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Typography depth (Wave 11 / Vis-1) — component opt-in smoke tests.
 *
 * The brand kit's `tokens.typography.opentype.tabular_numerals` flag is
 * activated by hosts via a single CSS rule that targets `data-tnum="true"`.
 * These tests pin the marker contract: the components that should opt in
 * emit the marker on the right elements, regardless of the brand kit.
 *
 * The brand-kit projection itself (CSS-variable bridge in Aurora's
 * `globals.css`, Tailwind config bridge in the `cir init` template) is
 * covered by:
 *   - `apps/demo/test/brand-kit.test.ts` — the Aurora kit declares the new
 *     fields with the expected values.
 *   - `packages/cli/test/init.test.ts` — the scaffold emits a Tailwind
 *     config that resolves `tracking-*` / `leading-*` to CSS variables.
 */
import './setup.js';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Table } from '../src/components/Table.js';
import { StatCard } from '../src/components/StatCard.js';
import { KPIRow } from '../src/components/KPIRow.js';

describe('Vis-1 typography depth — Table numeric column opt-in', () => {
  it('emits data-tnum="true" on td cells in numeric columns', () => {
    const cols = [
      { key: 'name', header: 'Name' },
      { key: 'count', header: 'Count', numeric: true as const, align: 'right' as const },
    ];
    const rows = [
      { name: 'Ada', count: 1234 },
      { name: 'Bea', count: 56 },
    ];
    const { container } = render(<Table columns={cols} rows={rows} />);
    // The numeric column's tds carry the marker; the non-numeric column does not.
    const numericTds = container.querySelectorAll('tbody td[data-tnum="true"]');
    expect(numericTds.length).toBe(2);
    // The non-numeric "name" td must not carry the marker.
    const nameTds = Array.from(container.querySelectorAll('tbody tr')).map((tr) =>
      tr.querySelector('td:first-of-type'),
    );
    for (const td of nameTds) {
      expect(td?.getAttribute('data-tnum')).not.toBe('true');
    }
  });

  it('emits data-tnum on numeric column headers', () => {
    const cols = [
      { key: 'name', header: 'Name' },
      { key: 'count', header: 'Count', numeric: true as const },
    ];
    const { container } = render(<Table columns={cols} rows={[{ name: 'a', count: 1 }]} />);
    const headers = Array.from(container.querySelectorAll('thead th'));
    const numericHeader = headers.find((h) => h.textContent === 'Count');
    expect(numericHeader?.getAttribute('data-tnum')).toBe('true');
    const nameHeader = headers.find((h) => h.textContent === 'Name');
    expect(nameHeader?.getAttribute('data-tnum')).not.toBe('true');
  });

  it('applies text-align from column.align on td and th', () => {
    const cols = [
      { key: 'count', header: 'Count', numeric: true as const, align: 'right' as const },
    ];
    const { container } = render(<Table columns={cols} rows={[{ count: 7 }]} />);
    const td = container.querySelector<HTMLTableCellElement>('tbody td');
    expect(td).not.toBeNull();
    if (td) expect(td.style.textAlign).toBe('right');
    const th = container.querySelector<HTMLTableCellElement>('thead th');
    expect(th).not.toBeNull();
    if (th) expect(th.style.textAlign).toBe('right');
  });

  it('does not emit data-tnum when no column is marked numeric', () => {
    const cols = [{ key: 'name', header: 'Name' }];
    const { container } = render(<Table columns={cols} rows={[{ name: 'Ada' }]} />);
    expect(container.querySelector('[data-tnum="true"]')).toBeNull();
  });
});

describe('Vis-1 typography depth — StatCard value opt-in', () => {
  it('emits data-tnum="true" on the stat value paragraph', () => {
    const { container } = render(<StatCard label="MRR" value="$12,345" />);
    const value = container.querySelector('[data-cir-part="stat-value"]');
    expect(value?.getAttribute('data-tnum')).toBe('true');
  });

  it('emits data-tnum on the delta cell when present', () => {
    const { container } = render(
      <StatCard label="Active" value={42} delta={{ value: '+3', trend: 'up' }} />,
    );
    const delta = container.querySelector('[data-cir-part="stat-delta"]');
    expect(delta?.getAttribute('data-tnum')).toBe('true');
  });
});

describe('Vis-1 typography depth — KPIRow inherits via StatCard', () => {
  it('every stat value carries data-tnum="true" inside a KPIRow', () => {
    const { container } = render(
      <KPIRow
        stats={[
          { id: 'a', label: 'A', value: 1 },
          { id: 'b', label: 'B', value: 2 },
        ]}
      />,
    );
    const values = container.querySelectorAll('[data-cir-part="stat-value"]');
    expect(values.length).toBe(2);
    for (const v of values) {
      expect(v.getAttribute('data-tnum')).toBe('true');
    }
  });
});
