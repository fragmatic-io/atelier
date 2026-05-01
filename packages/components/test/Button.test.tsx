// @vitest-environment happy-dom
import './setup.js';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Button, ButtonBinding } from '../src/components/Button.js';

describe('Button', () => {
  it('renders children inside a button element with default type=button', () => {
    render(<Button>Click me</Button>);
    const btn = screen.getByRole('button', { name: 'Click me' });
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.getAttribute('type')).toBe('button');
  });
  it('defaults to primary variant via data-variant', () => {
    render(<Button>x</Button>);
    expect(screen.getByRole('button').getAttribute('data-variant')).toBe('primary');
  });
  it('reflects each variant on data-variant', () => {
    for (const variant of ['primary', 'secondary', 'destructive', 'ghost', 'outline'] as const) {
      const { unmount } = render(<Button variant={variant}>x</Button>);
      expect(screen.getByRole('button').getAttribute('data-variant')).toBe(variant);
      unmount();
    }
  });
  it('applies the variant utility class for non-default variants', () => {
    render(<Button variant="destructive">x</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('bg-red-600');
    expect(btn.className).toContain('text-white');
  });
  it('applies the outline variant utility class', () => {
    render(<Button variant="outline">x</Button>);
    expect(screen.getByRole('button').className).toContain('border');
  });
  it('defaults to size=md and emits data-size + class', () => {
    render(<Button>x</Button>);
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('data-size')).toBe('md');
    expect(btn.className).toContain('text-base');
  });
  it('reflects size=sm and size=lg on data-size + class', () => {
    const { rerender } = render(<Button size="sm">x</Button>);
    expect(screen.getByRole('button').getAttribute('data-size')).toBe('sm');
    expect(screen.getByRole('button').className).toContain('text-sm');
    rerender(<Button size="lg">x</Button>);
    expect(screen.getByRole('button').getAttribute('data-size')).toBe('lg');
    expect(screen.getByRole('button').className).toContain('text-lg');
  });
  it('combines variant + size classes together', () => {
    render(
      <Button variant="ghost" size="lg">
        x
      </Button>,
    );
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('bg-transparent');
    expect(btn.className).toContain('text-lg');
  });
  it('appends a user className on top of variant classes', () => {
    render(<Button className="my-extra">x</Button>);
    expect(screen.getByRole('button').className).toContain('my-extra');
    expect(screen.getByRole('button').className).toContain('bg-blue-600');
  });
  it('fires onClick when clicked', () => {
    const fn = vi.fn();
    render(<Button onClick={fn}>x</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it('does not fire onClick when disabled', () => {
    const fn = vi.fn();
    render(
      <Button onClick={fn} disabled>
        x
      </Button>,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(fn).not.toHaveBeenCalled();
  });
  it('forwards ref to the underlying button', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>x</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });
  it('binding id matches', () => {
    expect(ButtonBinding.id).toBe('Button');
  });
  it('binding declares actionSlots: [onPrimaryAction]', () => {
    expect(ButtonBinding.actionSlots).toEqual(['onPrimaryAction']);
  });
  it('wires onPrimaryAction to onClick when no explicit onClick is set', () => {
    const fn = vi.fn();
    render(<Button onPrimaryAction={fn}>x</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it('explicit onClick wins over onPrimaryAction', () => {
    const click = vi.fn();
    const action = vi.fn();
    render(
      <Button onClick={click} onPrimaryAction={action}>
        x
      </Button>,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(click).toHaveBeenCalledTimes(1);
    expect(action).not.toHaveBeenCalled();
  });
});
