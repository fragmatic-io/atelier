// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Skeleton, SkeletonBinding } from '../src/components/Skeleton.js';

describe('Skeleton', () => {
  it('renders a span with aria-hidden=true', () => {
    const { container } = render(<Skeleton />);
    const span = container.querySelector('span');
    expect(span).toBeTruthy();
    expect(span?.getAttribute('aria-hidden')).toBe('true');
  });

  it('defaults to width=100% height=1em radius=sm', () => {
    const { container } = render(<Skeleton />);
    const span = container.querySelector('span') as HTMLElement;
    expect(span.style.width).toBe('100%');
    expect(span.style.height).toBe('1em');
    expect(span.style.borderRadius).toBe('4px');
    expect(span.getAttribute('data-radius')).toBe('sm');
  });

  it('numeric width/height are interpreted as px', () => {
    const { container } = render(<Skeleton width={120} height={40} />);
    const span = container.querySelector('span') as HTMLElement;
    expect(span.style.width).toBe('120px');
    expect(span.style.height).toBe('40px');
  });

  it('string width/height pass through as-is', () => {
    const { container } = render(<Skeleton width="50%" height="2rem" />);
    const span = container.querySelector('span') as HTMLElement;
    expect(span.style.width).toBe('50%');
    expect(span.style.height).toBe('2rem');
  });

  it('radius="full" maps to a pill border-radius', () => {
    const { container } = render(<Skeleton radius="full" />);
    const span = container.querySelector('span') as HTMLElement;
    expect(span.style.borderRadius).toBe('9999px');
    expect(span.getAttribute('data-radius')).toBe('full');
  });

  it('passes className through', () => {
    const { container } = render(<Skeleton className="my-skel" />);
    expect(container.querySelector('span')?.className).toBe('my-skel');
  });

  it('binding id matches', () => {
    expect(SkeletonBinding.id).toBe('Skeleton');
  });
});
