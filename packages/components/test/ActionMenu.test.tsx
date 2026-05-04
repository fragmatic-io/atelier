// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ActionMenu, ActionMenuBinding } from '../src/components/ActionMenu.js';

describe('ActionMenu', () => {
  it('renders the trigger and toggles the menu open/close', () => {
    const onSelect = vi.fn();
    render(<ActionMenu trigger="•••" items={[{ id: 'a', label: 'Edit', onSelect }]} />);
    const trigger = screen.getByRole('button', { name: '•••' });
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.pointerDown(trigger);
    expect(screen.getByRole('menu')).toBeTruthy();
    fireEvent.pointerDown(trigger);
    expect(screen.queryByRole('menu')).toBeNull();
  });
  it('fires onSelect and closes the menu', () => {
    const onSelect = vi.fn();
    render(<ActionMenu trigger="t" items={[{ id: 'a', label: 'Edit', onSelect }]} />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 't' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });
  it('binding id matches', () => {
    expect(ActionMenuBinding.id).toBe('ActionMenu');
  });
  // -- Wave 6 / P-10 variant assertions --
  it('defaults to variant=secondary and size=md', () => {
    render(<ActionMenu trigger="t" items={[]} />);
    const root = document.querySelector('[data-cir-component="ActionMenu"]') as HTMLElement;
    expect(root.getAttribute('data-variant')).toBe('secondary');
    expect(root.getAttribute('data-size')).toBe('md');
  });
  it('reflects each variant on data-variant', () => {
    for (const v of ['primary', 'secondary', 'ghost', 'outline', 'destructive'] as const) {
      const { unmount } = render(<ActionMenu trigger="t" items={[]} variant={v} />);
      const root = document.querySelector('[data-cir-component="ActionMenu"]') as HTMLElement;
      expect(root.getAttribute('data-variant')).toBe(v);
      unmount();
    }
  });
  it('applies the primary variant class', () => {
    render(<ActionMenu trigger="t" items={[]} variant="primary" />);
    const root = document.querySelector('[data-cir-component="ActionMenu"]') as HTMLElement;
    expect(root.className).toContain('bg-blue-600');
  });
});
