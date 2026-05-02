// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { VirtualList, VirtualListBinding } from '../src/components/VirtualList.js';

describe('VirtualList', () => {
  it('binding id matches and registers the manifest contract', () => {
    expect(VirtualListBinding.id).toBe('VirtualList');
    expect(VirtualListBinding.manifestContract?.allowed_props['onFetchMore']).toBe('function');
    expect(VirtualListBinding.manifestContract?.allowed_props['total']).toBe('number');
  });

  it('emits data-cir-component="VirtualList" (distinct from List)', () => {
    const items = [1, 2, 3];
    const { container } = render(
      <VirtualList items={items} renderItem={(n) => <span>{n}</span>} />,
    );
    const root = container.querySelector('[data-cir-component="VirtualList"]');
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-virtual')).toBe('true');
    expect(root?.getAttribute('data-row-count')).toBe('3');
  });

  it('reflects the total count when supplied', () => {
    const items = [1, 2, 3];
    const { container } = render(
      <VirtualList items={items} total={500} renderItem={(n) => <span>{n}</span>} />,
    );
    expect(
      container.querySelector('[data-cir-component="VirtualList"]')?.getAttribute('data-total'),
    ).toBe('500');
  });

  it('falls back to `data` when `items` is omitted (manifest renderer path)', () => {
    const data = ['a', 'b'];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { container } = render(<VirtualList data={data} {...({} as any)} />);
    expect(
      container.querySelector('[data-cir-component="VirtualList"]')?.getAttribute('data-row-count'),
    ).toBe('2');
  });

  it('uses the default best-effort renderer when none is supplied', () => {
    const items = [{ title: 'Hello' }, { name: 'World' }];
    const { container } = render(<VirtualList items={items} />);
    // happy-dom does not paint, but the virtualizer must still produce a
    // visible spacer with the total measured size.
    const spacer = container.querySelector('[data-cir-part="virtual-list-spacer"]');
    expect(spacer).not.toBeNull();
  });

  it('fires onFetchMore when scrolled within `overscan` of the bottom', () => {
    const onFetchMore = vi.fn().mockResolvedValue(undefined);
    const items = Array.from({ length: 50 }, (_, i) => ({ id: i }));
    const { container } = render(
      <VirtualList
        items={items}
        renderItem={(item) => <span>{item.id}</span>}
        onFetchMore={onFetchMore}
        overscan={50}
        viewportHeight={200}
      />,
    );

    const scroll = container.querySelector('[data-cir-component="VirtualList"]');
    expect(scroll).not.toBeNull();

    // Simulate "scrolled near the bottom". happy-dom doesn't lay things out so
    // we set the geometry directly.
    Object.defineProperty(scroll, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(scroll, 'scrollTop', { value: 800, configurable: true });
    Object.defineProperty(scroll, 'clientHeight', { value: 200, configurable: true });

    fireEvent.scroll(scroll!);
    expect(onFetchMore).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire onFetchMore when total is reached', () => {
    const onFetchMore = vi.fn().mockResolvedValue(undefined);
    const items = [1, 2, 3];
    const { container } = render(
      <VirtualList
        items={items}
        total={3}
        renderItem={(n) => <span>{n}</span>}
        onFetchMore={onFetchMore}
        overscan={50}
        viewportHeight={200}
      />,
    );
    const scroll = container.querySelector('[data-cir-component="VirtualList"]');
    Object.defineProperty(scroll, 'scrollHeight', { value: 200, configurable: true });
    Object.defineProperty(scroll, 'scrollTop', { value: 0, configurable: true });
    Object.defineProperty(scroll, 'clientHeight', { value: 200, configurable: true });
    fireEvent.scroll(scroll!);
    expect(onFetchMore).not.toHaveBeenCalled();
  });

  it('fires onFetchPrev when scrolled within `overscan` of the top (and scrollTop > 0)', () => {
    const onFetchPrev = vi.fn().mockResolvedValue(undefined);
    const items = Array.from({ length: 50 }, (_, i) => i);
    const { container } = render(
      <VirtualList
        items={items}
        renderItem={(n) => <span>{n}</span>}
        onFetchPrev={onFetchPrev}
        overscan={50}
        viewportHeight={200}
      />,
    );
    const scroll = container.querySelector('[data-cir-component="VirtualList"]');
    Object.defineProperty(scroll, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(scroll, 'scrollTop', { value: 10, configurable: true });
    Object.defineProperty(scroll, 'clientHeight', { value: 200, configurable: true });
    fireEvent.scroll(scroll!);
    expect(onFetchPrev).toHaveBeenCalledTimes(1);
  });

  it('reflects bordered + variant + density on data attrs (mirrors <List>)', () => {
    const { container } = render(
      <VirtualList items={['a']} bordered variant="elevated" density="compact" />,
    );
    const root = container.querySelector('[data-cir-component="VirtualList"]') as HTMLElement;
    expect(root.getAttribute('data-bordered')).toBe('true');
    expect(root.getAttribute('data-variant')).toBe('elevated');
    expect(root.getAttribute('data-density')).toBe('compact');
  });

  // -- Wave 11 / Int-9 — multi-select smoke --------------------------------
  it('reflects data-selectable when `selectable` is true', () => {
    const items = Array.from({ length: 50 }, (_, i) => ({
      id: `r${String(i)}`,
      title: `r${String(i)}`,
    }));
    const { container } = render(
      <VirtualList
        items={items}
        selectable
        idOf={(item): string => item.id}
        viewportHeight={200}
      />,
    );
    const root = container.querySelector('[data-cir-component="VirtualList"]') as HTMLElement;
    expect(root.getAttribute('data-selectable')).toBe('true');
    expect(root.getAttribute('data-row-count')).toBe('50');
  });

  it('exposes selection props on the manifest contract', () => {
    expect(VirtualListBinding.manifestContract?.allowed_props['selectable']).toBe('boolean');
    expect(VirtualListBinding.manifestContract?.allowed_props['bulkActions']).toBe('array');
    expect(VirtualListBinding.manifestContract?.allowed_props['onBulkAction']).toBe('function');
  });

  it('mounts <BulkActionBar> when bulkActions + selectedIds non-empty', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    render(
      <VirtualList
        items={items}
        selectable
        idOf={(item): string => item.id}
        selectedIds={new Set<string>(['a'])}
        bulkActions={[{ id: 'bulk.archive', label: 'Archive' }]}
        viewportHeight={200}
      />,
    );
    expect(document.body.querySelector('[data-cir-component="BulkActionBar"]')).not.toBeNull();
  });
});
