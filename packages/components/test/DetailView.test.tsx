// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { DetailView, DetailViewBinding } from '../src/components/DetailView.js';

const FIELDS = [
  { label: 'A', value: 1 },
  { label: 'B', value: 2 },
];

describe('DetailView', () => {
  it('renders one dt/dd pair per field', () => {
    const { container } = render(<DetailView fields={FIELDS} />);
    expect(container.querySelectorAll('dt').length).toBe(2);
    expect(container.querySelectorAll('dd').length).toBe(2);
  });
  // Wave 11 / Vis-6 — DetailView opted into the personalisation density
  // pipeline. The legacy `dense?: boolean` prop still works (true → compact)
  // for back-compat with hosts that toggle it from settings UI; new code
  // should pass `density?: Density` directly. The data-density attribute
  // reports the resolved canonical value so host stylesheets can target
  // `[data-cir-density="compact"]`.
  it('defaults to comfortable density', () => {
    const { container } = render(<DetailView fields={FIELDS} />);
    expect(container.querySelector('dl')?.getAttribute('data-density')).toBe('comfortable');
    expect(container.querySelector('dl')?.getAttribute('data-cir-density')).toBe('comfortable');
  });
  it('dense=true collapses to density=compact (back-compat)', () => {
    const { container } = render(<DetailView fields={FIELDS} dense />);
    expect(container.querySelector('dl')?.getAttribute('data-density')).toBe('compact');
    expect(container.querySelector('dl')?.getAttribute('data-cir-density')).toBe('compact');
  });
  it('explicit density prop wins over dense=true', () => {
    const { container } = render(<DetailView fields={FIELDS} dense density="spacious" />);
    expect(container.querySelector('dl')?.getAttribute('data-density')).toBe('spacious');
  });
  it('binding id matches', () => {
    expect(DetailViewBinding.id).toBe('DetailView');
  });
  // -- Wave 6 / P-10 variant assertions --
  it('defaults to variant=ghost', () => {
    const { container } = render(<DetailView fields={FIELDS} />);
    expect(container.querySelector('dl')?.getAttribute('data-variant')).toBe('ghost');
  });
  it('reflects each variant on data-variant', () => {
    for (const v of ['bordered', 'elevated', 'ghost', 'tinted'] as const) {
      const { container, unmount } = render(<DetailView fields={FIELDS} variant={v} />);
      expect(container.querySelector('dl')?.getAttribute('data-variant')).toBe(v);
      unmount();
    }
  });
  it('applies the tinted variant class', () => {
    const { container } = render(<DetailView fields={FIELDS} variant="tinted" />);
    expect(container.querySelector('dl')?.className).toContain('bg-gray-50');
  });
});
