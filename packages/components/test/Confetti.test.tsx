// @vitest-environment happy-dom
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import './setup.js';
import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Confetti,
  ConfettiBinding,
  buildParticles,
  confettiTextRender,
} from '../src/components/Confetti.js';

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

const ROOT = '[data-cir-component="Confetti"]';
const PARTICLE = '[data-cir-part="confetti-particle"]';

describe('Confetti', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('binding id matches', () => {
    expect(ConfettiBinding.id).toBe('Confetti');
  });

  it('renders nothing while inactive', () => {
    const { container } = render(<Confetti active={false} />);
    expect(container.querySelector(ROOT)).toBeNull();
  });

  it('renders particles when active=true (default count = 24)', () => {
    const restore = mockReducedMotion(false);
    try {
      const { container } = render(<Confetti active={true} />);
      expect(container.querySelector(ROOT)?.getAttribute('data-active')).toBe('true');
      const particles = container.querySelectorAll(PARTICLE);
      expect(particles.length).toBe(24);
    } finally {
      restore();
    }
  });

  it('respects custom particleCount', () => {
    const restore = mockReducedMotion(false);
    try {
      const { container } = render(<Confetti active={true} particleCount={6} />);
      const particles = container.querySelectorAll(PARTICLE);
      expect(particles.length).toBe(6);
    } finally {
      restore();
    }
  });

  it('fires onDone exactly once after `durationMs` and unmounts the particles', () => {
    const restore = mockReducedMotion(false);
    vi.useFakeTimers();
    const onDone = vi.fn();
    try {
      const { container } = render(
        <Confetti active={true} durationMs={400} particleCount={3} onDone={onDone} />,
      );
      expect(container.querySelectorAll(PARTICLE).length).toBe(3);
      // Pre-duration: not yet done.
      act(() => {
        vi.advanceTimersByTime(399);
      });
      expect(onDone).not.toHaveBeenCalled();
      // Cross the threshold.
      act(() => {
        vi.advanceTimersByTime(2);
      });
      expect(onDone).toHaveBeenCalledTimes(1);
      // Particles are unmounted.
      expect(container.querySelector(ROOT)).toBeNull();
    } finally {
      restore();
    }
  });

  it('reduced-motion mode renders 0 particles and fires onDone on the next microtask', async () => {
    const restore = mockReducedMotion(true);
    const onDone = vi.fn();
    try {
      const { container } = render(<Confetti active={true} onDone={onDone} />);
      // No animated particles ever.
      expect(container.querySelectorAll(PARTICLE).length).toBe(0);
      // Either we see the reduced-motion sentinel in the DOM OR onDone has
      // already fired and the wrapper is gone — both are valid intermediate
      // states. After the microtask flush, onDone MUST have fired.
      await Promise.resolve();
      await Promise.resolve();
      expect(onDone).toHaveBeenCalledTimes(1);
      expect(container.querySelectorAll(PARTICLE).length).toBe(0);
    } finally {
      restore();
    }
  });

  it('does not fire onDone again if active flips to false before the duration elapses', () => {
    const restore = mockReducedMotion(false);
    vi.useFakeTimers();
    const onDone = vi.fn();
    try {
      const { rerender, container } = render(
        <Confetti active={true} durationMs={500} particleCount={3} onDone={onDone} />,
      );
      expect(container.querySelectorAll(PARTICLE).length).toBe(3);
      rerender(<Confetti active={false} durationMs={500} particleCount={3} onDone={onDone} />);
      // Particles are unmounted because running flipped to false.
      expect(container.querySelector(ROOT)).toBeNull();
      // The pending duration timer was cleared.
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(onDone).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it('text renderer is stable', () => {
    expect(confettiTextRender({ active: true })).toBe('[Confetti]');
  });

  it('buildParticles returns the requested count and stable shapes', () => {
    const ps = buildParticles(5, 12345);
    expect(ps.length).toBe(5);
    for (const p of ps) {
      expect(typeof p.drift).toBe('number');
      expect(p.fall).toBeGreaterThan(0);
      expect(typeof p.color).toBe('string');
      expect(p.color.length).toBeGreaterThan(0);
      expect(p.size).toBeGreaterThanOrEqual(6);
      expect(p.delay).toBeGreaterThanOrEqual(0);
    }
    // Same seed → same shape.
    const repeat = buildParticles(5, 12345);
    expect(JSON.stringify(repeat)).toBe(JSON.stringify(ps));
  });

  it('buildParticles handles count 0 cleanly', () => {
    expect(buildParticles(0, 1).length).toBe(0);
  });
});
