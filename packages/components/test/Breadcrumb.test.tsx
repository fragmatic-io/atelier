// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Breadcrumb, BreadcrumbBinding } from '../src/components/Breadcrumb.js';

describe('Breadcrumb', () => {
  it('renders <nav aria-label="Breadcrumb"> + ordered list', () => {
    render(
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Settings', href: '/settings' },
          { label: 'Profile' },
        ]}
      />,
    );
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(nav).toBeTruthy();
    expect(nav.querySelector('ol')).not.toBeNull();
  });

  it('links non-final items, renders the last as a span with aria-current="page"', () => {
    render(
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Settings', href: '/settings' },
          { label: 'Profile' },
        ]}
      />,
    );
    expect(screen.getByText('Home').tagName).toBe('A');
    expect(screen.getByText('Home').getAttribute('href')).toBe('/');
    const last = screen.getByText('Profile');
    expect(last.tagName).toBe('SPAN');
    expect(last.getAttribute('aria-current')).toBe('page');
  });

  it('does not render a separator after the last item', () => {
    const { container } = render(
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Profile' }]} />,
    );
    const separators = container.querySelectorAll('[data-cir-part="breadcrumb-separator"]');
    expect(separators.length).toBe(1);
  });

  it('renders a single-item breadcrumb as just the current page', () => {
    render(<Breadcrumb items={[{ label: 'Home' }]} />);
    expect(screen.getByText('Home').getAttribute('aria-current')).toBe('page');
  });

  it('binding id matches', () => {
    expect(BreadcrumbBinding.id).toBe('Breadcrumb');
  });

  // -- Vis-4 variant tests ---------------------------------------------------
  it('defaults to variant=default and emits data-variant', () => {
    render(<Breadcrumb items={[{ label: 'Home' }]} />);
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(nav.getAttribute('data-variant')).toBe('default');
  });
  it('reflects variant=subtle class', () => {
    render(<Breadcrumb items={[{ label: 'Home' }]} variant="subtle" />);
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(nav.getAttribute('data-variant')).toBe('subtle');
    expect(nav.className).toContain('text-gray-500');
  });
  it('reflects variant=inverse class', () => {
    render(<Breadcrumb items={[{ label: 'Home' }]} variant="inverse" />);
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(nav.className).toContain('bg-gray-900');
    expect(nav.className).toContain('text-white');
  });
});
