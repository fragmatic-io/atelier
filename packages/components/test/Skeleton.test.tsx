// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Skeleton, SkeletonBinding } from '../src/components/Skeleton.js';

/**
 * Replace `window.matchMedia` for the duration of one test so the
 * `prefers-reduced-motion` branch in `Skeleton` flips. Returns the restorer.
 */
function mockReducedMotion(matches: boolean): () => void {
  const original = window.matchMedia;
  // The full `MediaQueryList` surface is stubbed out — we only need
  // `matches` for the reduced-motion branch.
  const mock = (q: string): MediaQueryList => {
    const stub = {
      matches: q.includes('prefers-reduced-motion') ? matches : false,
      media: q,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    };
    return stub as MediaQueryList;
  };
  window.matchMedia = mock;
  return (): void => {
    window.matchMedia = original;
  };
}

describe('Skeleton', () => {
  it('renders an aria-hidden span', () => {
    const { container } = render(<Skeleton />);
    const el = container.querySelector('span');
    expect(el?.getAttribute('aria-hidden')).toBe('true');
    expect(el?.getAttribute('data-cir-component')).toBe('Skeleton');
  });
  it('honours width / height props', () => {
    const { container } = render(<Skeleton width={120} height="2em" />);
    const el = container.querySelector('span') as HTMLElement;
    expect(el.style.width).toBe('120px');
    expect(el.style.height).toBe('2em');
  });
  it('default radius is sm', () => {
    const { container } = render(<Skeleton />);
    expect(container.querySelector('span')?.getAttribute('data-radius')).toBe('sm');
  });
  it('reflects radius on data-radius and border-radius style', () => {
    for (const r of ['sm', 'md', 'full'] as const) {
      const { container, unmount } = render(<Skeleton radius={r} />);
      expect(container.querySelector('span')?.getAttribute('data-radius')).toBe(r);
      unmount();
    }
  });
  it('passes className through', () => {
    const { container } = render(<Skeleton className="my-skel" />);
    expect(container.querySelector('span')?.className).toContain('my-skel');
  });
  it('binding id matches', () => {
    expect(SkeletonBinding.id).toBe('Skeleton');
  });
  // -- Wave 6 / P-10 variant assertions --
  it('defaults to variant=tinted', () => {
    const { container } = render(<Skeleton />);
    expect(container.querySelector('span')?.getAttribute('data-variant')).toBe('tinted');
  });
  it('reflects each variant on data-variant', () => {
    for (const v of ['bordered', 'elevated', 'ghost', 'tinted'] as const) {
      const { container, unmount } = render(<Skeleton variant={v} />);
      expect(container.querySelector('span')?.getAttribute('data-variant')).toBe(v);
      unmount();
    }
  });
  it('applies the bordered variant class', () => {
    const { container } = render(<Skeleton variant="bordered" />);
    expect(container.querySelector('span')?.className).toContain('border');
  });

  // ---------------------------------------------------------------------------
  // Wave 7b / Vis-8 — shape catalog
  // ---------------------------------------------------------------------------

  it('default shape is rect — preserves the legacy span element (regression)', () => {
    const { container } = render(<Skeleton />);
    const root = container.querySelector('[data-cir-component="Skeleton"]') as HTMLElement;
    expect(root.tagName).toBe('SPAN');
    expect(root.getAttribute('data-shape')).toBe('rect');
    expect(root.style.display).toBe('inline-block');
  });

  it('shape="circle" renders a circular block', () => {
    const { container } = render(<Skeleton shape="circle" width={48} />);
    const root = container.querySelector('[data-cir-component="Skeleton"]') as HTMLElement;
    expect(root.getAttribute('data-shape')).toBe('circle');
    const inner = root.querySelector('[data-cir-skeleton-block]') as HTMLElement;
    expect(inner.style.borderRadius).toBe('9999px');
    expect(inner.style.width).toBe('48px');
    expect(inner.style.height).toBe('48px');
  });

  it('shape="text-line" renders a single rect with width in the 60-95% band', () => {
    const { container } = render(<Skeleton shape="text-line" />);
    const root = container.querySelector('[data-cir-component="Skeleton"]') as HTMLElement;
    expect(root.getAttribute('data-shape')).toBe('text-line');
    const blocks = root.querySelectorAll('[data-cir-skeleton-block]');
    expect(blocks).toHaveLength(1);
    const w = (blocks[0] as HTMLElement).style.width;
    const m = /^(\d+)%$/.exec(w);
    expect(m).not.toBeNull();
    const pct = Number(m?.[1]);
    expect(pct).toBeGreaterThanOrEqual(60);
    expect(pct).toBeLessThanOrEqual(95);
  });

  it('shape="text-line" width is stable across re-renders', () => {
    const { container: a } = render(<Skeleton shape="text-line" />);
    const { container: b } = render(<Skeleton shape="text-line" />);
    const wa = (a.querySelector('[data-cir-skeleton-block]') as HTMLElement).style.width;
    const wb = (b.querySelector('[data-cir-skeleton-block]') as HTMLElement).style.width;
    expect(wa).toBe(wb);
  });

  it('shape="avatar-with-2-lines" renders 1 circle + 2 text rects', () => {
    const { container } = render(<Skeleton shape="avatar-with-2-lines" />);
    const root = container.querySelector('[data-cir-component="Skeleton"]') as HTMLElement;
    expect(root.getAttribute('data-shape')).toBe('avatar-with-2-lines');
    const blocks = Array.from(root.querySelectorAll<HTMLElement>('[data-cir-skeleton-block]'));
    expect(blocks).toHaveLength(3);
    // The circle is the only one with the pill border-radius.
    const circleBlocks = blocks.filter((el) => el.style.borderRadius === '9999px');
    expect(circleBlocks).toHaveLength(1);
  });

  it('shape="card" renders the card pattern (header + media + 2 lines)', () => {
    const { container } = render(<Skeleton shape="card" />);
    const root = container.querySelector('[data-cir-component="Skeleton"]') as HTMLElement;
    expect(root.getAttribute('data-shape')).toBe('card');
    const blocks = root.querySelectorAll('[data-cir-skeleton-block]');
    expect(blocks.length).toBeGreaterThanOrEqual(4);
  });

  it('shape="table-row" defaults to columns=4 and count=1', () => {
    const { container } = render(<Skeleton shape="table-row" />);
    const root = container.querySelector('[data-cir-component="Skeleton"]') as HTMLElement;
    expect(root.getAttribute('data-columns')).toBe('4');
    expect(root.getAttribute('data-count')).toBe('1');
    const cells = root.querySelectorAll('[data-cir-skeleton-block]');
    expect(cells).toHaveLength(4);
  });

  it('shape="table-row" with columns=5 renders 5 cells per row', () => {
    const { container } = render(<Skeleton shape="table-row" columns={5} />);
    const root = container.querySelector('[data-cir-component="Skeleton"]') as HTMLElement;
    expect(root.getAttribute('data-columns')).toBe('5');
    const cells = root.querySelectorAll('[data-cir-skeleton-block]');
    expect(cells).toHaveLength(5);
  });

  it('shape="table-row" with count=3, columns=5 emits 15 cells', () => {
    const { container } = render(<Skeleton shape="table-row" columns={5} count={3} />);
    const root = container.querySelector('[data-cir-component="Skeleton"]') as HTMLElement;
    expect(root.getAttribute('data-count')).toBe('3');
    const cells = root.querySelectorAll('[data-cir-skeleton-block]');
    expect(cells).toHaveLength(15);
  });

  it('shape="kpi-tile" renders label + number rect', () => {
    const { container } = render(<Skeleton shape="kpi-tile" />);
    const root = container.querySelector('[data-cir-component="Skeleton"]') as HTMLElement;
    expect(root.getAttribute('data-shape')).toBe('kpi-tile');
    const blocks = root.querySelectorAll('[data-cir-skeleton-block]');
    expect(blocks).toHaveLength(2);
  });

  it('shape="detail-view" renders hero + 3 stat blocks + 3 text lines', () => {
    const { container } = render(<Skeleton shape="detail-view" />);
    const root = container.querySelector('[data-cir-component="Skeleton"]') as HTMLElement;
    expect(root.getAttribute('data-shape')).toBe('detail-view');
    const blocks = root.querySelectorAll('[data-cir-skeleton-block]');
    expect(blocks.length).toBeGreaterThanOrEqual(7);
  });

  it('shape="gallery-tile" renders image + caption', () => {
    const { container } = render(<Skeleton shape="gallery-tile" />);
    const root = container.querySelector('[data-cir-component="Skeleton"]') as HTMLElement;
    expect(root.getAttribute('data-shape')).toBe('gallery-tile');
    const blocks = root.querySelectorAll('[data-cir-skeleton-block]');
    expect(blocks).toHaveLength(2);
  });

  it('shape="timeline-event" renders dot + date + description', () => {
    const { container } = render(<Skeleton shape="timeline-event" />);
    const root = container.querySelector('[data-cir-component="Skeleton"]') as HTMLElement;
    expect(root.getAttribute('data-shape')).toBe('timeline-event');
    const blocks = Array.from(root.querySelectorAll<HTMLElement>('[data-cir-skeleton-block]'));
    expect(blocks).toHaveLength(3);
    const dot = blocks.find((el) => el.style.borderRadius === '9999px');
    expect(dot).toBeDefined();
  });

  it('shape="text-paragraph" with count=4 renders 4 lines', () => {
    const { container } = render(<Skeleton shape="text-paragraph" count={4} />);
    const root = container.querySelector('[data-cir-component="Skeleton"]') as HTMLElement;
    expect(root.getAttribute('data-shape')).toBe('text-paragraph');
    expect(root.getAttribute('data-count')).toBe('4');
    const lines = root.querySelectorAll('[data-cir-skeleton-block]');
    expect(lines).toHaveLength(4);
  });

  it('text-paragraph defaults count to 1', () => {
    const { container } = render(<Skeleton shape="text-paragraph" />);
    const root = container.querySelector('[data-cir-component="Skeleton"]') as HTMLElement;
    expect(root.getAttribute('data-count')).toBe('1');
  });

  it('applies animate-pulse by default', () => {
    const { container } = render(<Skeleton />);
    const root = container.querySelector('[data-cir-component="Skeleton"]') as HTMLElement;
    expect(root.className).toContain('animate-pulse');
  });

  it('respects prefers-reduced-motion: reduce — drops animate-pulse', () => {
    const restore = mockReducedMotion(true);
    try {
      const { container } = render(<Skeleton shape="card" />);
      const root = container.querySelector('[data-cir-component="Skeleton"]') as HTMLElement;
      expect(root.className).not.toContain('animate-pulse');
    } finally {
      restore();
    }
  });

  it('count is clamped to >= 1 (count=0 still renders one row)', () => {
    const { container } = render(<Skeleton shape="table-row" columns={3} count={0} />);
    const root = container.querySelector('[data-cir-component="Skeleton"]') as HTMLElement;
    expect(root.getAttribute('data-count')).toBe('1');
    const cells = root.querySelectorAll('[data-cir-skeleton-block]');
    expect(cells).toHaveLength(3);
  });
});
