// @vitest-environment happy-dom
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import './setup.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { InMemoryKeyboardRegistry, type KeyboardServices } from '@atelier/keyboard';
import { KeyboardProvider } from '../src/keyboard/index.js';
import { Sidebar, SidebarBinding, SIDEBAR_ITEM_GAP } from '../src/components/Sidebar.js';
import { NotificationAggregator } from '../src/notification/aggregator.js';

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

  it('keeps primary and secondary item spacing matched on design tokens', () => {
    const { container } = render(<Sidebar items={ITEMS} />);
    const primary = container.querySelector<HTMLElement>('[data-cir-part="sidebar-items"]');
    const secondary = container.querySelector<HTMLElement>('[data-cir-part="sidebar-children"]');
    expect(primary?.style.display).toBe('grid');
    expect(secondary?.style.display).toBe('grid');
    expect(primary?.style.gap).toBe(SIDEBAR_ITEM_GAP);
    expect(secondary?.style.gap).toBe(SIDEBAR_ITEM_GAP);
    expect(primary?.style.gap).toContain('--atelier-space-xs');
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

// -----------------------------------------------------------------------------
// Wave 11 / Nav-2 — namespaced storageKey + tree memory + keyboard registry
// -----------------------------------------------------------------------------

const TREE_ITEMS = [
  { id: 'home', label: 'Home', href: '/' },
  {
    id: 'docs',
    label: 'Docs',
    href: '/docs',
    children: [{ id: 'getting-started', label: 'Getting started', href: '/docs/start' }],
  },
  {
    id: 'settings',
    label: 'Settings',
    href: '/settings',
    children: [
      { id: 'profile', label: 'Profile', href: '/settings/profile' },
      { id: 'team', label: 'Team', href: '/settings/team' },
    ],
  },
];

describe('Sidebar — Wave 11 / Nav-2 storageKey + tree memory', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it('storageKey persists collapse state under <key>.collapsed', () => {
    const { container } = render(
      <Sidebar items={TREE_ITEMS} collapsible storageKey="aurora.sidebar" />,
    );
    expect(window.localStorage.getItem('aurora.sidebar.collapsed')).toBeNull();
    fireEvent.click(container.querySelector('[data-cir-part="sidebar-toggle"]')!);
    expect(window.localStorage.getItem('aurora.sidebar.collapsed')).toBe('1');
    fireEvent.click(container.querySelector('[data-cir-part="sidebar-toggle"]')!);
    expect(window.localStorage.getItem('aurora.sidebar.collapsed')).toBe('0');
  });

  it('reads <storageKey>.collapsed on mount', () => {
    window.localStorage.setItem('aurora.sidebar.collapsed', '1');
    const { container } = render(
      <Sidebar items={TREE_ITEMS} collapsible storageKey="aurora.sidebar" />,
    );
    expect(
      container.querySelector('[data-cir-component="Sidebar"]')?.getAttribute('data-collapsed'),
    ).toBe('true');
  });

  it('storageKey wins over a legacy persistKey when both are passed', () => {
    window.localStorage.setItem('legacy.key', '0');
    window.localStorage.setItem('new.key.collapsed', '1');
    const { container } = render(
      <Sidebar items={TREE_ITEMS} collapsible persistKey="legacy.key" storageKey="new.key" />,
    );
    expect(
      container.querySelector('[data-cir-component="Sidebar"]')?.getAttribute('data-collapsed'),
    ).toBe('true');
  });

  it('renders a chevron toggle for items with children', () => {
    const { container } = render(<Sidebar items={TREE_ITEMS} />);
    const toggles = container.querySelectorAll('[data-cir-part="sidebar-node-toggle"]');
    // `home` has no children, so 2 toggles for `docs` + `settings`.
    expect(toggles.length).toBe(2);
  });

  it('chevron toggle hides the children list and updates aria-expanded', () => {
    const { container } = render(<Sidebar items={TREE_ITEMS} />);
    const docsToggle = container.querySelector(
      '[data-cir-part="sidebar-node-toggle"][data-node-id="docs"]',
    );
    expect(docsToggle?.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('#cir-sidebar-children-docs')).toBeTruthy();
    fireEvent.click(docsToggle!);
    expect(docsToggle?.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('#cir-sidebar-children-docs')).toBeNull();
  });

  it('persists the expanded set to <storageKey>.expanded', () => {
    const { container } = render(<Sidebar items={TREE_ITEMS} storageKey="aurora.sidebar" />);
    fireEvent.click(
      container.querySelector('[data-cir-part="sidebar-node-toggle"][data-node-id="docs"]')!,
    );
    const stored = window.localStorage.getItem('aurora.sidebar.expanded');
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!) as string[];
    expect(parsed).toContain('settings');
    expect(parsed).not.toContain('docs');
  });

  it('reads <storageKey>.expanded on mount, ignoring children whose id is absent', () => {
    window.localStorage.setItem('aurora.sidebar.expanded', JSON.stringify(['settings']));
    const { container } = render(<Sidebar items={TREE_ITEMS} storageKey="aurora.sidebar" />);
    expect(container.querySelector('#cir-sidebar-children-docs')).toBeNull();
    expect(container.querySelector('#cir-sidebar-children-settings')).toBeTruthy();
  });

  it('falls back to default expanded when expanded JSON is corrupt', () => {
    window.localStorage.setItem('aurora.sidebar.expanded', 'not-json');
    const { container } = render(
      <Sidebar items={TREE_ITEMS} storageKey="aurora.sidebar" defaultExpanded={['docs']} />,
    );
    expect(container.querySelector('#cir-sidebar-children-docs')).toBeTruthy();
    expect(container.querySelector('#cir-sidebar-children-settings')).toBeNull();
  });

  it('controlled `expanded` prop fires onExpandedChange and is authoritative', () => {
    const onExpandedChange = vi.fn();
    const { container } = render(
      <Sidebar items={TREE_ITEMS} expanded={['docs']} onExpandedChange={onExpandedChange} />,
    );
    expect(container.querySelector('#cir-sidebar-children-docs')).toBeTruthy();
    expect(container.querySelector('#cir-sidebar-children-settings')).toBeNull();
    fireEvent.click(
      container.querySelector('[data-cir-part="sidebar-node-toggle"][data-node-id="settings"]')!,
    );
    expect(onExpandedChange).toHaveBeenCalledWith(['docs', 'settings']);
  });

  it('collapsing the sidebar hides chevrons but preserves the expanded set', () => {
    const { container } = render(
      <Sidebar items={TREE_ITEMS} collapsible storageKey="aurora.sidebar" />,
    );
    fireEvent.click(
      container.querySelector('[data-cir-part="sidebar-node-toggle"][data-node-id="docs"]')!,
    );
    fireEvent.click(container.querySelector('[data-cir-part="sidebar-toggle"]')!);
    expect(container.querySelectorAll('[data-cir-part="sidebar-node-toggle"]').length).toBe(0);
    expect(container.querySelectorAll('[data-cir-part="sidebar-children"]').length).toBe(0);
    fireEvent.click(container.querySelector('[data-cir-part="sidebar-toggle"]')!);
    expect(container.querySelector('#cir-sidebar-children-docs')).toBeNull();
    expect(container.querySelector('#cir-sidebar-children-settings')).toBeTruthy();
  });

  it('collapseHotkey alias toggles via keyboard when collapsible', () => {
    const { container } = render(<Sidebar items={TREE_ITEMS} collapsible collapseHotkey={'\\'} />);
    fireEvent.keyDown(document, { key: '\\' });
    expect(
      container.querySelector('[data-cir-component="Sidebar"]')?.getAttribute('data-collapsed'),
    ).toBe('true');
  });

  it('collapseHotkey wins over toggleShortcut when both are passed', () => {
    const { container } = render(
      <Sidebar items={TREE_ITEMS} collapsible toggleShortcut="]" collapseHotkey={'\\'} />,
    );
    fireEvent.keyDown(document, { key: ']' });
    expect(
      container.querySelector('[data-cir-component="Sidebar"]')?.getAttribute('data-collapsed'),
    ).toBe('false');
    fireEvent.keyDown(document, { key: '\\' });
    expect(
      container.querySelector('[data-cir-component="Sidebar"]')?.getAttribute('data-collapsed'),
    ).toBe('true');
  });

  it('persists across remounts via storageKey', () => {
    const { container, unmount } = render(
      <Sidebar items={TREE_ITEMS} collapsible storageKey="aurora.sidebar" />,
    );
    // Toggle the `docs` chevron BEFORE collapsing the rail — once the
    // sidebar is collapsed the chevrons are gone.
    fireEvent.click(
      container.querySelector('[data-cir-part="sidebar-node-toggle"][data-node-id="docs"]')!,
    );
    fireEvent.click(container.querySelector('[data-cir-part="sidebar-toggle"]')!);
    unmount();

    const second = render(<Sidebar items={TREE_ITEMS} collapsible storageKey="aurora.sidebar" />);
    expect(
      second.container
        .querySelector('[data-cir-component="Sidebar"]')
        ?.getAttribute('data-collapsed'),
    ).toBe('true');
    // Expand and check that `docs` stayed closed.
    fireEvent.click(second.container.querySelector('[data-cir-part="sidebar-toggle"]')!);
    expect(second.container.querySelector('#cir-sidebar-children-docs')).toBeNull();
    expect(second.container.querySelector('#cir-sidebar-children-settings')).toBeTruthy();
  });
});

