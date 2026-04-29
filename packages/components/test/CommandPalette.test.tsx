// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CommandPalette, CommandPaletteBinding } from '../src/components/CommandPalette.js';

const COMMANDS = [
  { id: 'new', label: 'New file', group: 'File', onSelect: vi.fn() },
  { id: 'open', label: 'Open file', group: 'File', keywords: ['load'], onSelect: vi.fn() },
  { id: 'theme', label: 'Toggle theme', group: 'View', onSelect: vi.fn() },
];

describe('CommandPalette', () => {
  it('renders nothing visible when closed (dialog has no open attr)', () => {
    render(<CommandPalette open={false} commands={COMMANDS} onClose={() => undefined} />);
    expect(document.querySelector('dialog')?.hasAttribute('open')).toBe(false);
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

  it('toggles the dialog open attribute on the open prop', () => {
    const { rerender } = render(
      <CommandPalette open={false} commands={COMMANDS} onClose={() => undefined} />,
    );
    const dlg = document.querySelector('dialog')!;
    expect(dlg.hasAttribute('open')).toBe(false);
    rerender(<CommandPalette open commands={COMMANDS} onClose={() => undefined} />);
    expect(dlg.hasAttribute('open')).toBe(true);
    rerender(<CommandPalette open={false} commands={COMMANDS} onClose={() => undefined} />);
    expect(dlg.hasAttribute('open')).toBe(false);
  });

  it('binding id matches', () => {
    expect(CommandPaletteBinding.id).toBe('CommandPalette');
  });
});
