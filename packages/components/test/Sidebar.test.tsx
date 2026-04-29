// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Sidebar, SidebarBinding } from '../src/components/Sidebar.js';

const ITEMS = [
  { id: 'home', label: 'Home', href: '/', activeId: true },
  {
    id: 'docs',
    label: 'Docs',
    href: '/docs',
    children: [
      { id: 'getting-started', label: 'Getting started', href: '/docs/start' },
      { id: 'api', label: 'API', href: '/docs/api' },
    ],
  },
  { id: 'about', label: 'About', href: '/about' },
];

describe('Sidebar', () => {
  it('renders an aside with role navigation and a label', () => {
    render(<Sidebar items={ITEMS} />);
    expect(screen.getByRole('navigation', { name: 'Sidebar' })).toBeTruthy();
  });

  it('renders all top-level items', () => {
    render(<Sidebar items={ITEMS} />);
    expect(document.querySelectorAll('[data-cir-part="sidebar-item"]').length).toBe(3);
  });

  it('marks the active item with aria-current=page', () => {
    render(<Sidebar items={ITEMS} />);
    const home = screen.getByRole('link', { name: 'Home' });
    expect(home.getAttribute('aria-current')).toBe('page');
  });

  it('renders nested children when present', () => {
    render(<Sidebar items={ITEMS} />);
    expect(document.querySelectorAll('[data-cir-part="sidebar-child"]').length).toBe(2);
  });

  it('starts uncollapsed by default', () => {
    const { container } = render(<Sidebar items={ITEMS} />);
    expect(
      container.querySelector('[data-cir-component="Sidebar"]')?.getAttribute('data-collapsed'),
    ).toBe('false');
  });

  it('starts collapsed when defaultCollapsed', () => {
    const { container } = render(<Sidebar items={ITEMS} defaultCollapsed />);
    expect(
      container.querySelector('[data-cir-component="Sidebar"]')?.getAttribute('data-collapsed'),
    ).toBe('true');
  });

  it('toggle button flips the collapsed state', () => {
    const { container } = render(<Sidebar items={ITEMS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }));
    expect(
      container.querySelector('[data-cir-component="Sidebar"]')?.getAttribute('data-collapsed'),
    ).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Expand' }));
    expect(
      container.querySelector('[data-cir-component="Sidebar"]')?.getAttribute('data-collapsed'),
    ).toBe('false');
  });

  it('reflects side as data-cir-side', () => {
    const { container } = render(<Sidebar items={ITEMS} side="right" />);
    expect(
      container.querySelector('[data-cir-component="Sidebar"]')?.getAttribute('data-cir-side'),
    ).toBe('right');
  });

  it('renders a static label when an item has no href', () => {
    render(<Sidebar items={[{ id: 'h', label: 'Header' }]} />);
    expect(document.querySelector('[data-cir-part="sidebar-label-static"]')).toBeTruthy();
  });

  it('binding id matches', () => {
    expect(SidebarBinding.id).toBe('Sidebar');
  });
});
