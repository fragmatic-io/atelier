// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Container, ContainerBinding, CONTAINER_MAX_WIDTH } from '../src/components/Container.js';

describe('Container', () => {
  it('renders <main role="main"> with children', () => {
    render(<Container>content</Container>);
    const main = screen.getByRole('main');
    expect(main.tagName).toBe('MAIN');
    expect(main.textContent).toBe('content');
  });
  it('defaults to md max-width', () => {
    render(<Container>x</Container>);
    const main = screen.getByRole('main');
    expect(main.getAttribute('data-max-width')).toBe('md');
    expect(main.style.maxWidth).toBe(CONTAINER_MAX_WIDTH.md);
  });
  it('maps each maxWidth token to the canonical px value', () => {
    for (const key of Object.keys(CONTAINER_MAX_WIDTH) as (keyof typeof CONTAINER_MAX_WIDTH)[]) {
      const { unmount } = render(<Container maxWidth={key}>x</Container>);
      expect(screen.getByRole('main').style.maxWidth).toBe(CONTAINER_MAX_WIDTH[key]);
      unmount();
    }
  });
  it('supports padding="none" (zero horizontal inset)', () => {
    render(<Container padding="none">x</Container>);
    expect(screen.getByRole('main').style.paddingLeft).toBe('0px');
    expect(screen.getByRole('main').style.paddingRight).toBe('0px');
  });
  it('supports padding="sm" (8px horizontal inset)', () => {
    render(<Container padding="sm">x</Container>);
    expect(screen.getByRole('main').style.paddingLeft).toBe('8px');
    expect(screen.getByRole('main').style.paddingRight).toBe('8px');
  });
  it('binding id matches', () => {
    expect(ContainerBinding.id).toBe('Container');
  });
  // -- Wave 6 / P-10 variant assertions --
  it('defaults to variant=ghost', () => {
    render(<Container>x</Container>);
    expect(screen.getByRole('main').getAttribute('data-variant')).toBe('ghost');
  });
  it('reflects each variant on data-variant', () => {
    for (const v of ['bordered', 'elevated', 'ghost', 'tinted'] as const) {
      const { unmount } = render(<Container variant={v}>x</Container>);
      expect(screen.getByRole('main').getAttribute('data-variant')).toBe(v);
      unmount();
    }
  });
  it('applies the elevated variant class', () => {
    render(<Container variant="elevated">x</Container>);
    expect(screen.getByRole('main').className).toContain('shadow-md');
  });
  // -- Wave 6 / P-1 density assertions --
  it('defaults density to comfortable and surfaces data-density', () => {
    render(<Container>x</Container>);
    expect(screen.getByRole('main').getAttribute('data-density')).toBe('comfortable');
  });
  it('tightens vertical padding at compact density', () => {
    const { rerender } = render(<Container density="comfortable">x</Container>);
    const baseTop = screen.getByRole('main').style.paddingTop;
    rerender(<Container density="compact">x</Container>);
    const compactTop = screen.getByRole('main').style.paddingTop;
    expect(parseInt(compactTop, 10)).toBeLessThan(parseInt(baseTop, 10));
  });
});
