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
  // -- Wave 7b / Nav-3 — pinned items --
  describe('pinned items', () => {
    interface Item {
      id: string;
      label: string;
      pinned?: boolean;
    }
    const renderRow = (x: Item) => <span data-testid={x.id}>{x.label}</span>;
    it('renders pinned items before unpinned regardless of source order', () => {
      const items: Item[] = [
        { id: 'a', label: 'Alpha' },
        { id: 'b', label: 'Bravo', pinned: true },
        { id: 'c', label: 'Charlie' },
      ];
      const { container } = render(<List items={items} renderItem={renderRow} />);
      const labels = Array.from(container.querySelectorAll('li [data-testid]')).map(
        (n) => n.textContent ?? '',
      );
      expect(labels).toEqual(['Bravo', 'Alpha', 'Charlie']);
    });
    it('stacks multiple pinned items in their source order', () => {
      const items: Item[] = [
        { id: 'a', label: 'Alpha', pinned: true },
        { id: 'b', label: 'Bravo' },
        { id: 'c', label: 'Charlie', pinned: true },
      ];
      const { container } = render(<List items={items} renderItem={renderRow} />);
      const pinnedRowText = Array.from(container.querySelectorAll('li[data-pinned="true"]')).map(
        (li) => li.querySelector('[data-testid]')?.textContent ?? '',
      );
      expect(pinnedRowText).toEqual(['Alpha', 'Charlie']);
    });
    it('does not change rendering when no pinned items present', () => {
      const items: Item[] = [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ];
      const { container } = render(<List items={items} renderItem={renderRow} />);
      expect(container.querySelectorAll('li[data-pinned="true"]').length).toBe(0);
      expect(container.querySelector('[data-cir-part="pinned-separator"]')).toBeNull();
      expect(container.querySelector('ul')?.getAttribute('data-has-pinned')).toBe('false');
    });
    it('marks pinned <li> with data-pinned="true"', () => {
      const items: Item[] = [{ id: 'a', label: 'Alpha', pinned: true }];
      const { container } = render(<List items={items} renderItem={renderRow} />);
      expect(container.querySelector('li[data-pinned="true"]')).not.toBeNull();
    });
    it('renders a pin indicator inside each pinned item', () => {
      const items: Item[] = [{ id: 'a', label: 'Alpha', pinned: true }];
      const { container } = render(<List items={items} renderItem={renderRow} />);
      const indicator = container.querySelector(
        'li[data-pinned="true"] [data-pin-indicator="true"]',
      );
      expect(indicator).not.toBeNull();
      expect(indicator?.textContent ?? '').toContain('\u{1F4CC}');
    });
    it('renders a separator when pinned items exist (default)', () => {
      const items: Item[] = [
        { id: 'a', label: 'A', pinned: true },
        { id: 'b', label: 'B' },
      ];
      const { container } = render(<List items={items} renderItem={renderRow} />);
      expect(container.querySelector('[data-cir-part="pinned-separator"]')).not.toBeNull();
    });
    it('omits the separator when showPinnedSeparator={false}', () => {
      const items: Item[] = [
        { id: 'a', label: 'A', pinned: true },
        { id: 'b', label: 'B' },
      ];
      const { container } = render(
        <List items={items} renderItem={renderRow} showPinnedSeparator={false} />,
      );
      expect(container.querySelector('[data-cir-part="pinned-separator"]')).toBeNull();
    });
    it('applies sticky CSS to pinned items', () => {
      const items: Item[] = [{ id: 'a', label: 'A', pinned: true }];
      const { container } = render(<List items={items} renderItem={renderRow} />);
      const li = container.querySelector<HTMLElement>('li[data-pinned="true"]');
      expect(li?.style.position).toBe('sticky');
      expect(li?.style.top).toBe('0px');
      expect(li?.style.zIndex).toBe('10');
    });
    it('uses pinAriaLabel callback for the aria-label on pinned items', () => {
      const items: Item[] = [{ id: 'a', label: 'Alpha', pinned: true }];
      const { container } = render(
        <List items={items} renderItem={renderRow} pinAriaLabel={(it) => `Pinned: ${it.label}`} />,
      );
      expect(container.querySelector('li[data-pinned="true"]')?.getAttribute('aria-label')).toBe(
        'Pinned: Alpha',
      );
    });
    it('defaults pinned aria-label to "Pinned"', () => {
      const items: Item[] = [{ id: 'a', label: 'Alpha', pinned: true }];
      const { container } = render(<List items={items} renderItem={renderRow} />);
      expect(container.querySelector('li[data-pinned="true"]')?.getAttribute('aria-label')).toBe(
        'Pinned',
      );
    });
  });
});
