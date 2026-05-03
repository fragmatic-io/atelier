// @vitest-environment happy-dom
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import './setup.js';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  InMemoryKeyboardRegistry,
  InMemoryRecencyTracker,
  type KeyboardServices,
} from '@atelier/keyboard';
import {
  SettingsSearch,
  SettingsSearchBinding,
  type SettingsItem,
} from '../src/components/SettingsSearch.js';
import { KeyboardProvider } from '../src/keyboard/index.js';

const ITEMS: readonly SettingsItem[] = [
  {
    id: 'profile',
    label: 'Profile',
    description: 'Your name, avatar, handle',
    href: '/settings/profile',
    section: 'Account',
    keywords: ['name', 'avatar'],
  },
  {
    id: 'billing',
    label: 'Billing',
    description: 'Payment methods and invoices',
    href: '/settings/billing',
    section: 'Account',
    keywords: ['payment', 'invoice'],
  },
  {
    id: 'api-keys',
    label: 'API keys',
    description: 'Manage API tokens',
    href: '/settings/developers/api-keys',
    section: 'Developers',
    keywords: ['token', 'oauth'],
  },
  {
    id: 'webhooks',
    label: 'Webhooks',
    href: '/settings/developers/webhooks',
    section: 'Developers',
  },
];

function makeServices(): KeyboardServices {
  return {
    registry: new InMemoryKeyboardRegistry(),
    recency: new InMemoryRecencyTracker(),
  };
}

