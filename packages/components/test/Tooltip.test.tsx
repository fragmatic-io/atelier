// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
// @vitest-environment happy-dom
import './setup.js';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  Tooltip,
  TooltipBinding,
  computeTooltipPosition,
  tooltipTextRender,
} from '../src/components/Tooltip.js';

/**
 * `prefers-reduced-motion` swap. happy-dom ships a `matchMedia` stub that
 * always reports `matches: false`; for the reduced-motion test we replace
 * it locally so the component's branch flips. Restore in `afterEach`.
 */
function mockReducedMotion(matches: boolean): () => void {
  const original = window.matchMedia;
  const mock = (q: string): MediaQueryList => {
    const stub = {
      matches: q.includes('prefers-reduced-motion') ? matches : false,
      media: q,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    };
    return stub as MediaQueryList;
  };
  window.matchMedia = mock;
  return (): void => {
    window.matchMedia = original;
  };
}

const TIP = '[data-cir-component="Tooltip"]';

/**
 * Each `it` opt-ins to fake timers locally — Vitest's fake timers also stub
 * `Date.now`, which is what the sticky-window logic uses to detect a
 * re-hover, so we want them on whenever timing matters.
 */
describe('Tooltip', () => {
  it('binding id matches', () => {
    expect(TooltipBinding.id).toBe('Tooltip');
  });

  it('does not render the bubble by default', () => {
    render(
      <Tooltip content="hint">
        <button type="button">trigger</button>
      </Tooltip>,
    );
    expect(document.querySelector(TIP)).toBeNull();
  });

  it('opens after the 400ms initial delay on mouseenter', () => {
    vi.useFakeTimers();
    try {
      render(
        <Tooltip content="hint">
          <button type="button">trigger</button>
        </Tooltip>,
      );
      const trigger = screen.getByRole('button', { name: 'trigger' });
      fireEvent.mouseEnter(trigger);
      // Before 400ms elapses — not yet open.
      act(() => {
        vi.advanceTimersByTime(399);
      });
      expect(document.querySelector(TIP)).toBeNull();
      // Cross the 400ms threshold.
      act(() => {
        vi.advanceTimersByTime(2);
      });
      const bubble = document.querySelector(TIP);
      expect(bubble).not.toBeNull();
      expect(bubble?.getAttribute('role')).toBe('tooltip');
      expect(bubble?.textContent).toContain('hint');
    } finally {
      vi.useRealTimers();
    }
  });

  it('re-shows in the 100ms sticky window after a recent close', () => {
    vi.useFakeTimers();
    try {
      render(
        <Tooltip content="hint">
          <button type="button">trigger</button>
        </Tooltip>,
      );
      const trigger = screen.getByRole('button', { name: 'trigger' });
      // First open uses the 400ms delay.
      fireEvent.mouseEnter(trigger);
      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(document.querySelector(TIP)).not.toBeNull();
      // Close (mouseleave with the bubble already open closes immediately).
      fireEvent.mouseLeave(trigger);
      expect(document.querySelector(TIP)).toBeNull();
      // Re-hover within the sticky window (1500ms): 100ms re-show delay.
      act(() => {
        vi.advanceTimersByTime(200);
      });
      fireEvent.mouseEnter(trigger);
      // 50ms in — still closed.
      act(() => {
        vi.advanceTimersByTime(50);
      });
      expect(document.querySelector(TIP)).toBeNull();
      // 100ms total — the bubble is back, no 400ms wait.
      act(() => {
        vi.advanceTimersByTime(60);
      });
      expect(document.querySelector(TIP)).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('falls back to the 400ms delay once the sticky window expires', () => {
    vi.useFakeTimers();
    try {
      render(
        <Tooltip content="hint">
          <button type="button">trigger</button>
        </Tooltip>,
      );
      const trigger = screen.getByRole('button', { name: 'trigger' });
      // Open + close once.
      fireEvent.mouseEnter(trigger);
      act(() => {
        vi.advanceTimersByTime(400);
      });
      fireEvent.mouseLeave(trigger);
      // Wait past the 1500ms sticky window before re-hovering.
      act(() => {
        vi.advanceTimersByTime(1600);
      });
      fireEvent.mouseEnter(trigger);
      // 200ms — still closed (400ms delay applies again).
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(document.querySelector(TIP)).toBeNull();
      act(() => {
        vi.advanceTimersByTime(220);
      });
      expect(document.querySelector(TIP)).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('mouseleave before the show timer fires cancels the pending open', () => {
    vi.useFakeTimers();
    try {
      render(
        <Tooltip content="hint">
          <button type="button">trigger</button>
        </Tooltip>,
      );
      const trigger = screen.getByRole('button', { name: 'trigger' });
      fireEvent.mouseEnter(trigger);
      act(() => {
        vi.advanceTimersByTime(200);
      });
      fireEvent.mouseLeave(trigger);
      // Run past where 400ms would have hit; no bubble should appear.
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(document.querySelector(TIP)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it(':focus-visible (focus event) opens the tooltip; blur closes it', () => {
    vi.useFakeTimers();
    try {
      render(
        <Tooltip content="hint">
          <button type="button">trigger</button>
        </Tooltip>,
      );
      const trigger = screen.getByRole('button', { name: 'trigger' });
      fireEvent.focus(trigger);
      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(document.querySelector(TIP)).not.toBeNull();
      fireEvent.blur(trigger);
      expect(document.querySelector(TIP)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('Escape key closes an open tooltip', () => {
    vi.useFakeTimers();
    try {
      render(
        <Tooltip content="hint">
          <button type="button">trigger</button>
        </Tooltip>,
      );
      fireEvent.mouseEnter(screen.getByRole('button', { name: 'trigger' }));
      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(document.querySelector(TIP)).not.toBeNull();
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(document.querySelector(TIP)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('clicking the trigger dismisses the open tooltip', () => {
    vi.useFakeTimers();
    try {
      render(
        <Tooltip content="hint">
          <button type="button">trigger</button>
        </Tooltip>,
      );
      const trigger = screen.getByRole('button', { name: 'trigger' });
      fireEvent.mouseEnter(trigger);
      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(document.querySelector(TIP)).not.toBeNull();
      fireEvent.click(trigger);
      expect(document.querySelector(TIP)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('outside mousedown closes the tooltip', () => {
    vi.useFakeTimers();
    try {
      render(
        <div>
          <Tooltip content="hint">
            <button type="button">trigger</button>
          </Tooltip>
          <button type="button">outside</button>
        </div>,
      );
      fireEvent.mouseEnter(screen.getByRole('button', { name: 'trigger' }));
      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(document.querySelector(TIP)).not.toBeNull();
      fireEvent.mouseDown(screen.getByRole('button', { name: 'outside' }));
      expect(document.querySelector(TIP)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('aria-describedby wires the trigger to the bubble id while open', () => {
    vi.useFakeTimers();
    try {
      render(
        <Tooltip content="hint">
          <button type="button">trigger</button>
        </Tooltip>,
      );
      const trigger = screen.getByRole('button', { name: 'trigger' });
      // Closed: no aria-describedby (or whatever the consumer set).
      expect(trigger.getAttribute('aria-describedby')).toBeNull();
      fireEvent.mouseEnter(trigger);
      act(() => {
        vi.advanceTimersByTime(400);
      });
      const bubble = document.querySelector(TIP) as HTMLElement;
      const describedBy = trigger.getAttribute('aria-describedby');
      expect(describedBy).not.toBeNull();
      expect(bubble.id).toBe(describedBy);
    } finally {
      vi.useRealTimers();
    }
  });

  it('honours a pre-existing aria-describedby when closed', () => {
    render(
      <Tooltip content="hint">
        <button type="button" aria-describedby="external-help">
          trigger
        </button>
      </Tooltip>,
    );
    const trigger = screen.getByRole('button', { name: 'trigger' });
    expect(trigger.getAttribute('aria-describedby')).toBe('external-help');
  });

  it('applies the 100ms opacity fade transition by default', () => {
    vi.useFakeTimers();
    try {
      render(
        <Tooltip content="hint">
          <button type="button">trigger</button>
        </Tooltip>,
      );
      fireEvent.mouseEnter(screen.getByRole('button', { name: 'trigger' }));
      act(() => {
        vi.advanceTimersByTime(400);
      });
      const bubble = document.querySelector(TIP) as HTMLElement;
      expect(bubble.style.transition).toContain('opacity');
      expect(bubble.style.transition).toContain('100ms');
    } finally {
      vi.useRealTimers();
    }
  });

  it('respects prefers-reduced-motion: reduce by skipping the fade', () => {
    vi.useFakeTimers();
    const restore = mockReducedMotion(true);
    try {
      render(
        <Tooltip content="hint">
          <button type="button">trigger</button>
        </Tooltip>,
      );
      fireEvent.mouseEnter(screen.getByRole('button', { name: 'trigger' }));
      act(() => {
        vi.advanceTimersByTime(400);
      });
      const bubble = document.querySelector(TIP) as HTMLElement;
      expect(bubble).not.toBeNull();
      expect(bubble.style.transition).toBe('');
    } finally {
      restore();
      vi.useRealTimers();
    }
  });

  it('disabled prop suppresses opening entirely', () => {
    vi.useFakeTimers();
    try {
      render(
        <Tooltip content="hint" disabled>
          <button type="button">trigger</button>
        </Tooltip>,
      );
      fireEvent.mouseEnter(screen.getByRole('button', { name: 'trigger' }));
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(document.querySelector(TIP)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('reflects variant via data-variant + class', () => {
    vi.useFakeTimers();
    try {
      render(
        <Tooltip content="hint" variant="inverse">
          <button type="button">trigger</button>
        </Tooltip>,
      );
      fireEvent.mouseEnter(screen.getByRole('button', { name: 'trigger' }));
      act(() => {
        vi.advanceTimersByTime(400);
      });
      const bubble = document.querySelector(TIP) as HTMLElement;
      expect(bubble.getAttribute('data-variant')).toBe('inverse');
      expect(bubble.className).toContain('bg-yellow-300');
    } finally {
      vi.useRealTimers();
    }
  });

  // ---------------------------------------------------------------------------
  // Edge-flip — pure-function assertions on `computeTooltipPosition` to avoid
  // leaning on happy-dom's layout (which never measures real bubble sizes).
  // ---------------------------------------------------------------------------

  it('flips top → bottom when preferred side would clip above the viewport', () => {
    const flipped = computeTooltipPosition(
      { top: 4, bottom: 20, left: 100, right: 200, width: 100, height: 16 },
      { width: 80, height: 28 },
      'top',
      8,
      { width: 1024, height: 768 },
    );
    expect(flipped.side).toBe('bottom');
    // top should sit just below the trigger + 8px offset.
    expect(flipped.top).toBe(20 + 8);
  });

  it('honours the preferred top side when there is room', () => {
    const honoured = computeTooltipPosition(
      { top: 400, bottom: 420, left: 100, right: 200, width: 100, height: 20 },
      { width: 80, height: 28 },
      'top',
      8,
      { width: 1024, height: 768 },
    );
    expect(honoured.side).toBe('top');
    // top = trigger.top - bubble.height - offset = 400 - 28 - 8 = 364
    expect(honoured.top).toBe(364);
  });

  it('flips left → right when preferred side would clip to the left', () => {
    const flipped = computeTooltipPosition(
      { top: 200, bottom: 220, left: 4, right: 96, width: 92, height: 20 },
      { width: 200, height: 32 },
      'left',
      8,
      { width: 1024, height: 768 },
    );
    expect(flipped.side).toBe('right');
  });

  it('flips bottom → top when preferred side would clip below', () => {
    const flipped = computeTooltipPosition(
      { top: 740, bottom: 760, left: 100, right: 200, width: 100, height: 20 },
      { width: 80, height: 28 },
      'bottom',
      8,
      { width: 1024, height: 768 },
    );
    expect(flipped.side).toBe('top');
  });

  it('clamps the bubble inside the viewport so it never half-falls off', () => {
    // Trigger at the far right edge — centred bubble would overflow. Clamp
    // keeps it inside the viewport with a 4px gutter.
    const pos = computeTooltipPosition(
      { top: 200, bottom: 220, left: 1000, right: 1024, width: 24, height: 20 },
      { width: 200, height: 28 },
      'top',
      8,
      { width: 1024, height: 768 },
    );
    expect(pos.left + 200).toBeLessThanOrEqual(1024);
    expect(pos.left).toBeGreaterThanOrEqual(0);
  });

  it('uses an 8px default offset between trigger and bubble', () => {
    const pos = computeTooltipPosition(
      { top: 400, bottom: 420, left: 100, right: 200, width: 100, height: 20 },
      { width: 80, height: 28 },
      'bottom',
      8,
      { width: 1024, height: 768 },
    );
    expect(pos.top).toBe(420 + 8);
  });

  it('configurable offset is honoured', () => {
    const pos = computeTooltipPosition(
      { top: 400, bottom: 420, left: 100, right: 200, width: 100, height: 20 },
      { width: 80, height: 28 },
      'bottom',
      16,
      { width: 1024, height: 768 },
    );
    expect(pos.top).toBe(420 + 16);
  });

  // ---------------------------------------------------------------------------
  // Misc — text renderer + non-element passthrough.
  // ---------------------------------------------------------------------------

  it('text renderer is null-safe and accepts Partial<TooltipProps>', () => {
    expect(tooltipTextRender({})).toBe('[Tooltip]');
    expect(tooltipTextRender({ content: 'Save (cmd+S)' })).toBe('[Tooltip: Save (cmd+S)]');
  });

  it('passes through a non-element child unchanged (no portal)', () => {
    render(<Tooltip content="hint">{'plain string' as unknown as React.ReactElement}</Tooltip>);
    expect(document.querySelector(TIP)).toBeNull();
    expect(document.body.textContent).toContain('plain string');
  });
});
