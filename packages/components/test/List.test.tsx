// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { List, ListBinding } from '../src/components/List.js';

describe('List', () => {
  it('renders one li per item', () => {
    const items = ['a', 'b', 'c'];
    const { container } = render(<List items={items} renderItem={(x) => <span>{x}</span>} />);
    expect(container.querySelectorAll('li').length).toBe(3);
  });
  it('renders empty slot when items is empty', () => {
    render(<List items={[]} renderItem={() => null} empty={<span>none</span>} />);
    expect(screen.getByText('none')).toBeTruthy();
  });
  it('reflects bordered as data attr', () => {
    const { container } = render(<List items={['a']} bordered renderItem={() => null} />);
    expect(container.querySelector('ul')?.getAttribute('data-bordered')).toBe('true');
  });
  it('binding id matches', () => {
    expect(ListBinding.id).toBe('List');
  });
  // -- Wave 6 / P-10 variant assertions --
  it('defaults to variant=ghost', () => {
    const { container } = render(<List items={['a']} renderItem={() => null} />);
    expect(container.querySelector('ul')?.getAttribute('data-variant')).toBe('ghost');
  });
  it('reflects each variant on data-variant', () => {
    for (const v of ['bordered', 'elevated', 'ghost', 'tinted'] as const) {
      const { container, unmount } = render(
        <List items={['a']} variant={v} renderItem={() => null} />,
      );
      expect(container.querySelector('ul')?.getAttribute('data-variant')).toBe(v);
      unmount();
    }
  });
  it('applies the elevated variant class', () => {
    const { container } = render(<List items={['a']} variant="elevated" renderItem={() => null} />);
    expect(container.querySelector('ul')?.className).toContain('shadow-md');
  });
  // -- Wave 6 / P-1 density assertions --
  it('defaults density to comfortable and surfaces data-density on the <ul>', () => {
    const { container } = render(<List items={['a']} renderItem={(x) => <span>{x}</span>} />);
    expect(container.querySelector('ul')?.getAttribute('data-density')).toBe('comfortable');
  });
  it('shrinks per-row vertical padding at compact density', () => {
    const { container, rerender } = render(
      <List items={['a']} renderItem={() => null} density="comfortable" />,
    );
    const comfyLi = container.querySelector('li') as HTMLElement | null;
    const comfyPad = parseInt(comfyLi?.style.paddingTop ?? '0', 10);
    rerender(<List items={['a']} renderItem={() => null} density="compact" />);
    const compactLi = container.querySelector('li') as HTMLElement | null;
    const compactPad = parseInt(compactLi?.style.paddingTop ?? '0', 10);
    expect(compactPad).toBeLessThan(comfyPad);
  });
});
