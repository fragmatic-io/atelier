// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
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
  // -- Wave 11 / Vis-8 ARIA upgrade --
  it('exposes role="status" + aria-busy="true" + aria-label="Loading"', () => {
    const { container } = render(<Skeleton />);
    const el = container.querySelector('[data-cir-component="Skeleton"]') as HTMLElement;
    expect(el.getAttribute('role')).toBe('status');
    expect(el.getAttribute('aria-busy')).toBe('true');
    expect(el.getAttribute('aria-label')).toBe('Loading');
  });
  it('honours custom ariaLabel override', () => {
    const { container } = render(<Skeleton ariaLabel="Loading audit events" />);
    const el = container.querySelector('[data-cir-component="Skeleton"]') as HTMLElement;
    expect(el.getAttribute('aria-label')).toBe('Loading audit events');
  });
  it('renders the default span (regression: rectangle preserves inline-block element)', () => {
    const { container } = render(<Skeleton />);
    const el = container.querySelector('span') as HTMLElement;
    expect(el.getAttribute('data-cir-component')).toBe('Skeleton');
    expect(el.getAttribute('data-shape')).toBe('rectangle');
    expect(el.style.display).toBe('inline-block');
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
  // Wave 11 / Vis-8 — canonical shape catalog
  //
  // Each shape renders a distinct DOM tree; the data-shape attribute always
  // reports the CANONICAL name (legacy aliases normalise on the way in).
  // ---------------------------------------------------------------------------

  it('default shape is rectangle', () => {
    const { container } = render(<Skeleton />);
    const root = container.querySelector('[data-cir-component="Skeleton"]') as HTMLElement;
    expect(root.getAttribute('data-shape')).toBe('rectangle');
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

  it('shape="line" renders a single rect with width in the 60-95% band', () => {
    const { container } = render(<Skeleton shape="line" />);
    const root = container.querySelector('[data-cir-component="Skeleton"]') as HTMLElement;
    expect(root.getAttribute('data-shape')).toBe('line');
    const blocks = root.querySelectorAll('[data-cir-skeleton-block]');
    expect(blocks).toHaveLength(1);
    const w = (blocks[0] as HTMLElement).style.width;
    const m = /^(\d+)%$/.exec(w);
    expect(m).not.toBeNull();
    const pct = Number(m?.[1]);
    expect(pct).toBeGreaterThanOrEqual(60);
    expect(pct).toBeLessThanOrEqual(95);
  });

  it('shape="line" width is stable across re-renders', () => {
    const { container: a } = render(<Skeleton shape="line" />);
    const { container: b } = render(<Skeleton shape="line" />);
    const wa = (a.querySelector('[data-cir-skeleton-block]') as HTMLElement).style.width;
    const wb = (b.querySelector('[data-cir-skeleton-block]') as HTMLElement).style.width;
    expect(wa).toBe(wb);
  });

  it('shape="line" with count=4 tiles 4 lines', () => {
    const { container } = render(<Skeleton shape="line" count={4} />);
    const root = container.querySelector('[data-cir-component="Skeleton"]') as HTMLElement;
    expect(root.getAttribute('data-count')).toBe('4');
    const lines = root.querySelectorAll('[data-cir-skeleton-block]');
    expect(lines).toHaveLength(4);
  });

  it('shape="stack" renders 1 circle + 2 text rects (avatar + 2 lines)', () => {
    const { container } = render(<Skeleton shape="stack" />);
    const root = container.querySelector('[data-cir-component="Skeleton"]') as HTMLElement;
    expect(root.getAttribute('data-shape')).toBe('stack');
    const blocks = Array.from(root.querySelectorAll<HTMLElement>('[data-cir-skeleton-block]'));
    expect(blocks).toHaveLength(3);
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

  it('shape="kpi" renders label + value (2 blocks)', () => {
    const { container } = render(<Skeleton shape="kpi" />);
    const root = container.querySelector('[data-cir-component="Skeleton"]') as HTMLElement;
    expect(root.getAttribute('data-shape')).toBe('kpi');
    const blocks = root.querySelectorAll('[data-cir-skeleton-block]');
    expect(blocks).toHaveLength(2);
  });

  it('shape="list-row" renders checkbox + line', () => {
    const { container } = render(<Skeleton shape="list-row" />);
    const root = container.querySelector('[data-cir-component="Skeleton"]') as HTMLElement;
    expect(root.getAttribute('data-shape')).toBe('list-row');
    const blocks = Array.from(root.querySelectorAll<HTMLElement>('[data-cir-skeleton-block]'));
    expect(blocks).toHaveLength(2);
    // First block is the 16x16 checkbox square (sm radius); second is the line.
    const checkbox = blocks[0];
    expect(checkbox.style.width).toBe('16px');
    expect(checkbox.style.height).toBe('16px');
  });

  it('shape="list-row" with count=4 emits 8 blocks (4 rows × [checkbox + line])', () => {
    const { container } = render(<Skeleton shape="list-row" count={4} />);
    const root = container.querySelector('[data-cir-component="Skeleton"]') as HTMLElement;
    expect(root.getAttribute('data-count')).toBe('4');
    const blocks = root.querySelectorAll('[data-cir-skeleton-block]');
    expect(blocks).toHaveLength(8);
  });

  it('shape="detail-block" renders hero + 3 stat blocks + 3 text lines', () => {
    const { container } = render(<Skeleton shape="detail-block" />);
    const root = container.querySelector('[data-cir-component="Skeleton"]') as HTMLElement;
    expect(root.getAttribute('data-shape')).toBe('detail-block');
    const blocks = root.querySelectorAll('[data-cir-skeleton-block]');
    expect(blocks.length).toBeGreaterThanOrEqual(7);
  });

  // ---------------------------------------------------------------------------
  // Distinct DOM per shape — sanity check that no two canonical shapes
  // produce the same block count + arrangement (cheap fingerprint).
  // ---------------------------------------------------------------------------

  it('every canonical shape produces distinct DOM', () => {
    const shapes = [
      'rectangle',
      'circle',
      'line',
      'stack',
      'card',
      'table-row',
      'kpi',
      'list-row',
      'detail-block',
    ] as const;
    const fingerprints = new Set<string>();
    for (const s of shapes) {
      const { container, unmount } = render(<Skeleton shape={s} />);
      const root = container.querySelector('[data-cir-component="Skeleton"]') as HTMLElement;
      const blockCount = root.querySelectorAll('[data-cir-skeleton-block]').length;
      const fp = `${s}:${String(blockCount)}:${root.tagName}`;
      fingerprints.add(fp);
      unmount();
    }
    expect(fingerprints.size).toBe(shapes.length);
  });

  // ---------------------------------------------------------------------------
  // Density — table-row + list-row pull row padding from
  // `DENSITY_ROW_PADDING_PX`. Verify the data-density attribute lands and the
  // inline padding matches each tier.
  // ---------------------------------------------------------------------------

  it('threads density onto data-cir-density', () => {
    for (const d of ['compact', 'comfortable', 'spacious'] as const) {
      const { container, unmount } = render(<Skeleton shape="table-row" density={d} />);
      const root = container.querySelector('[data-cir-component="Skeleton"]') as HTMLElement;
      expect(root.getAttribute('data-cir-density')).toBe(d);
      unmount();
    }
  });

  it('table-row vertical padding tracks density', () => {
    const expected: Record<'compact' | 'comfortable' | 'spacious', string> = {
      compact: '2px 0px',
      comfortable: '8px 0px',
      spacious: '14px 0px',
    };
    for (const d of ['compact', 'comfortable', 'spacious'] as const) {
      const { container, unmount } = render(<Skeleton shape="table-row" density={d} />);
      const root = container.querySelector('[data-cir-component="Skeleton"]') as HTMLElement;
      // The padded row is the inner div whose first child is a skeleton block
      // (the cells). Walk to find the parent of any block that has flex layout.
      const row = root.querySelector<HTMLElement>('div div[style*="padding"]');
      expect(row).not.toBeNull();
      expect(row && row.style.padding).toBe(expected[d]);
      unmount();
    }
  });

  it('list-row vertical padding tracks density', () => {
    const expected: Record<'compact' | 'comfortable' | 'spacious', string> = {
      compact: '2px 0px',
      comfortable: '8px 0px',
      spacious: '14px 0px',
    };
    for (const d of ['compact', 'comfortable', 'spacious'] as const) {
      const { container, unmount } = render(<Skeleton shape="list-row" density={d} />);
      const root = container.querySelector('[data-cir-component="Skeleton"]') as HTMLElement;
      const row = root.querySelector<HTMLElement>('div div[style*="padding"]');
      expect(row).not.toBeNull();
      expect(row && row.style.padding).toBe(expected[d]);
      unmount();
    }
  });

  // ---------------------------------------------------------------------------
  // Animation
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Legacy aliases — Wave 7b shape names normalise to canonical Wave 11
  // catalog entries so existing demos / hosts keep working.
  // ---------------------------------------------------------------------------

  it('legacy shape="rect" normalises to rectangle', () => {
    const { container } = render(<Skeleton shape="rect" />);
    const root = container.querySelector('[data-cir-component="Skeleton"]') as HTMLElement;
    expect(root.getAttribute('data-shape')).toBe('rectangle');
  });

  it('legacy shape="text-line" normalises to line', () => {
    const { container } = render(<Skeleton shape="text-line" />);
    const root = container.querySelector('[data-cir-component="Skeleton"]') as HTMLElement;
    expect(root.getAttribute('data-shape')).toBe('line');
  });

  it('legacy shape="avatar-with-2-lines" normalises to stack', () => {
    const { container } = render(<Skeleton shape="avatar-with-2-lines" />);
    const root = container.querySelector('[data-cir-component="Skeleton"]') as HTMLElement;
    expect(root.getAttribute('data-shape')).toBe('stack');
  });

  it('legacy shape="kpi-tile" normalises to kpi', () => {
    const { container } = render(<Skeleton shape="kpi-tile" />);
    const root = container.querySelector('[data-cir-component="Skeleton"]') as HTMLElement;
    expect(root.getAttribute('data-shape')).toBe('kpi');
  });

  it('legacy shape="detail-view" normalises to detail-block', () => {
    const { container } = render(<Skeleton shape="detail-view" />);
    const root = container.querySelector('[data-cir-component="Skeleton"]') as HTMLElement;
    expect(root.getAttribute('data-shape')).toBe('detail-block');
  });

  it('legacy shape="text-paragraph" normalises to line + count', () => {
    const { container } = render(<Skeleton shape="text-paragraph" count={3} />);
    const root = container.querySelector('[data-cir-component="Skeleton"]') as HTMLElement;
    expect(root.getAttribute('data-shape')).toBe('line');
    const lines = root.querySelectorAll('[data-cir-skeleton-block]');
    expect(lines).toHaveLength(3);
  });
});
