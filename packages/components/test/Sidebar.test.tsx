// @vitest-environment happy-dom
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
import './setup.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('Sidebar — Wave 7b collapsible behaviour', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it('collapsible=false ignores the [ shortcut entirely', () => {
    const { container } = render(<Sidebar items={ITEMS} />);
    fireEvent.keyDown(document, { key: '[' });
    expect(
      container.querySelector('[data-cir-component="Sidebar"]')?.getAttribute('data-collapsed'),
    ).toBe('false');
  });

  it('collapsible + defaultCollapsed=false renders expanded with the collapsible label', () => {
    const { container } = render(<Sidebar items={ITEMS} collapsible />);
    const aside = container.querySelector('[data-cir-component="Sidebar"]');
    expect(aside?.getAttribute('aria-label')).toBe('Sidebar (collapsible)');
    expect(aside?.getAttribute('data-collapsed')).toBe('false');
    expect(aside?.getAttribute('data-cir-collapsible')).toBe('true');
  });

  it('[ keypress toggles collapsed state when collapsible', () => {
    const onChange = vi.fn();
    const { container } = render(<Sidebar items={ITEMS} collapsible onCollapseChange={onChange} />);
    fireEvent.keyDown(document, { key: '[' });
    expect(
      container.querySelector('[data-cir-component="Sidebar"]')?.getAttribute('data-collapsed'),
    ).toBe('true');
    expect(onChange).toHaveBeenCalledWith(true);
    fireEvent.keyDown(document, { key: '[' });
    expect(
      container.querySelector('[data-cir-component="Sidebar"]')?.getAttribute('data-collapsed'),
    ).toBe('false');
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it('[ keypress inside an input does NOT toggle', () => {
    const { container } = render(
      <div>
        <input data-testid="probe" />
        <Sidebar items={ITEMS} collapsible />
      </div>,
    );
    const input = screen.getByTestId('probe');
    fireEvent.keyDown(input, { key: '[' });
    expect(
      container.querySelector('[data-cir-component="Sidebar"]')?.getAttribute('data-collapsed'),
    ).toBe('false');
  });

  it('[ keypress with a modifier key does NOT toggle', () => {
    const { container } = render(<Sidebar items={ITEMS} collapsible />);
    fireEvent.keyDown(document, { key: '[', metaKey: true });
    expect(
      container.querySelector('[data-cir-component="Sidebar"]')?.getAttribute('data-collapsed'),
    ).toBe('false');
  });

  it('persists state to localStorage on change', () => {
    const { container } = render(
      <Sidebar items={ITEMS} collapsible persistKey="cir.test.sidebar" />,
    );
    expect(window.localStorage.getItem('cir.test.sidebar')).toBeNull();
    fireEvent.click(container.querySelector('[data-cir-part="sidebar-toggle"]')!);
    expect(window.localStorage.getItem('cir.test.sidebar')).toBe('1');
    fireEvent.click(container.querySelector('[data-cir-part="sidebar-toggle"]')!);
    expect(window.localStorage.getItem('cir.test.sidebar')).toBe('0');
  });

  it('reads persisted state on mount', () => {
    window.localStorage.setItem('cir.test.sidebar', '1');
    const { container } = render(
      <Sidebar items={ITEMS} collapsible persistKey="cir.test.sidebar" />,
    );
    expect(
      container.querySelector('[data-cir-component="Sidebar"]')?.getAttribute('data-collapsed'),
    ).toBe('true');
  });

  it('falls through to defaultCollapsed when storage holds a corrupt value', () => {
    window.localStorage.setItem('cir.test.sidebar', 'not-a-bool');
    const { container } = render(
      <Sidebar items={ITEMS} collapsible defaultCollapsed persistKey="cir.test.sidebar" />,
    );
    expect(
      container.querySelector('[data-cir-component="Sidebar"]')?.getAttribute('data-collapsed'),
    ).toBe('true');
  });

  it('controlled `collapsed` prop wins over localStorage', () => {
    window.localStorage.setItem('cir.test.sidebar', '1');
    const { container } = render(
      <Sidebar items={ITEMS} collapsible collapsed={false} persistKey="cir.test.sidebar" />,
    );
    expect(
      container.querySelector('[data-cir-component="Sidebar"]')?.getAttribute('data-collapsed'),
    ).toBe('false');
    // Storage should not have been overwritten by an internal write.
    expect(window.localStorage.getItem('cir.test.sidebar')).toBe('1');
  });

  it('toggleShortcut=false disables the keyboard listener', () => {
    const { container } = render(<Sidebar items={ITEMS} collapsible toggleShortcut={false} />);
    fireEvent.keyDown(document, { key: '[' });
    expect(
      container.querySelector('[data-cir-component="Sidebar"]')?.getAttribute('data-collapsed'),
    ).toBe('false');
  });

  it('honours a custom toggleShortcut character', () => {
    const { container } = render(<Sidebar items={ITEMS} collapsible toggleShortcut="]" />);
    // The default '[' should now be inert.
    fireEvent.keyDown(document, { key: '[' });
    expect(
      container.querySelector('[data-cir-component="Sidebar"]')?.getAttribute('data-collapsed'),
    ).toBe('false');
    // The configured ']' toggles.
    fireEvent.keyDown(document, { key: ']' });
    expect(
      container.querySelector('[data-cir-component="Sidebar"]')?.getAttribute('data-collapsed'),
    ).toBe('true');
  });

  it('aria-expanded on the toggle button updates with state', () => {
    const { container } = render(<Sidebar items={ITEMS} collapsible />);
    const btn = container.querySelector('[data-cir-part="sidebar-toggle"]');
    expect(btn?.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-expanded')).toBe('false');
  });

  it('reduced motion disables the width transition', () => {
    const original = window.matchMedia.bind(window);
    const matchMediaMock = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    Object.defineProperty(window, 'matchMedia', { value: matchMediaMock, configurable: true });
    try {
      const { container } = render(<Sidebar items={ITEMS} collapsible />);
      const aside = container.querySelector<HTMLElement>('[data-cir-component="Sidebar"]');
      expect(aside?.getAttribute('data-cir-reduced-motion')).toBe('true');
      expect(aside?.style.transition ?? '').toBe('');
    } finally {
      Object.defineProperty(window, 'matchMedia', { value: original, configurable: true });
    }
  });

  it('hides item labels in the collapsed state but keeps icons', () => {
    const ITEMS_WITH_ICON = [{ id: 'home', label: 'Home', href: '/', icon: <span>i</span> }];
    const { container } = render(<Sidebar items={ITEMS_WITH_ICON} collapsible defaultCollapsed />);
    expect(container.querySelector('[data-cir-part="sidebar-label"]')).toBeNull();
    expect(container.querySelector('[data-cir-part="sidebar-icon"]')).toBeTruthy();
    expect(container.querySelector('[data-cir-part="sidebar-children"]')).toBeNull();
  });

  // -- Vis-4 variant tests ---------------------------------------------------
  it('defaults to variant=default', () => {
    const { container } = render(<Sidebar items={[]} />);
    const aside = container.querySelector('[data-cir-component="Sidebar"]');
    expect(aside?.getAttribute('data-variant')).toBe('default');
  });
  it('reflects variant=subtle class', () => {
    const { container } = render(<Sidebar items={[]} variant="subtle" />);
    const aside = container.querySelector('[data-cir-component="Sidebar"]');
    expect(aside?.className).toContain('text-gray-500');
  });
  it('reflects variant=inverse class', () => {
    const { container } = render(<Sidebar items={[]} variant="inverse" />);
    const aside = container.querySelector('[data-cir-component="Sidebar"]');
    expect(aside?.getAttribute('data-variant')).toBe('inverse');
    expect(aside?.className).toContain('bg-gray-900');
  });
});
