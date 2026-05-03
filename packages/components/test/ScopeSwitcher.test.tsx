// @vitest-environment happy-dom
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import './setup.js';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import {
  InMemoryKeyboardRegistry,
  InMemoryRecencyTracker,
  type KeyboardServices,
} from '@atelier/keyboard';
import {
  ScopeSwitcher,
  ScopeSwitcherBinding,
  scopeSwitcherTextRender,
  type ScopeOption,
} from '../src/components/ScopeSwitcher.js';
import { KeyboardProvider } from '../src/keyboard/index.js';

const OPTIONS: readonly ScopeOption[] = [
  {
    id: 'workspace-acme',
    label: 'Acme',
    description: 'Default workspace',
    group: 'Workspaces',
  },
  {
    id: 'workspace-personal',
    label: 'Personal',
    group: 'Workspaces',
  },
  {
    id: 'team-platform',
    label: 'Platform',
    description: 'Backend team',
    group: 'Teams',
  },
  {
    id: 'project-aurora',
    label: 'Aurora',
    description: 'Decision queue app',
    group: 'Projects',
  },
];

function makeServices(): KeyboardServices {
  return {
    registry: new InMemoryKeyboardRegistry(),
    recency: new InMemoryRecencyTracker(),
  };
}

describe('ScopeSwitcher', () => {
  it('renders the trigger with the active scope label', () => {
    render(<ScopeSwitcher options={OPTIONS} value="workspace-acme" onChange={() => undefined} />);
    const trigger = screen.getByRole('button', { name: /switch scope/i });
    expect(trigger.textContent).toContain('Acme');
  });

  it('falls back to the raw value in the trigger when value is unknown', () => {
    render(<ScopeSwitcher options={OPTIONS} value="missing-id" onChange={() => undefined} />);
    const trigger = screen.getByRole('button', { name: /switch scope/i });
    expect(trigger.textContent).toContain('missing-id');
  });

  it('the popover is closed by default and trigger reports aria-expanded=false', () => {
    render(<ScopeSwitcher options={OPTIONS} value="workspace-acme" onChange={() => undefined} />);
    const trigger = screen.getByRole('button', { name: /switch scope/i });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('[data-cir-part="scope-popover"]')).toBeNull();
  });

  it('clicking the trigger opens the popover', () => {
    render(<ScopeSwitcher options={OPTIONS} value="workspace-acme" onChange={() => undefined} />);
    const trigger = screen.getByRole('button', { name: /switch scope/i });
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelector('[data-cir-part="scope-popover"]')).not.toBeNull();
  });

  it('renders all options grouped by their `group` heading in first-seen order', () => {
    render(<ScopeSwitcher options={OPTIONS} value="workspace-acme" onChange={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /switch scope/i }));
    const groups = document.querySelectorAll('[data-cir-part="scope-group"]');
    expect(groups.length).toBe(3);
    const headings = Array.from(
      document.querySelectorAll('[data-cir-part="scope-group-heading"]'),
    ).map((el) => el.textContent);
    expect(headings).toEqual(['Workspaces', 'Teams', 'Projects']);
  });

  it('marks the currently-active option with data-selected="true"', () => {
    render(<ScopeSwitcher options={OPTIONS} value="team-platform" onChange={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /switch scope/i }));
    const items = document.querySelectorAll('[data-cir-part="scope-option"]');
    const selectedIds = Array.from(items)
      .filter((el) => el.getAttribute('data-selected') === 'true')
      .map((el) => el.getAttribute('data-scope-id'));
    expect(selectedIds).toEqual(['team-platform']);
  });

  it('fuzzy-matches across label, description, and group', () => {
    render(<ScopeSwitcher options={OPTIONS} value="workspace-acme" onChange={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /switch scope/i }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'aurora' } });
    let items = document.querySelectorAll('[data-cir-part="scope-option"]');
    expect(items.length).toBe(1);
    expect(items[0]?.textContent).toContain('Aurora');

    // Description hit ("backend team" → Platform)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'backend' } });
    items = document.querySelectorAll('[data-cir-part="scope-option"]');
    expect(items.length).toBe(1);
    expect(items[0]?.textContent).toContain('Platform');

    // Group hit ("workspaces" → both Workspaces options)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'workspaces' } });
    items = document.querySelectorAll('[data-cir-part="scope-option"]');
    expect(items.length).toBe(2);
  });

  it('case-insensitive matching', () => {
    render(<ScopeSwitcher options={OPTIONS} value="workspace-acme" onChange={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /switch scope/i }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'AURORA' } });
    const items = document.querySelectorAll('[data-cir-part="scope-option"]');
    expect(items.length).toBe(1);
    expect(items[0]?.textContent).toContain('Aurora');
  });

  it('shows the empty message when nothing matches', () => {
    render(<ScopeSwitcher options={OPTIONS} value="workspace-acme" onChange={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /switch scope/i }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzzz-no-match' } });
    expect(screen.getByText(/No matching scopes/i)).toBeTruthy();
  });

  it('ArrowDown / ArrowUp move the highlight across groups', () => {
    render(<ScopeSwitcher options={OPTIONS} value="workspace-acme" onChange={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /switch scope/i }));
    const input = screen.getByRole('searchbox');
    let items = document.querySelectorAll('[data-cir-part="scope-option"]');
    expect(items[0]?.getAttribute('data-highlighted')).toBe('true');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    items = document.querySelectorAll('[data-cir-part="scope-option"]');
    expect(items[1]?.getAttribute('data-highlighted')).toBe('true');

    // Cross a group boundary — third item is the first in the Teams group.
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    items = document.querySelectorAll('[data-cir-part="scope-option"]');
    expect(items[2]?.getAttribute('data-highlighted')).toBe('true');

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    items = document.querySelectorAll('[data-cir-part="scope-option"]');
    expect(items[1]?.getAttribute('data-highlighted')).toBe('true');
  });

  it('ArrowDown wraps from last to first', () => {
    render(<ScopeSwitcher options={OPTIONS} value="workspace-acme" onChange={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /switch scope/i }));
    const input = screen.getByRole('searchbox');
    for (let i = 0; i < OPTIONS.length; i += 1) fireEvent.keyDown(input, { key: 'ArrowDown' });
    const items = document.querySelectorAll('[data-cir-part="scope-option"]');
    expect(items[0]?.getAttribute('data-highlighted')).toBe('true');
  });

  it('Enter triggers onChange with the highlighted option id and closes the popover', () => {
    const onChange = vi.fn();
    render(<ScopeSwitcher options={OPTIONS} value="workspace-acme" onChange={onChange} />);
    const trigger = screen.getByRole('button', { name: /switch scope/i });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'ArrowDown' });
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Enter' });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0]).toBe('workspace-personal');
    // Popover closed.
    expect(document.querySelector('[data-cir-part="scope-popover"]')).toBeNull();
  });

  it('clicking an option triggers onChange with that id and closes the popover', () => {
    const onChange = vi.fn();
    render(<ScopeSwitcher options={OPTIONS} value="workspace-acme" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /switch scope/i }));
    fireEvent.click(screen.getByRole('button', { name: /Aurora/i }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0]).toBe('project-aurora');
    expect(document.querySelector('[data-cir-part="scope-popover"]')).toBeNull();
  });

  it('Escape closes the popover', () => {
    render(<ScopeSwitcher options={OPTIONS} value="workspace-acme" onChange={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /switch scope/i }));
    expect(document.querySelector('[data-cir-part="scope-popover"]')).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.querySelector('[data-cir-part="scope-popover"]')).toBeNull();
  });

  it('emits data-active-scope on the root for audit tooling', () => {
    render(<ScopeSwitcher options={OPTIONS} value="team-platform" onChange={() => undefined} />);
    const root = document.querySelector('[data-cir-component="ScopeSwitcher"]');
    expect(root?.getAttribute('data-active-scope')).toBe('team-platform');
  });

  it('binding id matches', () => {
    expect(ScopeSwitcherBinding.id).toBe('ScopeSwitcher');
  });

  it('text renderer shows the active label and option count', () => {
    const out = scopeSwitcherTextRender({
      options: OPTIONS,
      value: 'team-platform',
      onChange: () => undefined,
    });
    expect(out).toBe('[ScopeSwitcher: Platform (4 scopes)]');
  });

  // -- Variant tests ---------------------------------------------------------
  it('defaults to variant=default and emits data-variant', () => {
    render(<ScopeSwitcher options={OPTIONS} value="workspace-acme" onChange={() => undefined} />);
    const root = document.querySelector('[data-cir-component="ScopeSwitcher"]');
    expect(root?.getAttribute('data-variant')).toBe('default');
  });

  it('reflects variant=compact', () => {
    render(
      <ScopeSwitcher
        options={OPTIONS}
        value="workspace-acme"
        onChange={() => undefined}
        variant="compact"
      />,
    );
    const root = document.querySelector('[data-cir-component="ScopeSwitcher"]');
    expect(root?.getAttribute('data-variant')).toBe('compact');
  });

  // -- KeyboardRegistry integration (Wave 11 / Int-3) ------------------------
  describe('KeyboardProvider integration', () => {
    it('registers a scope.switcher action with the default cmd+shift+o hotkey', () => {
      const services = makeServices();
      render(
        <KeyboardProvider services={services} disableEventListener>
          <ScopeSwitcher options={OPTIONS} value="workspace-acme" onChange={() => undefined} />
        </KeyboardProvider>,
      );
      const action = services.registry.list().find((a) => a.id === 'scope.switcher');
      expect(action).toBeDefined();
      expect(action?.hotkey).toBe('cmd+shift+o');
      expect(action?.label).toBe('Switch scope');
    });

    it('scope.switcher action opens the popover on invoke', () => {
      const services = makeServices();
      render(
        <KeyboardProvider services={services} disableEventListener>
          <ScopeSwitcher options={OPTIONS} value="workspace-acme" onChange={() => undefined} />
        </KeyboardProvider>,
      );
      expect(document.querySelector('[data-cir-part="scope-popover"]')).toBeNull();
      const action = services.registry.list().find((a) => a.id === 'scope.switcher');
      act(() => {
        void action?.invoke();
      });
      expect(document.querySelector('[data-cir-part="scope-popover"]')).not.toBeNull();
    });

    it('respects a custom hotkey', () => {
      const services = makeServices();
      render(
        <KeyboardProvider services={services} disableEventListener>
          <ScopeSwitcher
            options={OPTIONS}
            value="workspace-acme"
            onChange={() => undefined}
            hotkey="cmd+shift+w"
          />
        </KeyboardProvider>,
      );
      const action = services.registry.list().find((a) => a.id === 'scope.switcher');
      expect(action?.hotkey).toBe('cmd+shift+w');
    });

    it('does NOT register when hotkey={null}', () => {
      const services = makeServices();
      render(
        <KeyboardProvider services={services} disableEventListener>
          <ScopeSwitcher
            options={OPTIONS}
            value="workspace-acme"
            onChange={() => undefined}
            hotkey={null}
          />
        </KeyboardProvider>,
      );
      expect(services.registry.list().some((a) => a.id === 'scope.switcher')).toBe(false);
    });

    it('unregisters on unmount', () => {
      const services = makeServices();
      const { unmount } = render(
        <KeyboardProvider services={services} disableEventListener>
          <ScopeSwitcher options={OPTIONS} value="workspace-acme" onChange={() => undefined} />
        </KeyboardProvider>,
      );
      expect(services.registry.list().some((a) => a.id === 'scope.switcher')).toBe(true);
      unmount();
      expect(services.registry.list().some((a) => a.id === 'scope.switcher')).toBe(false);
    });

    it('renders without a provider in scope (graceful fallback)', () => {
      render(<ScopeSwitcher options={OPTIONS} value="workspace-acme" onChange={() => undefined} />);
      expect(screen.getByRole('button', { name: /switch scope/i })).toBeTruthy();
    });
  });
});
