// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { StatCard, StatCardBinding } from '../src/components/StatCard.js';

describe('StatCard', () => {
  it('renders label and value', () => {
    const { container } = render(<StatCard label="Users" value="1,234" />);
    expect(container.querySelector('[data-cir-part="stat-label"]')?.textContent).toBe('Users');
    expect(container.querySelector('[data-cir-part="stat-value"]')?.textContent).toBe('1,234');
  });
  it('renders optional delta with trend glyph', () => {
    const { container } = render(
      <StatCard label="x" value={1} delta={{ value: '+5%', trend: 'up' }} />,
    );
    const delta = container.querySelector('[data-cir-part="stat-delta"]');
    expect(delta?.getAttribute('data-trend')).toBe('up');
    expect(delta?.textContent).toContain('+5%');
  });
  it('renders helper text when provided', () => {
    const { container } = render(<StatCard label="x" value={1} helperText="vs last week" />);
    expect(container.querySelector('[data-cir-part="stat-helper"]')?.textContent).toBe(
      'vs last week',
    );
  });
  it('section is keyed off data-cir-component', () => {
    const { container } = render(<StatCard label="x" value={1} />);
    expect(container.querySelector('[data-cir-component="StatCard"]')).toBeTruthy();
  });
  it('binding id matches', () => {
    expect(StatCardBinding.id).toBe('StatCard');
  });
  // -- Wave 6 / P-10 variant assertions --
  it('defaults to variant=default and size=md', () => {
    const { container } = render(<StatCard label="x" value={1} />);
    const sec = container.querySelector('[data-cir-component="StatCard"]') as HTMLElement;
    expect(sec.getAttribute('data-variant')).toBe('default');
    expect(sec.getAttribute('data-size')).toBe('md');
  });
  it('reflects each variant on data-variant', () => {
    for (const v of ['default', 'accent', 'muted'] as const) {
      const { container, unmount } = render(<StatCard label="x" value={1} variant={v} />);
      const sec = container.querySelector('[data-cir-component="StatCard"]') as HTMLElement;
      expect(sec.getAttribute('data-variant')).toBe(v);
      unmount();
    }
  });
  it('combines variant + size class', () => {
    const { container } = render(<StatCard label="x" value={1} variant="accent" size="lg" />);
    const sec = container.querySelector('[data-cir-component="StatCard"]') as HTMLElement;
    expect(sec.className).toContain('bg-blue-50');
    expect(sec.className).toContain('text-lg');
  });
  // -- Wave 6 / P-1 density assertions --
  it('defaults density to comfortable and surfaces data-density', () => {
    const { container } = render(<StatCard label="x" value={1} />);
    expect(
      container.querySelector('[data-cir-component="StatCard"]')?.getAttribute('data-density'),
    ).toBe('comfortable');
  });
  it('shrinks tile padding at compact density', () => {
    const { container, rerender } = render(<StatCard label="x" value="1" density="comfortable" />);
    const comfySec = container.querySelector<HTMLElement>('[data-cir-component="StatCard"]');
    const comfyPad = parseInt(comfySec?.style.padding ?? '0', 10);
    rerender(<StatCard label="x" value="1" density="compact" />);
    const compactSec = container.querySelector<HTMLElement>('[data-cir-component="StatCard"]');
    const compactPad = parseInt(compactSec?.style.padding ?? '0', 10);
    expect(compactPad).toBeLessThan(comfyPad);
  });
});
