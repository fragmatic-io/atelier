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
});
