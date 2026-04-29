// @vitest-environment happy-dom
import './setup.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Toast, ToastBinding } from '../src/components/Toast.js';

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when closed', () => {
    const { container } = render(<Toast open={false} message="hi" onClose={() => undefined} />);
    expect(container.querySelector('[data-cir-component="Toast"]')).toBeNull();
  });

  it('renders the message when open', () => {
    render(<Toast open message="Saved" onClose={() => undefined} />);
    expect(screen.getByText('Saved')).toBeTruthy();
  });

  it('uses role=status for info severity', () => {
    render(<Toast open message="hi" onClose={() => undefined} />);
    expect(screen.getByRole('status').getAttribute('data-severity')).toBe('info');
  });

  it('uses role=alert for error severity', () => {
    render(<Toast open severity="error" message="oops" onClose={() => undefined} />);
    expect(screen.getByRole('alert').getAttribute('data-severity')).toBe('error');
  });

  it('uses role=alert for warning severity', () => {
    render(<Toast open severity="warning" message="careful" onClose={() => undefined} />);
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('auto-closes after duration', () => {
    const onClose = vi.fn();
    render(<Toast open message="bye" onClose={onClose} duration={1000} />);
    expect(onClose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(999);
    expect(onClose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not auto-close when duration is 0', () => {
    const onClose = vi.fn();
    render(<Toast open message="stay" onClose={onClose} duration={0} />);
    vi.advanceTimersByTime(60_000);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('clears the timer on close (open → false)', () => {
    const onClose = vi.fn();
    const { rerender } = render(<Toast open message="x" onClose={onClose} duration={1000} />);
    rerender(<Toast open={false} message="x" onClose={onClose} duration={1000} />);
    vi.advanceTimersByTime(2000);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('binding id matches', () => {
    expect(ToastBinding.id).toBe('Toast');
  });
});
