// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState, EmptyStateBinding } from '../src/components/EmptyState.js';

describe('EmptyState', () => {
  it('renders title and (optional) description', () => {
    render(<EmptyState title="Nothing here" description="Try again later." />);
    expect(screen.getByText('Nothing here')).toBeTruthy();
    expect(screen.getByText('Try again later.')).toBeTruthy();
  });
  it('omits description when not given', () => {
    const { container } = render(<EmptyState title="t" />);
    expect(container.querySelector('[data-cir-part="empty-description"]')).toBeNull();
  });
  it('renders an action slot', () => {
    render(<EmptyState title="t" action={<button type="button">retry</button>} />);
    expect(screen.getByRole('button', { name: 'retry' })).toBeTruthy();
  });
  it('binding id matches', () => {
    expect(EmptyStateBinding.id).toBe('EmptyState');
  });
  // -- Wave 6 / P-10 variant assertions --
  it('defaults to variant=ghost', () => {
    render(<EmptyState title="t" />);
    expect(screen.getByRole('status').getAttribute('data-variant')).toBe('ghost');
  });
  it('reflects each variant on data-variant', () => {
    for (const v of ['bordered', 'elevated', 'ghost', 'tinted'] as const) {
      const { unmount } = render(<EmptyState title="t" variant={v} />);
      expect(screen.getByRole('status').getAttribute('data-variant')).toBe(v);
      unmount();
    }
  });
  it('applies the bordered variant class', () => {
    render(<EmptyState title="t" variant="bordered" />);
    expect(screen.getByRole('status').className).toContain('border');
  });
});
