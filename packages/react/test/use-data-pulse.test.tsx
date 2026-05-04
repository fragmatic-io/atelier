// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
// @vitest-environment happy-dom
import './setup.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { useEffect, useState, type ReactElement } from 'react';
import { useDataPulse } from '../src/hooks/use-data-pulse.js';

/**
 * `useDataPulse(value, windowMs)` returns elapsed-ms since `value`
 * last changed. Returns `Infinity` after `windowMs` elapses, when
 * reduced motion is preferred, or when rAF is unavailable.
 *
 * These tests fake `matchMedia` to control the reduced-motion seam, and
 * fake `requestAnimationFrame` so we can drive the tick loop deterministically.
 */

interface FakeMql {
  matches: boolean;
  addEventListener: (type: string, fn: (ev: { matches: boolean }) => void) => void;
  removeEventListener: (type: string, fn: (ev: { matches: boolean }) => void) => void;
}

function fakeMql(matches: boolean): FakeMql {
  return {
    matches,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
}

function ProbeWithValue({
  initialValue,
  windowMs,
  onValue,
}: {
  initialValue: number;
  windowMs?: number;
  onValue: (elapsed: number, setVal: (v: number) => void) => void;
}): ReactElement {
  const [val, setVal] = useState<number>(initialValue);
  const elapsed = windowMs === undefined ? useDataPulse(val) : useDataPulse(val, windowMs);
  useEffect(() => {
    onValue(elapsed, setVal);
  });
  return <div data-testid="probe">{String(elapsed)}</div>;
}

describe('useDataPulse', () => {
  let originalMM: typeof window.matchMedia | undefined;

  beforeEach(() => {
    originalMM = window.matchMedia;
    window.matchMedia = vi.fn(() => fakeMql(false)) as unknown as typeof window.matchMedia;
  });
  afterEach(() => {
    if (originalMM !== undefined) {
      window.matchMedia = originalMM;
      originalMM = undefined;
    }
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('returns Infinity immediately under prefers-reduced-motion', () => {
    window.matchMedia = vi.fn(() => fakeMql(true)) as unknown as typeof window.matchMedia;
    const captured: number[] = [];
    render(
      <ProbeWithValue
        initialValue={1}
        onValue={(e) => {
          captured.push(e);
        }}
      />,
    );
    // Last captured value is Infinity (the effect set it that way).
    expect(captured[captured.length - 1]).toBe(Infinity);
  });

  it('returns Infinity immediately when windowMs <= 0', () => {
    const captured: number[] = [];
    render(
      <ProbeWithValue
        initialValue={1}
        windowMs={0}
        onValue={(e) => {
          captured.push(e);
        }}
      />,
    );
    expect(captured[captured.length - 1]).toBe(Infinity);
  });

  it('seeds elapsed at 0 on first effect, then ticks via rAF, then closes the window with Infinity', () => {
    // Manually drive rAF.
    const rafCallbacks: FrameRequestCallback[] = [];
    const realRaf = window.requestAnimationFrame;
    const realCancel = window.cancelAnimationFrame;
    window.requestAnimationFrame = (cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    };
    window.cancelAnimationFrame = () => undefined;

    // Mock performance.now to advance.
    let nowMs = 1_000;
    const realPerfNow = performance.now.bind(performance);
    vi.spyOn(performance, 'now').mockImplementation(() => nowMs);

    try {
      const captured: number[] = [];
      render(
        <ProbeWithValue
          initialValue={1}
          windowMs={100}
          onValue={(e) => {
            captured.push(e);
          }}
        />,
      );

      // After mount, effect ran → elapsed=0, rAF queued.
      expect(captured[captured.length - 1]).toBe(0);
      expect(rafCallbacks.length).toBeGreaterThan(0);

      // Advance partial — tick fires with positive elapsed < window.
      nowMs = 1_050;
      const cb1 = rafCallbacks.shift();
      act(() => {
        cb1?.(0);
      });
      expect(captured[captured.length - 1]).toBe(50);

      // Advance past windowMs — tick sets Infinity and stops queuing.
      nowMs = 1_200;
      const cb2 = rafCallbacks.shift();
      act(() => {
        cb2?.(0);
      });
      expect(captured[captured.length - 1]).toBe(Infinity);
    } finally {
      window.requestAnimationFrame = realRaf;
      window.cancelAnimationFrame = realCancel;
      vi.spyOn(performance, 'now').mockImplementation(realPerfNow);
    }
  });

  it('cancels the rAF loop on unmount', () => {
    const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame');
    const rafQueued: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      rafQueued.push(cb);
      return rafQueued.length;
    });

    const { unmount } = render(
      <ProbeWithValue initialValue={1} windowMs={500} onValue={() => undefined} />,
    );
    unmount();
    expect(cancelSpy).toHaveBeenCalled();
  });

  it('tolerates an environment with no rAF (returns Infinity)', () => {
    const realRaf = window.requestAnimationFrame;
    // Cast away — we deliberately remove the function.
    (window as unknown as { requestAnimationFrame: undefined }).requestAnimationFrame = undefined;
    try {
      const captured: number[] = [];
      render(
        <ProbeWithValue
          initialValue={1}
          windowMs={500}
          onValue={(e) => {
            captured.push(e);
          }}
        />,
      );
      expect(captured[captured.length - 1]).toBe(Infinity);
    } finally {
      window.requestAnimationFrame = realRaf;
    }
  });
});