describe('Sidebar — Wave 11 / Nav-2 keyboard registry integration', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  function makeKeyboardServices(): KeyboardServices {
    return { registry: new InMemoryKeyboardRegistry() };
  }

  it('registers `sidebar.toggle` when wrapped in <KeyboardProvider> and collapsible', () => {
    const services = makeKeyboardServices();
    render(
      <KeyboardProvider services={services} disableEventListener>
        <Sidebar items={TREE_ITEMS} collapsible storageKey="aurora.sidebar" />
      </KeyboardProvider>,
    );
    const action = services.registry.list().find((a) => a.id === 'sidebar.toggle');
    expect(action).toBeDefined();
    expect(action?.hotkey).toBe('[');
    expect(action?.scope).toBe('global');
  });

  it('does NOT publish a hotkey for sidebar.toggle when not collapsible', () => {
    const services = makeKeyboardServices();
    render(
      <KeyboardProvider services={services} disableEventListener>
        <Sidebar items={TREE_ITEMS} />
      </KeyboardProvider>,
    );
    const action = services.registry.list().find((a) => a.id === 'sidebar.toggle');
    expect(action).toBeDefined();
    expect(action?.hotkey).toBeUndefined();
  });

  it('invoking sidebar.toggle through the registry flips collapse state', () => {
    const services = makeKeyboardServices();
    const { container } = render(
      <KeyboardProvider services={services} disableEventListener>
        <Sidebar items={TREE_ITEMS} collapsible storageKey="aurora.sidebar" />
      </KeyboardProvider>,
    );
    const action = services.registry.list().find((a) => a.id === 'sidebar.toggle');
    expect(
      container.querySelector('[data-cir-component="Sidebar"]')?.getAttribute('data-collapsed'),
    ).toBe('false');
    act(() => {
      // `invoke` may be sync or async — its return is discarded by the
      // registry. Mark the call explicitly void so the linter doesn't
      // flag a floating promise.
      void action?.invoke();
    });
    expect(
      container.querySelector('[data-cir-component="Sidebar"]')?.getAttribute('data-collapsed'),
    ).toBe('true');
  });

  it('respects collapseHotkey when registering the action', () => {
    const services = makeKeyboardServices();
    render(
      <KeyboardProvider services={services} disableEventListener>
        <Sidebar items={TREE_ITEMS} collapsible collapseHotkey={'\\'} />
      </KeyboardProvider>,
    );
    const action = services.registry.list().find((a) => a.id === 'sidebar.toggle');
    expect(action?.hotkey).toBe('\\');
  });

  it('no-ops when no <KeyboardProvider> is in scope', () => {
    expect(() => {
      render(<Sidebar items={TREE_ITEMS} collapsible />);
    }).not.toThrow();
  });
});

