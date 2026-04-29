// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NavBar, NavBarBinding } from '../src/components/NavBar.js';

const ITEMS = [
  { label: 'Home', href: '/' },
  { label: 'About', href: '/about', active: true },
  { label: 'Contact', href: '/contact' },
];

describe('NavBar', () => {
  it('renders <nav role="navigation"> with one <a> per item', () => {
    render(<NavBar items={ITEMS} />);
    expect(screen.getByRole('navigation')).toBeTruthy();
    const links = screen.getAllByRole('link');
    expect(links.length).toBe(3);
    expect(links[0]?.getAttribute('href')).toBe('/');
  });

  it('marks active item with aria-current="page"', () => {
    render(<NavBar items={ITEMS} />);
    const active = screen.getByText('About').closest('a');
    expect(active?.getAttribute('aria-current')).toBe('page');
    expect(active?.getAttribute('data-active')).toBe('true');
    const inactive = screen.getByText('Home').closest('a');
    expect(inactive?.getAttribute('aria-current')).toBeNull();
    expect(inactive?.getAttribute('data-active')).toBe('false');
  });

  it('renders the brand slot when provided', () => {
    render(<NavBar items={ITEMS} brand={<span>ACME</span>} />);
    expect(screen.getByText('ACME')).toBeTruthy();
  });

  it('renders without a brand slot', () => {
    const { container } = render(<NavBar items={ITEMS} />);
    expect(container.querySelector('[data-cir-part="navbar-brand"]')).not.toBeNull();
  });

  it('binding id matches', () => {
    expect(NavBarBinding.id).toBe('NavBar');
  });
});
