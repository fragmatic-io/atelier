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
  it('density is normal by default', () => {
    const { container } = render(<DetailView fields={FIELDS} />);
    expect(container.querySelector('dl')?.getAttribute('data-density')).toBe('normal');
  });
  it('dense=true sets data-density=dense', () => {
    const { container } = render(<DetailView fields={FIELDS} dense />);
    expect(container.querySelector('dl')?.getAttribute('data-density')).toBe('dense');
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
