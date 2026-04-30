// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
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
});
