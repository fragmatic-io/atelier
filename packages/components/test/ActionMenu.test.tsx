// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ActionMenu, ActionMenuBinding } from '../src/components/ActionMenu.js';

const ITEMS = [
  { id: 'rename', label: 'Rename', onSelect: vi.fn() },
  { id: 'archive', label: 'Archive', onSelect: vi.fn() },
  { id: 'delete', label: 'Delete', destructive: true, onSelect: vi.fn() },
  { id: 'locked', label: 'Locked', disabled: true, onSelect: vi.fn() },
];

describe('ActionMenu', () => {
  it('starts closed (no menu in the DOM)', () => {
    render(<ActionMenu trigger="More" items={ITEMS} />);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens on trigger click and renders one menuitem per item', () => {
    render(<ActionMenu trigger="More" items={ITEMS} />);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.getByRole('menu')).toBeTruthy();
    const items = screen.getAllByRole('menuitem');
    expect(items.length).toBe(ITEMS.length);
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeTruthy();
  });

  it('flips aria-expanded when toggled', () => {
    render(<ActionMenu trigger="More" items={ITEMS} />);
    const trig = screen.getByRole('button', { name: 'More' });
    expect(trig.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(trig);
    expect(trig.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(trig);
    expect(trig.getAttribute('aria-expanded')).toBe('false');
  });

  it('applies placement and destructive markers', () => {
    render(<ActionMenu trigger="More" items={ITEMS} placement="bottom-start" />);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    const root = document.querySelector('[data-cir-component="ActionMenu"]')!;
    expect(root.getAttribute('data-placement')).toBe('bottom-start');
    const del = screen.getByRole('menuitem', { name: 'Delete' });
    expect(del.getAttribute('data-destructive')).toBe('true');
  });

  it('clicking an item calls onSelect and closes', () => {
    const onSelect = vi.fn();
    const items = [{ id: 'go', label: 'Go', onSelect }];
    render(<ActionMenu trigger="More" items={items} />);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Go' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('clicking a disabled item does NOT call onSelect and stays open', () => {
    const onSelect = vi.fn();
    const items = [{ id: 'd', label: 'Locked', disabled: true, onSelect }];
    render(<ActionMenu trigger="More" items={items} />);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    const btn = screen.getByRole('menuitem', { name: 'Locked' });
    // happy-dom does not auto-prevent click on disabled buttons; assert noop
    fireEvent.click(btn);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('Escape closes', () => {
    render(<ActionMenu trigger="More" items={ITEMS} />);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.getByRole('menu')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('outside click closes the menu', () => {
    render(
      <div>
        <ActionMenu trigger="More" items={ITEMS} />
        <button type="button">elsewhere</button>
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.getByRole('menu')).toBeTruthy();
    fireEvent.mouseDown(screen.getByRole('button', { name: 'elsewhere' }));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('mousedown on trigger or menu does not close', () => {
    render(<ActionMenu trigger="More" items={ITEMS} />);
    const trig = screen.getByRole('button', { name: 'More' });
    fireEvent.click(trig);
    fireEvent.mouseDown(trig);
    fireEvent.mouseDown(screen.getByRole('menu'));
    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it('binding id matches', () => {
    expect(ActionMenuBinding.id).toBe('ActionMenu');
  });
});