// -----------------------------------------------------------------------------
// Wave 11 / Vis-10 — notification aggregator integration
// -----------------------------------------------------------------------------

const BADGE_ITEMS = [
  { id: 'inbox', label: 'Inbox', href: '/inbox', badgeScope: 'inbox' },
  {
    id: 'workspace',
    label: 'Workspace',
    href: '/workspace',
    badgeScope: 'workspace-acme',
  },
  { id: 'quiet', label: 'Quiet', href: '/quiet', badgeScope: 'no-such-scope' },
  { id: 'no-binding', label: 'About', href: '/about' },
];

describe('Sidebar — Wave 11 / Vis-10 notification badges', () => {
  it('renders nothing badge-shaped when no aggregator is wired', () => {
    const { container } = render(<Sidebar items={BADGE_ITEMS} />);
    expect(container.querySelectorAll('[data-cir-part="sidebar-badge"]').length).toBe(0);
  });

  it('renders a MetaBadge for items whose badgeScope matches the aggregator', () => {
    const aggregator = new NotificationAggregator();
    aggregator.set('inbox', { scope: 'inbox', total: 3 });
    const { container } = render(<Sidebar items={BADGE_ITEMS} aggregator={aggregator} />);
    const badges = container.querySelectorAll('[data-cir-part="sidebar-badge"]');
    expect(badges.length).toBe(1);
    const inboxItem = container.querySelector(
      '[data-cir-part="sidebar-item"][data-cir-badge-scope="inbox"]',
    );
    expect(inboxItem?.querySelector('[data-cir-component="MetaBadge"]')).toBeTruthy();
    expect(inboxItem?.querySelector('[data-cir-part="metabadge-content"]')?.textContent).toBe('3');
  });

  it('rolls up child scopes via badgeScope prefix', () => {
    const aggregator = new NotificationAggregator();
    aggregator.set('workspace-acme.channel-eng', {
      scope: 'workspace-acme.channel-eng',
      total: 4,
    });
    aggregator.set('workspace-acme.channel-design', {
      scope: 'workspace-acme.channel-design',
      total: 2,
    });
    aggregator.set('workspace-other', { scope: 'workspace-other', total: 99 });
    const { container } = render(<Sidebar items={BADGE_ITEMS} aggregator={aggregator} />);
    const item = container.querySelector(
      '[data-cir-part="sidebar-item"][data-cir-badge-scope="workspace-acme"]',
    );
    expect(item?.querySelector('[data-cir-part="metabadge-content"]')?.textContent).toBe('6');
  });

  it('paints the live variant when any rolled-up entry has mentions', () => {
    const aggregator = new NotificationAggregator();
    aggregator.set('inbox', { scope: 'inbox', total: 5, mentions: 2 });
    const { container } = render(<Sidebar items={BADGE_ITEMS} aggregator={aggregator} />);
    const item = container.querySelector(
      '[data-cir-part="sidebar-item"][data-cir-badge-scope="inbox"]',
    );
    expect(item?.getAttribute('data-cir-badge-mentions')).toBe('true');
    expect(
      item?.querySelector('[data-cir-component="MetaBadge"]')?.getAttribute('data-variant'),
    ).toBe('live');
  });

  it('paints the default variant when there are unread but no mentions', () => {
    const aggregator = new NotificationAggregator();
    aggregator.set('inbox', { scope: 'inbox', total: 4 });
    const { container } = render(<Sidebar items={BADGE_ITEMS} aggregator={aggregator} />);
    const item = container.querySelector(
      '[data-cir-part="sidebar-item"][data-cir-badge-scope="inbox"]',
    );
    expect(item?.getAttribute('data-cir-badge-mentions')).toBeNull();
    expect(
      item?.querySelector('[data-cir-component="MetaBadge"]')?.getAttribute('data-variant'),
    ).toBe('default');
  });

  it('omits the badge when total is zero', () => {
    const aggregator = new NotificationAggregator();
    aggregator.set('inbox', { scope: 'inbox', total: 0 });
    const { container } = render(<Sidebar items={BADGE_ITEMS} aggregator={aggregator} />);
    expect(container.querySelectorAll('[data-cir-part="sidebar-badge"]').length).toBe(0);
  });

  it('hides the badge when the rail is collapsed to mini-rail', () => {
    const aggregator = new NotificationAggregator();
    aggregator.set('inbox', { scope: 'inbox', total: 9 });
    const { container } = render(
      <Sidebar items={BADGE_ITEMS} aggregator={aggregator} collapsible defaultCollapsed />,
    );
    expect(container.querySelectorAll('[data-cir-part="sidebar-badge"]').length).toBe(0);
  });

  it('re-renders when the aggregator emits after a wire update', () => {
    const aggregator = new NotificationAggregator();
    const { container } = render(<Sidebar items={BADGE_ITEMS} aggregator={aggregator} />);
    expect(container.querySelectorAll('[data-cir-part="sidebar-badge"]').length).toBe(0);
    act(() => {
      aggregator.set('inbox', { scope: 'inbox', total: 7 });
    });
    expect(container.querySelectorAll('[data-cir-part="sidebar-badge"]').length).toBe(1);
    expect(container.querySelector('[data-cir-part="metabadge-content"]')?.textContent).toBe('7');
    act(() => {
      aggregator.set('inbox', { scope: 'inbox', total: 12, mentions: 3 });
    });
    expect(
      container
        .querySelector(
          '[data-cir-part="sidebar-item"][data-cir-badge-scope="inbox"] [data-cir-component="MetaBadge"]',
        )
        ?.getAttribute('data-variant'),
    ).toBe('live');
  });
});
