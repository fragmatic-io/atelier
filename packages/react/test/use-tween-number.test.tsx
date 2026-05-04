// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
// @vitest-environment happy-dom
import './setup.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { useEffect, useState, type ReactElement } from 'react';
import { useTweenNumber } from '../src/hooks/use-tween-number.js';

interface FakeMql {
  matches: boolean;
  addEventListener: () => void;
  removeEventListener: () => void;
}

const fakeMql = (matches: boolean): FakeMql => ({
  matches,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
});

function TweenProbe({
  initialTarget,
  durationMs,
  onValue,
}: {
  initialTarget: number;
  durationMs?: number;
  onValue: (displayed: number, setTarget: (v: number) => void) => void;
}): ReactElement {
  const [target, setTarget] = useState<number>(initialTarget);
  const displayed =
    durationMs === undefined ? useTweenNumber(target) : useTweenNumber(target, durationMs);
  useEffect(() => {
    onValue(displayed, setTarget);
  });
  return <div>{String(displayed)}</div>;
}

describe('useTweenNumber', () => {
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
  });

  it('first render snaps to target — no animation from a phantom zero', () => {
    const captured: number[] = [];
    render(
      <TweenProbe
        initialTarget={42}
        onValue={(d) => {
          captured.push(d);
        }}
      />,
    );
    expect(captured[0]).toBe(42);
  });

  it('returns target immediately under reduced motion', () => {
    window.matchMedia = vi.fn(() => fakeMql(true)) as unknown as typeof window.matchMedia;
    const captured: number[] = [];
    let setter: ((v: number) => void) | undefined;
    render(
      <TweenProbe
        initialTarget={0}
        onValue={(d, s) => {
          captured.push(d);
          setter = s;
        }}
      />,
    );
    act(() => {
      setter?.(100);
    });
    expect(captured[captured.length - 1]).toBe(100);
  });

  it('returns target when durationMs <= 0 (no animation)', () => {
    const captured: number[] = [];
    let setter: ((v: number) => void) | undefined;
    render(
      <TweenProbe
        initialTarget={0}
        durationMs={0}
        onValue={(d, s) => {
          captured.push(d);
          setter = s;
        }}
      />,
    );
    act(() => {
      setter?.(100);
    });
    expect(captured[captured.length - 1]).toBe(100);
  });

  it('eases via rAF and lands exactly on target at t>=1', () => {
    const rafQueue: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
    let nowMs = 1_000;
    vi.spyOn(performance, 'now').mockImplementation(() => nowMs);

    const captured: number[] = [];
    let setter: ((v: number) => void) | undefined;
    render(
      <TweenProbe
        initialTarget={0}
        durationMs={100}
        onValue={(d, s) => {
          captured.push(d);
          setter = s;
        }}
      />,
    );
    // Initial mount captured 0. Now bump target → effect schedules rAF.
    act(() => {
      setter?.(100);
    });
    expect(rafQueue.length).toBeGreaterThan(0);

    // Mid-tween: t = 0.5, easeOutQuad(0.5) = 1 - (0.5)^2 = 0.75 → 75.
    nowMs = 1_050;
    act(() => {
      rafQueue.shift()?.(0);
    });
    expect(captured[captured.length - 1]).toBeCloseTo(75, 1);

    // Past duration: lands exactly on 100.
    nowMs = 1_200;
    act(() => {
      rafQueue.shift()?.(0);
    });
    expect(captured[captured.length - 1]).toBe(100);
  });

  it('short-circuits rAF when target equals current displayed value', () => {
    const rafQueue: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });

    let setter: ((v: number) => void) | undefined;
    render(
      <TweenProbe
        initialTarget={42}
        durationMs={100}
        onValue={(_d, s) => {
          setter = s;
        }}
      />,
    );
    // No rAF should have been queued yet — first mount already snapped.
    expect(rafQueue.length).toBe(0);
    // Set target to the same value — still no rAF.
    act(() => {
      setter?.(42);
    });
    expect(rafQueue.length).toBe(0);
  });

  it('cancels rAF on unmount', () => {
    const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame');
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((_cb: FrameRequestCallback) => 1);
    let setter: ((v: number) => void) | undefined;
    const { unmount } = render(
      <TweenProbe
        initialTarget={0}
        durationMs={500}
        onValue={(_d, s) => {
          setter = s;
        }}
      />,
    );
    act(() => {
      setter?.(99);
    });
    unmount();
    expect(cancelSpy).toHaveBeenCalled();
  });

  it('tolerates a no-rAF environment (snaps to target)', () => {
    const realRaf = window.requestAnimationFrame;
    (window as unknown as { requestAnimationFrame: undefined }).requestAnimationFrame = undefined;
    try {
      const captured: number[] = [];
      let setter: ((v: number) => void) | undefined;
      render(
        <TweenProbe
          initialTarget={0}
          durationMs={500}
          onValue={(d, s) => {
            captured.push(d);
            setter = s;
          }}
        />,
      );
      act(() => {
        setter?.(99);
      });
      expect(captured[captured.length - 1]).toBe(99);
    } finally {
      window.requestAnimationFrame = realRaf;
    }
  });
});
