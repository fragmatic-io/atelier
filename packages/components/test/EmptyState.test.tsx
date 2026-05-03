// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState, EmptyStateBinding } from '../src/components/EmptyState.js';
import { IllustrationResolverProvider } from '../src/illustrations/context.js';
import { MapIllustrationResolver } from '../src/illustrations/resolver.js';

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
  // -- Wave 11 / Vis-5 illustration integration --
  it('renders inline SVG when illustration resolves', () => {
    const resolver = new MapIllustrationResolver({
      mascot: { svg: '<svg data-test="m"/>', label: 'Mascot' },
    });
    const { container } = render(
      <IllustrationResolverProvider resolver={resolver}>
        <EmptyState title="t" illustration="mascot" />
      </IllustrationResolverProvider>,
    );
    const slot = container.querySelector('[data-cir-part="empty-illustration"]');
    expect(slot).toBeTruthy();
    expect(slot?.querySelector('svg')).toBeTruthy();
    expect(slot?.getAttribute('aria-label')).toBe('Mascot');
  });
  it('skips the illustration slot when the resolver returns null', () => {
    const resolver = new MapIllustrationResolver({});
    const { container } = render(
      <IllustrationResolverProvider resolver={resolver}>
        <EmptyState title="t" illustration="missing" />
      </IllustrationResolverProvider>,
    );
    expect(container.querySelector('[data-cir-part="empty-illustration"]')).toBeNull();
    expect(container.querySelector('[data-cir-part="empty-title"]')?.textContent).toBe('t');
  });
  it('skips the illustration slot when no resolver provider is in scope', () => {
    const { container } = render(<EmptyState title="t" illustration="inbox-zero" />);
    expect(container.querySelector('[data-cir-part="empty-illustration"]')).toBeNull();
  });
});
