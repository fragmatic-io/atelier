// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  InMemoryKeyboardRegistry,
  InMemoryRecencyTracker,
  type KeyboardServices,
} from '@atelier/keyboard';
import { CommandPalette, CommandPaletteBinding } from '../src/components/CommandPalette.js';
import { KeyboardProvider } from '../src/keyboard/index.js';

const COMMANDS = [
  { id: 'new', label: 'New file', group: 'File', onSelect: vi.fn() },
  { id: 'open', label: 'Open file', group: 'File', keywords: ['load'], onSelect: vi.fn() },
  { id: 'theme', label: 'Toggle theme', group: 'View', onSelect: vi.fn() },
];

describe('CommandPalette', () => {
  it('renders nothing visible when closed', () => {
    render(<CommandPalette open={false} commands={COMMANDS} onClose={() => undefined} />);
    expect(document.querySelector('[data-cir-component="CommandPalette"]')).toBeNull();
  });

  it('shows all commands when open with empty query', () => {
    render(<CommandPalette open commands={COMMANDS} onClose={() => undefined} />);
    expect(document.querySelectorAll('[data-cir-part="palette-item"]').length).toBe(
      COMMANDS.length,
    );
  });

  it('filters by label substring (case-insensitive)', () => {
    render(<CommandPalette open commands={COMMANDS} onClose={() => undefined} />);
    fireEvent.change(screen.getByLabelText('Command'), { target: { value: 'theme' } });
    const items = document.querySelectorAll('[data-cir-part="palette-item"]');
    expect(items.length).toBe(1);
    expect(items[0]?.textContent).toContain('Toggle theme');
  });

  it('filters by keyword as well', () => {
    render(<CommandPalette open commands={COMMANDS} onClose={() => undefined} />);
    fireEvent.change(screen.getByLabelText('Command'), { target: { value: 'load' } });
    const items = document.querySelectorAll('[data-cir-part="palette-item"]');
    expect(items.length).toBe(1);
    expect(items[0]?.textContent).toContain('Open file');
  });

  it('shows an empty message when no command matches', () => {
    render(<CommandPalette open commands={COMMANDS} onClose={() => undefined} />);
    fireEvent.change(screen.getByLabelText('Command'), { target: { value: 'zzz' } });
    expect(screen.getByText(/No matching commands/i)).toBeTruthy();
  });

  it('ArrowDown / ArrowUp move the highlight', () => {
    render(<CommandPalette open commands={COMMANDS} onClose={() => undefined} />);
    const input = screen.getByLabelText('Command');
    let items = document.querySelectorAll('[data-cir-part="palette-item"]');
    expect(items[0]?.getAttribute('data-highlighted')).toBe('true');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    items = document.querySelectorAll('[data-cir-part="palette-item"]');
    expect(items[1]?.getAttribute('data-highlighted')).toBe('true');
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    items = document.querySelectorAll('[data-cir-part="palette-item"]');
    expect(items[0]?.getAttribute('data-highlighted')).toBe('true');
  });

  it('ArrowDown wraps from last to first', () => {
    render(<CommandPalette open commands={COMMANDS} onClose={() => undefined} />);
    const input = screen.getByLabelText('Command');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const items = document.querySelectorAll('[data-cir-part="palette-item"]');
    expect(items[0]?.getAttribute('data-highlighted')).toBe('true');
  });

  it('Enter triggers the highlighted command and closes', () => {
    const onClose = vi.fn();
    const onSelect = vi.fn();
    const cmds = [{ id: 'go', label: 'Go', onSelect }];
    render(<CommandPalette open commands={cmds} onClose={onClose} />);
    fireEvent.keyDown(screen.getByLabelText('Command'), { key: 'Enter' });
    expect(onSelect).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('clicking an item triggers it and closes', () => {
    const onClose = vi.fn();
    const onSelect = vi.fn();
    const cmds = [{ id: 'go', label: 'Go', onSelect }];
    render(<CommandPalette open commands={cmds} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /Go/i }));
    expect(onSelect).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('Escape (cancel event) calls onClose', () => {
    const onClose = vi.fn();
    render(<CommandPalette open commands={COMMANDS} onClose={onClose} />);
    const dlg = document.querySelector('dialog')!;
    dlg.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('toggles the dialog surface on the open prop', () => {
    const { rerender } = render(
      <CommandPalette open={false} commands={COMMANDS} onClose={() => undefined} />,
    );
    expect(document.querySelector('[data-cir-component="CommandPalette"]')).toBeNull();
    rerender(<CommandPalette open commands={COMMANDS} onClose={() => undefined} />);
    expect(document.querySelector('[data-cir-component="CommandPalette"]')).not.toBeNull();
    rerender(<CommandPalette open={false} commands={COMMANDS} onClose={() => undefined} />);
    expect(document.querySelector('[data-cir-component="CommandPalette"]')).toBeNull();
  });

  it('binding id matches', () => {
    expect(CommandPaletteBinding.id).toBe('CommandPalette');
  });

  // -- Vis-4 variant tests ---------------------------------------------------
  it('defaults to variant=default and emits data-variant', () => {
    render(<CommandPalette open commands={COMMANDS} onClose={() => undefined} />);
    const dlg = document.querySelector('[data-cir-component="CommandPalette"]');
    expect(dlg?.getAttribute('data-variant')).toBe('default');
    expect(dlg?.className).toContain('w-[480px]');
  });
  it('reflects variant=compact class', () => {
    render(<CommandPalette open commands={COMMANDS} onClose={() => undefined} variant="compact" />);
    const dlg = document.querySelector('[data-cir-component="CommandPalette"]');
    expect(dlg?.getAttribute('data-variant')).toBe('compact');
    expect(dlg?.className).toContain('w-[320px]');
  });

  // -- Wave 11 / Int-3 — registry auto-discovery + hotkey chip + recency ----
  describe('registry auto-discovery', () => {
    function makeServices(): KeyboardServices {
      return {
        registry: new InMemoryKeyboardRegistry(),
        recency: new InMemoryRecencyTracker(),
      };
    }

    it('emits data-cir-source="prop" when commands are passed explicitly', () => {
      render(<CommandPalette open commands={COMMANDS} onClose={() => undefined} />);
      const dlg = document.querySelector('[data-cir-component="CommandPalette"]');
      expect(dlg?.getAttribute('data-cir-source')).toBe('prop');
    });

    it('emits data-cir-source="registry" when discovering from a provider', () => {
      const services = makeServices();
      services.registry.register({
        id: 'thread.archive',
        label: 'Archive thread',
        invoke: vi.fn(),
      });
      render(
        <KeyboardProvider services={services} disableEventListener>
          <CommandPalette open onClose={() => undefined} />
        </KeyboardProvider>,
      );
      const dlg = document.querySelector('[data-cir-component="CommandPalette"]');
      expect(dlg?.getAttribute('data-cir-source')).toBe('registry');
    });

    it('lists every registered action as a command', () => {
      const services = makeServices();
      services.registry.register({ id: 'a', label: 'Alpha', invoke: vi.fn() });
      services.registry.register({ id: 'b', label: 'Bravo', invoke: vi.fn() });
      services.registry.register({ id: 'c', label: 'Charlie', invoke: vi.fn() });
      render(
        <KeyboardProvider services={services} disableEventListener>
          <CommandPalette open onClose={() => undefined} />
        </KeyboardProvider>,
      );
      const items = document.querySelectorAll('[data-cir-part="palette-item"]');
      expect(items.length).toBe(3);
    });

    it('hides the auto-registered palette.open action from itself', () => {
      const services = makeServices();
      services.registry.register({
        id: 'thread.archive',
        label: 'Archive',
        invoke: vi.fn(),
      });
      render(
        <KeyboardProvider services={services} disableEventListener>
          <CommandPalette open onClose={() => undefined} onOpen={() => undefined} />
        </KeyboardProvider>,
      );
      const labels = Array.from(
        document.querySelectorAll('[data-cir-part="palette-label-text"]'),
      ).map((el) => el.textContent);
      expect(labels).toContain('Archive');
      expect(labels.some((l) => l?.includes('command palette'))).toBe(false);
    });

    it('renders a hotkey chip when the action declares one', () => {
      const services = makeServices();
      services.registry.register({
        id: 'thread.archive',
        label: 'Archive',
        hotkey: 'cmd+e',
        invoke: vi.fn(),
      });
      render(
        <KeyboardProvider services={services} disableEventListener>
          <CommandPalette open onClose={() => undefined} platform="mac" />
        </KeyboardProvider>,
      );
      const chip = document.querySelector('[data-cir-part="palette-hotkey"]');
      expect(chip?.textContent).toBe('⌘E');
    });

    it('renders a hotkey chip in Ctrl+ form on non-mac', () => {
      const services = makeServices();
      services.registry.register({
        id: 'thread.archive',
        label: 'Archive',
        hotkey: 'cmd+e',
        invoke: vi.fn(),
      });
      render(
        <KeyboardProvider services={services} disableEventListener>
          <CommandPalette open onClose={() => undefined} platform="other" />
        </KeyboardProvider>,
      );
      const chip = document.querySelector('[data-cir-part="palette-hotkey"]');
      expect(chip?.textContent).toBe('Ctrl+E');
    });

    it('clicking an auto-discovered command invokes the registered action', () => {
      const services = makeServices();
      const invoke = vi.fn();
      services.registry.register({
        id: 'thread.archive',
        label: 'Archive thread',
        invoke,
      });
      const onClose = vi.fn();
      render(
        <KeyboardProvider services={services} disableEventListener>
          <CommandPalette open onClose={onClose} />
        </KeyboardProvider>,
      );
      fireEvent.click(screen.getByRole('button', { name: /Archive thread/i }));
      expect(invoke).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('bumps recency when an auto-discovered action is invoked', () => {
      const services = makeServices();
      services.registry.register({ id: 'a', label: 'Alpha', invoke: vi.fn() });
      services.registry.register({ id: 'b', label: 'Bravo', invoke: vi.fn() });
      render(
        <KeyboardProvider services={services} disableEventListener>
          <CommandPalette open onClose={() => undefined} />
        </KeyboardProvider>,
      );
      // Pre-bump: both have weight 0.
      expect(services.recency!.weight('a')).toBe(0);
      fireEvent.click(screen.getByRole('button', { name: /Alpha/i }));
      // Bump fires before the dialog closes; weight is now ~1.
      expect(services.recency!.weight('a')).toBeGreaterThan(0.99);
      expect(services.recency!.weight('b')).toBe(0);
    });

    it('registers a palette.open hotkey action when onOpen is supplied', () => {
      const services = makeServices();
      const onOpen = vi.fn();
      const { unmount } = render(
        <KeyboardProvider services={services} disableEventListener>
          <CommandPalette open={false} onClose={() => undefined} onOpen={onOpen} />
        </KeyboardProvider>,
      );
      const palette = services.registry.list().find((a) => a.id === 'palette.open');
      expect(palette).toBeDefined();
      expect(palette?.hotkey).toBe('cmd+k');
      const resolved = services.registry.resolve(
        { key: 'k', metaKey: true, ctrlKey: false, shiftKey: false, altKey: false },
        'mac',
      );
      expect(resolved?.id).toBe('palette.open');
      void resolved?.invoke();
      expect(onOpen).toHaveBeenCalled();
      unmount();
      expect(services.registry.list().some((a) => a.id === 'palette.open')).toBe(false);
    });

    it('does NOT register palette.open when bindOpenHotkey={false}', () => {
      const services = makeServices();
      render(
        <KeyboardProvider services={services} disableEventListener>
          <CommandPalette
            open={false}
            onClose={() => undefined}
            onOpen={() => undefined}
            bindOpenHotkey={false}
          />
        </KeyboardProvider>,
      );
      expect(services.registry.list().some((a) => a.id === 'palette.open')).toBe(false);
    });

    it('weights recently-bumped actions higher in the rank order', () => {
      const services = makeServices();
      services.registry.register({ id: 'older', label: 'older alpha', invoke: vi.fn() });
      services.registry.register({ id: 'recent', label: 'recent alpha', invoke: vi.fn() });
      services.recency!.bump('recent');
      render(
        <KeyboardProvider services={services} disableEventListener>
          <CommandPalette open onClose={() => undefined} />
        </KeyboardProvider>,
      );
      fireEvent.change(screen.getByLabelText('Command'), { target: { value: 'alpha' } });
      const items = document.querySelectorAll('[data-cir-part="palette-item"]');
      expect(items[0]?.textContent).toContain('recent alpha');
      expect(items[1]?.textContent).toContain('older alpha');
    });

    it('renders an icon slot when the action declares one', () => {
      const services = makeServices();
      services.registry.register({
        id: 'thread.archive',
        label: 'Archive',
        icon: 'archive',
        invoke: vi.fn(),
      });
      render(
        <KeyboardProvider services={services} disableEventListener>
          <CommandPalette open onClose={() => undefined} />
        </KeyboardProvider>,
      );
      const iconSlot = document.querySelector('[data-cir-part="palette-icon"]');
      expect(iconSlot).not.toBeNull();
      const icon = iconSlot?.querySelector('[data-cir-component="Icon"]');
      expect(icon?.getAttribute('data-icon-set')).toBe('lucide');
      expect(icon?.getAttribute('data-icon-name')).toBe('archive');
    });

    it('falls through to an empty list when no provider is in scope and no commands are passed', () => {
      render(<CommandPalette open onClose={() => undefined} />);
      const empty = document.querySelector('[data-cir-part="palette-empty"]');
      expect(empty).not.toBeNull();
    });
  });
});
