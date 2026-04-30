// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Spinner, SpinnerBinding } from '../src/components/Spinner.js';

describe('Spinner', () => {
  it('renders with default label', () => {
    render(<Spinner />);
    expect(screen.getByRole('status').textContent).toBe('Loading…');
  });
  it('renders with a custom label', () => {
    render(<Spinner label="Saving" />);
    expect(screen.getByRole('status').textContent).toBe('Saving');
  });
  it('binding id matches', () => {
    expect(SpinnerBinding.id).toBe('Spinner');
  });
  // -- Wave 6 / P-10 variant assertions --
  it('defaults to variant=ghost', () => {
    render(<Spinner />);
    expect(screen.getByRole('status').getAttribute('data-variant')).toBe('ghost');
  });
  it('reflects each variant on data-variant', () => {
    for (const v of ['bordered', 'elevated', 'ghost', 'tinted'] as const) {
      const { unmount } = render(<Spinner variant={v} />);
      expect(screen.getByRole('status').getAttribute('data-variant')).toBe(v);
      unmount();
    }
  });
  it('applies the bordered variant class', () => {
    render(<Spinner variant="bordered" />);
    expect(screen.getByRole('status').className).toContain('border');
  });
});
