// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KPIRow, KPIRowBinding } from '../src/components/KPIRow.js';

const STATS = [
  { id: 'a', label: 'A', value: 1 },
  { id: 'b', label: 'B', value: 2 },
];

describe('KPIRow', () => {
  it('renders one StatCard per stat', () => {
    const { container } = render(<KPIRow stats={STATS} />);
    expect(container.querySelectorAll('[data-cir-component="StatCard"]').length).toBe(2);
  });
  it('caps columns at MAX (4) even when stats are larger', () => {
    const big = Array.from({ length: 6 }, (_, i) => ({
      id: String(i),
      label: `s${String(i)}`,
      value: i,
    }));
    render(<KPIRow stats={big} />);
    expect(screen.getByRole('group').getAttribute('data-columns')).toBe('4');
  });
  it('explicit columns wins (capped at MAX_COLUMNS=4)', () => {
    render(<KPIRow stats={STATS} columns={6} />);
    expect(screen.getByRole('group').getAttribute('data-columns')).toBe('4');
  });
  it('binding id matches', () => {
    expect(KPIRowBinding.id).toBe('KPIRow');
  });
  // -- Wave 6 / P-10 variant assertions --
  it('defaults to variant=default and size=md', () => {
    render(<KPIRow stats={STATS} />);
    const root = screen.getByRole('group');
    expect(root.getAttribute('data-variant')).toBe('default');
    expect(root.getAttribute('data-size')).toBe('md');
  });
  it('reflects each variant on data-variant', () => {
    for (const v of ['default', 'accent', 'muted'] as const) {
      const { unmount } = render(<KPIRow stats={STATS} variant={v} />);
      expect(screen.getByRole('group').getAttribute('data-variant')).toBe(v);
      unmount();
    }
  });
  it('combines variant + size class', () => {
    render(<KPIRow stats={STATS} variant="accent" size="lg" />);
    const root = screen.getByRole('group');
    expect(root.className).toContain('bg-blue-50');
    expect(root.className).toContain('text-lg');
  });
  // -- Wave 6 / P-1 density assertions --
  it('defaults density to comfortable and surfaces data-density', () => {
    render(<KPIRow stats={STATS} />);
    expect(screen.getByRole('group').getAttribute('data-density')).toBe('comfortable');
  });
  it('shrinks the inter-tile gap at compact density and forwards to StatCards', () => {
    const { rerender } = render(<KPIRow stats={STATS} density="comfortable" />);
    const baseRow = screen.getByRole('group');
    const baseGap = parseInt(baseRow.style.gap, 10);
    rerender(<KPIRow stats={STATS} density="compact" />);
    const compactRow = screen.getByRole('group');
    const compactGap = parseInt(compactRow.style.gap, 10);
    expect(compactGap).toBeLessThan(baseGap);
    const tiles = document.querySelectorAll('[data-cir-component="StatCard"]');
    for (const t of Array.from(tiles)) {
      expect(t.getAttribute('data-density')).toBe('compact');
    }
  });
});
