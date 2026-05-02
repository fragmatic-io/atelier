// @vitest-environment happy-dom
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for `<Toast variant="undo">` — Wave 11 / Int-8.
 *
 * Covers:
 *  - Renders the message + Undo button + dismiss affordance + progress bar.
 *  - Clicking Undo fires `onUndo` AND closes the toast.
 *  - Clicking dismiss fires `onDismiss` (or `onClose` when `onDismiss` is omitted).
 *  - The progress bar shrinks as `windowMs` ticks down.
 *  - Auto-dismiss fires `onDismiss` when the window expires.
 */
import './setup.js';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Toast, toastTextRender } from '../src/components/Toast.js';
import { toastVariantClass } from '../src/components/_variants.js';

afterEach(() => {
  cleanup();
});

describe('Toast — variant="undo"', () => {
  it('renders message + Undo button + dismiss button when open', () => {
    render(
      <Toast
        message="Thread archived"
        open
        variant="undo"
        windowMs={5000}
        onUndo={() => undefined}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByText('Thread archived')).toBeTruthy();
    expect(screen.getByText('Undo')).toBeTruthy();
    expect(screen.getByLabelText('Dismiss')).toBeTruthy();
  });

  it('uses the dark high-contrast utility classes for the undo variant', () => {
    render(
      <Toast
        message="hi"
        open
        variant="undo"
        windowMs={5000}
        onUndo={() => undefined}
        onClose={() => undefined}
      />,
    );
    const out = screen.getByRole('status');
    // Sample-class assertion — mirrors `_variants-dark.test.ts` style.
    expect(out.className).toContain('bg-gray-900');
    expect(toastVariantClass.undo).toContain('dark:bg-gray-100');
  });

  it('clicking Undo fires onUndo then onClose', () => {
    const onUndo = vi.fn();
    const onClose = vi.fn();
    render(
      <Toast message="x" open variant="undo" windowMs={5000} onUndo={onUndo} onClose={onClose} />,
    );
    fireEvent.click(screen.getByText('Undo'));
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clicking Dismiss fires onDismiss (and onClose when both supplied)', () => {
    const onDismiss = vi.fn();
    const onClose = vi.fn();
    render(
      <Toast
        message="x"
        open
        variant="undo"
        windowMs={5000}
        onUndo={() => undefined}
        onClose={onClose}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByLabelText('Dismiss'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clicking Dismiss falls through to onClose when onDismiss is omitted', () => {
    const onClose = vi.fn();
    render(
      <Toast
        message="x"
        open
        variant="undo"
        windowMs={5000}
        onUndo={() => undefined}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByLabelText('Dismiss'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('hides the dismiss affordance when dismissible={false}', () => {
    render(
      <Toast
        message="x"
        open
        variant="undo"
        windowMs={5000}
        dismissible={false}
        onUndo={() => undefined}
        onClose={() => undefined}
      />,
    );
    expect(screen.queryByLabelText('Dismiss')).toBeNull();
  });

  it('renders the countdown progress bar at 100% on open', () => {
    const { container } = render(
      <Toast
        message="x"
        open
        variant="undo"
        windowMs={5000}
        onUndo={() => undefined}
        onClose={() => undefined}
      />,
    );
    const progress = container.querySelector('[data-cir-undo-progress="true"] > div');
    expect(progress).toBeTruthy();
    expect((progress as HTMLDivElement).style.width).toMatch(/^(100|9\d(\.\d+)?)%$/);
  });

  it('auto-dismisses (calling onDismiss) when the window expires', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const onClose = vi.fn();
    render(
      <Toast
        message="x"
        open
        variant="undo"
        windowMs={500}
        onUndo={() => undefined}
        onClose={onClose}
        onDismiss={onDismiss}
      />,
    );
    vi.advanceTimersByTime(700);
    expect(onDismiss).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('toastTextRender includes the variant tag for the undo variant', () => {
    expect(
      toastTextRender({
        message: 'gone',
        open: true,
        variant: 'undo',
        windowMs: 5000,
        onUndo: () => undefined,
        onClose: () => undefined,
      }),
    ).toBe('[Toast(undo): gone]');
  });

  it('non-undo variants still render plain message body (no progress bar)', () => {
    const { container } = render(
      <Toast message="hi" open variant="success" onClose={() => undefined} duration={0} />,
    );
    expect(screen.getByText('hi')).toBeTruthy();
    expect(container.querySelector('[data-cir-undo-progress="true"]')).toBeNull();
  });
});
