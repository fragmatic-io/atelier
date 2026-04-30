// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
// @vitest-environment happy-dom
import './setup.js';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HoverCard,
  HoverCardBinding,
  computeHoverCardPosition,
  hoverCardTextRender,
} from '../src/components/HoverCard.js';

/**
 * `prefers-reduced-motion` swap. happy-dom ships a `matchMedia` stub that
 * always reports `matches: false`; for the reduced-motion test we replace
 * it locally so the component's branch flips. Restore in `afterEach`.
 */
function mockReducedMotion(matches: boolean): () => void {
  const original = window.matchMedia;
  // The full `MediaQueryList` surface is stubbed out — we only need
  // `matches` for the reduced-motion branch. A double-cast through
  // `unknown` keeps the strict type contract without us having to
  // implement every legacy listener method.
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

describe('HoverCard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('binding id matches', () => {
    expect(HoverCardBinding.id).toBe('HoverCard');
  });

  it('does not render the card by default', () => {
    render(
      <HoverCard content="preview body">
        <button type="button">trigger</button>
      </HoverCard>,
    );
    expect(document.querySelector('[data-cir-component="HoverCard"]')).toBeNull();
  });

  it('opens after the 350ms openDelay on mouseenter', () => {
    render(
      <HoverCard content="preview body">
        <button type="button">trigger</button>
      </HoverCard>,
    );
    const trigger = screen.getByRole('button', { name: 'trigger' });
    fireEvent.mouseEnter(trigger);
    // 200ms — not yet open.
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(document.querySelector('[data-cir-component="HoverCard"]')).toBeNull();
    // Cross the 350ms threshold.
    act(() => {
      vi.advanceTimersByTime(200);
    });
    const card = document.querySelector('[data-cir-component="HoverCard"]');
    expect(card).not.toBeNull();
    expect(card?.getAttribute('role')).toBe('dialog');
    expect(card?.getAttribute('aria-label')).toBe('Preview');
    expect(card?.textContent).toContain('preview body');
  });

  it('hover-out within closeDelay keeps the card open if the pointer enters the card', () => {
    render(
      <HoverCard content={<span>body</span>}>
        <button type="button">trigger</button>
      </HoverCard>,
    );
    const trigger = screen.getByRole('button', { name: 'trigger' });
    fireEvent.mouseEnter(trigger);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    const card = document.querySelector('[data-cir-component="HoverCard"]') as HTMLElement;
    expect(card).not.toBeNull();
    // User leaves the trigger but moves onto the card within the 150ms
    // grace period; the close timer must be cancelled.
    fireEvent.mouseLeave(trigger);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    fireEvent.mouseEnter(card);
    // Run the rest of the close window — the card MUST stay open.
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(document.querySelector('[data-cir-component="HoverCard"]')).not.toBeNull();
  });

  it('closes when pointer leaves both trigger and card after closeDelay', () => {
    render(
      <HoverCard content="body">
        <button type="button">trigger</button>
      </HoverCard>,
    );
    const trigger = screen.getByRole('button', { name: 'trigger' });
    fireEvent.mouseEnter(trigger);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(document.querySelector('[data-cir-component="HoverCard"]')).not.toBeNull();
    fireEvent.mouseLeave(trigger);
    // Before closeDelay elapses — still open.
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(document.querySelector('[data-cir-component="HoverCard"]')).not.toBeNull();
    // Past 150ms — closed.
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(document.querySelector('[data-cir-component="HoverCard"]')).toBeNull();
  });

  it('click outside closes', () => {
    render(
      <div>
        <HoverCard content="body">
          <button type="button">trigger</button>
        </HoverCard>
        <button type="button">outside</button>
      </div>,
    );
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'trigger' }));
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(document.querySelector('[data-cir-component="HoverCard"]')).not.toBeNull();
    fireEvent.mouseDown(screen.getByRole('button', { name: 'outside' }));
    expect(document.querySelector('[data-cir-component="HoverCard"]')).toBeNull();
  });

  it('Escape key closes', () => {
    render(
      <HoverCard content="body">
        <button type="button">trigger</button>
      </HoverCard>,
    );
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'trigger' }));
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(document.querySelector('[data-cir-component="HoverCard"]')).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.querySelector('[data-cir-component="HoverCard"]')).toBeNull();
  });

  it('lazy content thunk is invoked only when about to open', () => {
    const make = vi.fn(() => <span>lazy body</span>);
    render(
      <HoverCard content={make}>
        <button type="button">trigger</button>
      </HoverCard>,
    );
    expect(make).not.toHaveBeenCalled();
    const trigger = screen.getByRole('button', { name: 'trigger' });
    fireEvent.mouseEnter(trigger);
    // Pre-delay: still not invoked.
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(make).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(make).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-cir-component="HoverCard"]')?.textContent).toContain(
      'lazy body',
    );
  });

  it('respects prefers-reduced-motion: reduce by skipping the fade transition', () => {
    const restore = mockReducedMotion(true);
    try {
      render(
        <HoverCard content="body">
          <button type="button">trigger</button>
        </HoverCard>,
      );
      fireEvent.mouseEnter(screen.getByRole('button', { name: 'trigger' }));
      act(() => {
        vi.advanceTimersByTime(400);
      });
      const card = document.querySelector('[data-cir-component="HoverCard"]');
      expect(card).not.toBeNull();
      // No transition applied when reduced-motion is requested.
      expect((card as HTMLElement | null)?.style.transition).toBe('');
    } finally {
      restore();
    }
  });

  it('flips to the opposite side when the preferred side would clip the viewport', () => {
    // Trigger near the top edge; preferred side `top` would clip → should
    // flip to `bottom`. This is a pure-function test of the position
    // helper to avoid leaning on happy-dom layout semantics for sizing.
    const flipped = computeHoverCardPosition(
      {
        top: 4,
        bottom: 24,
        left: 100,
        right: 200,
        width: 100,
        height: 20,
      },
      { width: 320, height: 200 },
      'top',
      8,
      { width: 1024, height: 768 },
    );
    expect(flipped.side).toBe('bottom');
    // And with room above, `top` is honoured.
    const honoured = computeHoverCardPosition(
      {
        top: 400,
        bottom: 420,
        left: 100,
        right: 200,
        width: 100,
        height: 20,
      },
      { width: 320, height: 200 },
      'top',
      8,
      { width: 1024, height: 768 },
    );
    expect(honoured.side).toBe('top');
  });

  it('flips left → right when preferred side would clip horizontally', () => {
    const flipped = computeHoverCardPosition(
      { top: 200, bottom: 220, left: 8, right: 100, width: 92, height: 20 },
      { width: 320, height: 100 },
      'left',
      8,
      { width: 1024, height: 768 },
    );
    expect(flipped.side).toBe('right');
  });

  it('width=auto omits the width style; numeric width sets it in px', () => {
    const { rerender } = render(
      <HoverCard content="body" width={480}>
        <button type="button">trigger</button>
      </HoverCard>,
    );
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'trigger' }));
    act(() => {
      vi.advanceTimersByTime(400);
    });
    const card = document.querySelector('[data-cir-component="HoverCard"]') as HTMLElement;
    expect(card.style.width).toBe('480px');
    // Re-render with auto.
    rerender(
      <HoverCard content="body" width="auto">
        <button type="button">trigger</button>
      </HoverCard>,
    );
    // Card is still mounted from the previous open; force a re-open by
    // closing then re-hovering would over-complicate this test, so we
    // assert directly that the prop pipeline doesn't add a width when
    // auto is requested by inspecting the current style on the live
    // element. Width should clear on the next render.
    const card2 = document.querySelector('[data-cir-component="HoverCard"]') as HTMLElement;
    expect(card2.style.width).toBe('');
  });

  it('reflects variant via data-variant', () => {
    render(
      <HoverCard content="body" variant="compact">
        <button type="button">trigger</button>
      </HoverCard>,
    );
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'trigger' }));
    act(() => {
      vi.advanceTimersByTime(400);
    });
    const card = document.querySelector('[data-cir-component="HoverCard"]') as HTMLElement;
    expect(card.getAttribute('data-variant')).toBe('compact');
    expect(card.className).toContain('p-2');
  });

  it('text renderer is null-safe and accepts Partial<HoverCardProps>', () => {
    expect(hoverCardTextRender({})).toBe('[HoverCard]');
    expect(hoverCardTextRender({ content: 'Preview' })).toBe('[HoverCard: Preview]');
    // Thunk content is not invoked in text mode — surface the generic
    // label instead.
    expect(hoverCardTextRender({ content: () => 'lazy' })).toBe('[HoverCard]');
  });

  it('aria-label defaults to "Preview" when ariaLabel prop is omitted', () => {
    // Regression for the Wave 7b default — every existing call site that
    // never set `ariaLabel` continues to emit `aria-label="Preview"`.
    render(
      <HoverCard content="body">
        <button type="button">trigger</button>
      </HoverCard>,
    );
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'trigger' }));
    act(() => {
      vi.advanceTimersByTime(400);
    });
    const card = document.querySelector('[data-cir-component="HoverCard"]');
    expect(card?.getAttribute('aria-label')).toBe('Preview');
  });

  it('aria-label honours a custom ariaLabel prop', () => {
    render(
      <HoverCard content="body" ariaLabel="Issue #CIR-123 preview">
        <button type="button">trigger</button>
      </HoverCard>,
    );
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'trigger' }));
    act(() => {
      vi.advanceTimersByTime(400);
    });
    const card = document.querySelector('[data-cir-component="HoverCard"]');
    expect(card?.getAttribute('aria-label')).toBe('Issue #CIR-123 preview');
  });

  it('aria-label honours an explicit empty string (distinct from default)', () => {
    // `ariaLabel=""` is a host signal that the card should surface no
    // accessible name — distinct from the implicit default of "Preview".
    render(
      <HoverCard content="body" ariaLabel="">
        <button type="button">trigger</button>
      </HoverCard>,
    );
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'trigger' }));
    act(() => {
      vi.advanceTimersByTime(400);
    });
    const card = document.querySelector('[data-cir-component="HoverCard"]');
    expect(card?.getAttribute('aria-label')).toBe('');
  });

  it('passes through a non-element child unchanged (no portal)', () => {
    // Mirrors Tooltip's null-safety contract: when the child is not a
    // valid React element we render it verbatim and skip the card
    // entirely.
    render(<HoverCard content="body">{'plain string' as unknown as React.ReactElement}</HoverCard>);
    expect(document.querySelector('[data-cir-component="HoverCard"]')).toBeNull();
    expect(document.body.textContent).toContain('plain string');
  });
});