describe('SettingsSearch', () => {
  it('renders all items grouped by section when query is empty', () => {
    render(<SettingsSearch items={ITEMS} onSelect={() => undefined} />);
    const items = document.querySelectorAll('[data-cir-part="settings-search-item"]');
    expect(items.length).toBe(ITEMS.length);
    const sections = Array.from(
      document.querySelectorAll('[data-cir-part="settings-search-section"]'),
    ).map((el) => el.textContent);
    expect(sections).toEqual(['Account', 'Developers']);
  });

  it('groups items under their `section` heading in first-seen order', () => {
    render(<SettingsSearch items={ITEMS} onSelect={() => undefined} />);
    const groups = document.querySelectorAll('[data-cir-part="settings-search-group"]');
    expect(groups.length).toBe(2);
    expect(groups[0]?.getAttribute('data-section')).toBe('Account');
    expect(groups[1]?.getAttribute('data-section')).toBe('Developers');
    // The Account group contains Profile + Billing in source order.
    const accountItems = groups[0]!.querySelectorAll('[data-cir-part="settings-search-item"]');
    expect(accountItems.length).toBe(2);
  });

  it('fuzzy-matches across label, description, and keywords', () => {
    const { rerender } = render(<SettingsSearch items={ITEMS} onSelect={() => undefined} />);
    // label hit
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'api' } });
    let items = document.querySelectorAll('[data-cir-part="settings-search-item"]');
    expect(items.length).toBe(1);
    expect(items[0]?.textContent).toContain('API keys');

    // keyword hit ("invoice" only matches Billing via keywords)
    rerender(<SettingsSearch items={ITEMS} onSelect={() => undefined} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'invoice' } });
    items = document.querySelectorAll('[data-cir-part="settings-search-item"]');
    expect(items.length).toBe(1);
    expect(items[0]?.textContent).toContain('Billing');

    // description hit ("payment methods" → Billing description)
    rerender(<SettingsSearch items={ITEMS} onSelect={() => undefined} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'payment methods' } });
    items = document.querySelectorAll('[data-cir-part="settings-search-item"]');
    expect(items.length).toBe(1);
    expect(items[0]?.textContent).toContain('Billing');
  });

  it('case-insensitive matching', () => {
    render(<SettingsSearch items={ITEMS} onSelect={() => undefined} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'BILLING' } });
    const items = document.querySelectorAll('[data-cir-part="settings-search-item"]');
    expect(items.length).toBe(1);
    expect(items[0]?.textContent).toContain('Billing');
  });

  it('shows the empty message when nothing matches', () => {
    render(<SettingsSearch items={ITEMS} onSelect={() => undefined} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzzz-no-match' } });
    expect(screen.getByText(/No matching settings/i)).toBeTruthy();
  });

  it('ArrowDown / ArrowUp move the highlight across groups', () => {
    render(<SettingsSearch items={ITEMS} onSelect={() => undefined} />);
    const input = screen.getByRole('searchbox');
    let items = document.querySelectorAll('[data-cir-part="settings-search-item"]');
    expect(items[0]?.getAttribute('data-highlighted')).toBe('true');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    items = document.querySelectorAll('[data-cir-part="settings-search-item"]');
    expect(items[1]?.getAttribute('data-highlighted')).toBe('true');

    // Cross a group boundary — third item is in the Developers group.
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    items = document.querySelectorAll('[data-cir-part="settings-search-item"]');
    expect(items[2]?.getAttribute('data-highlighted')).toBe('true');

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    items = document.querySelectorAll('[data-cir-part="settings-search-item"]');
    expect(items[1]?.getAttribute('data-highlighted')).toBe('true');
  });

  it('ArrowDown wraps from last to first', () => {
    render(<SettingsSearch items={ITEMS} onSelect={() => undefined} />);
    const input = screen.getByRole('searchbox');
    for (let i = 0; i < ITEMS.length; i += 1) fireEvent.keyDown(input, { key: 'ArrowDown' });
    const items = document.querySelectorAll('[data-cir-part="settings-search-item"]');
    expect(items[0]?.getAttribute('data-highlighted')).toBe('true');
  });

  it('Enter triggers onSelect with the highlighted item', () => {
    const onSelect = vi.fn();
    render(<SettingsSearch items={ITEMS} onSelect={onSelect} />);
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'ArrowDown' });
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect((onSelect.mock.calls[0]![0] as SettingsItem).id).toBe('billing');
  });

  it('clicking an item triggers onSelect with that item', () => {
    const onSelect = vi.fn();
    render(<SettingsSearch items={ITEMS} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /API keys/i }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect((onSelect.mock.calls[0]![0] as SettingsItem).id).toBe('api-keys');
  });

  it('Escape clears a non-empty query', () => {
    render(<SettingsSearch items={ITEMS} onSelect={() => undefined} />);
    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'billing' } });
    expect(input.value).toBe('billing');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.value).toBe('');
  });

  it('emits data-cir-href on each item for audit tooling', () => {
    render(<SettingsSearch items={ITEMS} onSelect={() => undefined} />);
    const items = document.querySelectorAll('[data-cir-part="settings-search-item"]');
    expect(items[0]?.getAttribute('data-cir-href')).toBe('/settings/profile');
    expect(items[2]?.getAttribute('data-cir-href')).toBe('/settings/developers/api-keys');
  });

  it('binding id matches', () => {
    expect(SettingsSearchBinding.id).toBe('SettingsSearch');
  });

  // -- Variant tests ---------------------------------------------------------
  it('defaults to variant=default and emits data-variant', () => {
    render(<SettingsSearch items={ITEMS} onSelect={() => undefined} />);
    const root = document.querySelector('[data-cir-component="SettingsSearch"]');
    expect(root?.getAttribute('data-variant')).toBe('default');
  });

  it('reflects variant=compact class', () => {
    render(<SettingsSearch items={ITEMS} onSelect={() => undefined} variant="compact" />);
    const root = document.querySelector('[data-cir-component="SettingsSearch"]');
    expect(root?.getAttribute('data-variant')).toBe('compact');
  });

  // -- KeyboardRegistry integration (Wave 11 / Int-3) ------------------------
  describe('KeyboardProvider integration', () => {
    it('registers a settings.search action with the default `/` hotkey', () => {
      const services = makeServices();
      render(
        <KeyboardProvider services={services} disableEventListener>
          <SettingsSearch items={ITEMS} onSelect={() => undefined} />
        </KeyboardProvider>,
      );
      const action = services.registry.list().find((a) => a.id === 'settings.search');
      expect(action).toBeDefined();
      expect(action?.hotkey).toBe('/');
      expect(action?.label).toBe('Search settings');
    });

    it('settings.search action focuses the input on invoke', () => {
      const services = makeServices();
      render(
        <KeyboardProvider services={services} disableEventListener>
          <SettingsSearch items={ITEMS} onSelect={() => undefined} />
        </KeyboardProvider>,
      );
      const action = services.registry.list().find((a) => a.id === 'settings.search');
      expect(action).toBeDefined();
      const input = screen.getByRole('searchbox');
      expect(document.activeElement).not.toBe(input);
      void action?.invoke();
      expect(document.activeElement).toBe(input);
    });

    it('respects a custom hotkey', () => {
      const services = makeServices();
      render(
        <KeyboardProvider services={services} disableEventListener>
          <SettingsSearch items={ITEMS} onSelect={() => undefined} hotkey="cmd+/" />
        </KeyboardProvider>,
      );
      const action = services.registry.list().find((a) => a.id === 'settings.search');
      expect(action?.hotkey).toBe('cmd+/');
    });

    it('does NOT register when hotkey={null}', () => {
      const services = makeServices();
      render(
        <KeyboardProvider services={services} disableEventListener>
          <SettingsSearch items={ITEMS} onSelect={() => undefined} hotkey={null} />
        </KeyboardProvider>,
      );
      expect(services.registry.list().some((a) => a.id === 'settings.search')).toBe(false);
    });

    it('unregisters on unmount', () => {
      const services = makeServices();
      const { unmount } = render(
        <KeyboardProvider services={services} disableEventListener>
          <SettingsSearch items={ITEMS} onSelect={() => undefined} />
        </KeyboardProvider>,
      );
      expect(services.registry.list().some((a) => a.id === 'settings.search')).toBe(true);
      unmount();
      expect(services.registry.list().some((a) => a.id === 'settings.search')).toBe(false);
    });

    it('renders without a provider in scope (graceful fallback)', () => {
      // No KeyboardProvider — component still works, just no hotkey wired.
      render(<SettingsSearch items={ITEMS} onSelect={() => undefined} />);
      expect(screen.getByRole('searchbox')).toBeTruthy();
    });
  });
});
