// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KPIRow, KPIRowBinding } from '../src/components/KPIRow.js';

const STATS = [
  { id: 'a', label: 'Revenue', value: '$1.2M' },
  { id: 'b', label: 'Users', value: 12_345, delta: { value: '+5%', trend: 'up' as const } },
  { id: 'c', label: 'Churn', value: '0.4%', delta: { value: '-0.1%', trend: 'down' as const } },
];

describe('KPIRow', () => {
  it('renders one StatCard per stat', () => {
    render(<KPIRow stats={STATS} />);
    const tiles = document.querySelectorAll('[data-cir-component="StatCard"]');
    expect(tiles.length).toBe(STATS.length);
  });

  it('the row carries the aria-label and role=group', () => {
    render(<KPIRow stats={STATS} aria-label="Top metrics" />);
    expect(screen.getByRole('group', { name: 'Top metrics' })).toBeTruthy();
  });

  it('caps columns at 4 and floors at 1', () => {
    const { rerender } = render(<KPIRow stats={STATS} columns={10} />);
    let row = document.querySelector('[data-cir-component="KPIRow"]')!;
    expect(row.getAttribute('data-columns')).toBe('4');
    rerender(<KPIRow stats={STATS} columns={0} />);
    row = document.querySelector('[data-cir-component="KPIRow"]')!;
    expect(row.getAttribute('data-columns')).toBe('1');
  });

  it('default columns equals stats.length (capped)', () => {
    render(<KPIRow stats={STATS.slice(0, 2)} />);
    const row = document.querySelector('[data-cir-component="KPIRow"]')!;
    expect(row.getAttribute('data-columns')).toBe('2');
  });

  it('forwards delta to StatCard', () => {
    render(<KPIRow stats={STATS} />);
    expect(document.querySelectorAll('[data-cir-part="stat-delta"]').length).toBe(2);
  });

  it('binding id matches', () => {
    expect(KPIRowBinding.id).toBe('KPIRow');
  });
});
