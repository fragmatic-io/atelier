// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Toast, ToastBinding } from '../src/components/Toast.js';

describe('Toast', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<Toast message="hi" open={false} onClose={() => undefined} />);
    expect(container.querySelector('[data-cir-component="Toast"]')).toBeNull();
  });
  it('renders the message when open', () => {
    render(<Toast message="hi" open onClose={() => undefined} duration={0} />);
    expect(screen.getByText('hi')).toBeTruthy();
  });
  it('default severity is info (role=status)', () => {
    render(<Toast message="hi" open onClose={() => undefined} duration={0} />);
    expect(screen.getByRole('status').getAttribute('data-severity')).toBe('info');
  });
  it('error severity is role=alert', () => {
    render(<Toast message="boom" open severity="error" onClose={() => undefined} duration={0} />);
    expect(screen.getByRole('alert').getAttribute('data-severity')).toBe('error');
  });
  it('auto-closes after duration via onClose', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<Toast message="hi" open onClose={onClose} duration={1000} />);
    vi.advanceTimersByTime(1100);
    expect(onClose).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
  it('binding id matches', () => {
    expect(ToastBinding.id).toBe('Toast');
  });
  // -- Wave 6 / P-10 variant assertions --
  it('accepts variant as a synonym for severity', () => {
    render(<Toast message="hi" open variant="success" onClose={() => undefined} duration={0} />);
    expect(screen.getByRole('status').getAttribute('data-variant')).toBe('success');
  });
  it('applies the variant utility class', () => {
    render(<Toast message="x" open variant="warning" onClose={() => undefined} duration={0} />);
    expect(screen.getByRole('alert').className).toContain('bg-amber-50');
  });
  it('variant prop wins over severity when both are set', () => {
    render(
      <Toast
        message="x"
        open
        severity="info"
        variant="error"
        onClose={() => undefined}
        duration={0}
      />,
    );
    expect(screen.getByRole('alert').getAttribute('data-variant')).toBe('error');
  });
});
