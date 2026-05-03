// @vitest-environment happy-dom
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import './setup.js';
import { fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  TourStep,
  TourStepBinding,
  computeCardPosition,
  pickAutoPlacement,
  resolveTargetRect,
  tourStepTextRender,
} from '../src/components/TourStep.js';

const CARD = '[data-cir-part="tour-step-card"]';
const RING = '[data-cir-part="tour-step-overlay"]';

/**
 * `prefers-reduced-motion` swap. Same pattern as `HoverCard.test.tsx` —
 * happy-dom's default is `matches: false`; flip locally to drive the
 * branch. Restore after the test.
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

/** Mount a target element on the page so the selector resolves. */
function mountTarget(id: string): HTMLDivElement {
  const el = document.createElement('div');
  el.id = id;
  el.style.width = '100px';
  el.style.height = '40px';
  document.body.appendChild(el);
  return el;
}

describe('TourStep', () => {
  afterEach(() => {
    // Tear down any leftover targets between tests.
    document.querySelectorAll('[id^="tour-target-"]').forEach((n) => n.remove());
    vi.useRealTimers();
  });

  it('binding id matches', () => {
    expect(TourStepBinding.id).toBe('TourStep');
  });

  it('renders nothing when open=false', () => {
    mountTarget('tour-target-1');
    render(<TourStep target="#tour-target-1" title="Hello" step={1} totalSteps={3} open={false} />);
    expect(document.querySelector(CARD)).toBeNull();
  });

  it('renders an overlay ring + tooltip card when open', () => {
    mountTarget('tour-target-2');
    render(<TourStep target="#tour-target-2" title="Welcome" step={1} totalSteps={3} />);
    expect(document.querySelector(RING)).toBeTruthy();
    const card = document.querySelector(CARD);
    expect(card).toBeTruthy();
    expect(card?.getAttribute('role')).toBe('dialog');
    expect(card?.getAttribute('aria-label')).toBe('Tour step');
    expect(card?.textContent).toContain('Welcome');
  });

  it('renders the description when provided', () => {
    mountTarget('tour-target-3');
    render(
      <TourStep
        target="#tour-target-3"
        title="A"
        description="Some helpful copy"
        step={1}
        totalSteps={3}
      />,
    );
    const desc = document.querySelector('[data-cir-part="tour-step-description"]');
    expect(desc?.textContent).toContain('Some helpful copy');
  });

  it('resolves a CSS-selector target — different selectors yield distinct ring positions', () => {
    const a = mountTarget('tour-target-a');
    a.getBoundingClientRect = (): DOMRect => ({
      top: 100,
      left: 50,
      bottom: 140,
      right: 150,
      width: 100,
      height: 40,
      x: 50,
      y: 100,
      toJSON: () => ({}),
    });
    const b = mountTarget('tour-target-b');
    b.getBoundingClientRect = (): DOMRect => ({
      top: 400,
      left: 250,
      bottom: 440,
      right: 350,
      width: 100,
      height: 40,
      x: 250,
      y: 400,
      toJSON: () => ({}),
    });
    const first = render(<TourStep target="#tour-target-a" title="A" step={1} totalSteps={2} />);
    const ringA = document.querySelector(RING) as HTMLElement;
    expect(ringA).not.toBeNull();
    const topA = ringA.style.top;
    first.unmount();
    render(<TourStep target="#tour-target-b" title="B" step={1} totalSteps={2} />);
    const ringB = document.querySelector(RING) as HTMLElement;
    expect(ringB).not.toBeNull();
    const topB = ringB.style.top;
    expect(topA).not.toBe(topB);
  });

  it('also accepts an HTMLElement target', () => {
    const el = mountTarget('tour-target-el');
    render(<TourStep target={el} title="Direct" step={1} totalSteps={2} />);
    expect(document.querySelector(CARD)?.textContent).toContain('Direct');
  });

  it('Skip button calls onSkip', () => {
    mountTarget('tour-target-skip');
    const onSkip = vi.fn();
    render(
      <TourStep target="#tour-target-skip" title="X" step={1} totalSteps={3} onSkip={onSkip} />,
    );
    const skip = document.querySelector('[data-cir-part="tour-step-skip"]') as HTMLButtonElement;
    fireEvent.click(skip);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('Next button calls onNext on a non-last step', () => {
    mountTarget('tour-target-next');
    const onNext = vi.fn();
    const onComplete = vi.fn();
    render(
      <TourStep
        target="#tour-target-next"
        title="X"
        step={1}
        totalSteps={3}
        onNext={onNext}
        onComplete={onComplete}
      />,
    );
    const next = document.querySelector('[data-cir-part="tour-step-next"]') as HTMLButtonElement;
    expect(next?.textContent).toBe('Next');
    fireEvent.click(next);
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('last-step Next button labels itself "Done" and calls onComplete', () => {
    mountTarget('tour-target-done');
    const onNext = vi.fn();
    const onComplete = vi.fn();
    render(
      <TourStep
        target="#tour-target-done"
        title="X"
        step={3}
        totalSteps={3}
        onNext={onNext}
        onComplete={onComplete}
      />,
    );
    const done = document.querySelector('[data-cir-part="tour-step-done"]') as HTMLButtonElement;
    expect(done?.textContent).toBe('Done');
    fireEvent.click(done);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onNext).not.toHaveBeenCalled();
  });

  it('Prev button is hidden on step 1, visible on step 2+, and calls onPrev', () => {
    mountTarget('tour-target-prev');
    const onPrev = vi.fn();
    const first = render(
      <TourStep target="#tour-target-prev" title="X" step={1} totalSteps={3} onPrev={onPrev} />,
    );
    expect(document.querySelector('[data-cir-part="tour-step-prev"]')).toBeNull();
    first.unmount();
    render(
      <TourStep target="#tour-target-prev" title="X" step={2} totalSteps={3} onPrev={onPrev} />,
    );
    const prev = document.querySelector('[data-cir-part="tour-step-prev"]') as HTMLButtonElement;
    expect(prev).toBeTruthy();
    fireEvent.click(prev);
    expect(onPrev).toHaveBeenCalledTimes(1);
  });

  it('Escape key calls onSkip', () => {
    mountTarget('tour-target-esc');
    const onSkip = vi.fn();
    render(
      <TourStep target="#tour-target-esc" title="X" step={1} totalSteps={3} onSkip={onSkip} />,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('Enter inside the card advances when focus is on a non-button (e.g. the dialog itself)', () => {
    mountTarget('tour-target-enter');
    const onNext = vi.fn();
    render(
      <TourStep target="#tour-target-enter" title="X" step={1} totalSteps={3} onNext={onNext} />,
    );
    const card = document.querySelector(CARD) as HTMLElement;
    // Move focus onto the card root (NOT a button) — focusable via tabindex
    // wouldn't normally be set, but happy-dom permits direct focus().
    card.setAttribute('tabindex', '-1');
    card.focus();
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('falls back to centre-of-viewport when the selector does not resolve', () => {
    // No matching element on the page.
    render(<TourStep target="#tour-target-missing" title="X" step={1} totalSteps={3} />);
    const ring = document.querySelector(RING) as HTMLElement;
    expect(ring).not.toBeNull();
    // The ring should at least have a finite top / left set.
    expect(ring.style.top).toMatch(/^\d/);
    expect(ring.style.left).toMatch(/^\d/);
  });

  it('ring transition is "none" under reduced-motion', () => {
    const restore = mockReducedMotion(true);
    try {
      mountTarget('tour-target-rm');
      render(<TourStep target="#tour-target-rm" title="X" step={1} totalSteps={3} />);
      const ring = document.querySelector(RING) as HTMLElement;
      expect(ring.style.transition).toBe('none');
    } finally {
      restore();
    }
  });

  it('text renderer surfaces title + counter', () => {
    expect(tourStepTextRender({ title: 'Welcome', step: 1, totalSteps: 3 })).toBe(
      '[TourStep: Welcome (1/3)]',
    );
    expect(tourStepTextRender({})).toBe('[TourStep]');
  });

  describe('pure helpers', () => {
    it('pickAutoPlacement chooses the side with the most room', () => {
      // Target hugging the top — bottom has the most room.
      expect(
        pickAutoPlacement(
          { top: 5, bottom: 45, left: 350, right: 450 },
          { width: 800, height: 600 },
        ),
      ).toBe('bottom');
      // Target hugging the bottom — top has the most room.
      expect(
        pickAutoPlacement(
          { top: 555, bottom: 595, left: 350, right: 450 },
          { width: 800, height: 600 },
        ),
      ).toBe('top');
      // Target hugging the right edge — left has the most room.
      expect(
        pickAutoPlacement(
          { top: 280, bottom: 320, left: 760, right: 790 },
          { width: 800, height: 600 },
        ),
      ).toBe('left');
      // Target hugging the left edge with a short viewport — right wins.
      expect(
        pickAutoPlacement(
          { top: 280, bottom: 320, left: 5, right: 35 },
          { width: 800, height: 600 },
        ),
      ).toBe('right');
    });

    it('computeCardPosition clamps card into the viewport', () => {
      const pos = computeCardPosition(
        { top: 0, bottom: 40, left: 0, right: 100, width: 100, height: 40 },
        { width: 320, height: 120 },
        'top',
        12,
        { width: 800, height: 600 },
      );
      // Top of card would be -132 without clamp; should be at gutter.
      expect(pos.top).toBeGreaterThanOrEqual(0);
      // Left of card would be -110 without clamp; should be at gutter.
      expect(pos.left).toBeGreaterThanOrEqual(0);
    });

    it('resolveTargetRect returns null for unknown selector and a rect for a real element', () => {
      expect(resolveTargetRect('#never-exists')).toBeNull();
      const el = mountTarget('tour-target-resolve');
      const rect = resolveTargetRect('#tour-target-resolve');
      expect(rect).not.toBeNull();
      el.remove();
    });

    it('resolveTargetRect handles a malformed selector by returning null instead of throwing', () => {
      // `[` is not a valid selector — happy-dom's querySelector throws.
      expect(resolveTargetRect('[')).toBeNull();
    });
  });
});
