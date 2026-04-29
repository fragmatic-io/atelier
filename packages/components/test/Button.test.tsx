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
    for (const variant of ['primary', 'secondary', 'destructive', 'ghost'] as const) {
      const { unmount } = render(<Button variant={variant}>x</Button>);
      expect(screen.getByRole('button').getAttribute('data-variant')).toBe(variant);
      unmount();
    }
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
});
