// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Skeleton, SkeletonBinding } from '../src/components/Skeleton.js';

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
});
