// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
// @vitest-environment happy-dom
import './setup.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { useEffect, useState, type ReactElement } from 'react';
import { useShimmerOnChange } from '../src/hooks/use-shimmer-on-change.js';

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

function ShimmerProbe({
  initialValue,
  durationMs,
  onValue,
}: {
  initialValue: number;
  durationMs?: number;
  onValue: (opacity: number, setVal: (v: number) => void) => void;
}): ReactElement {
  const [val, setVal] = useState<number>(initialValue);
  const opacity =
    durationMs === undefined ? useShimmerOnChange(val) : useShimmerOnChange(val, durationMs);
  useEffect(() => {
    onValue(opacity, setVal);
  });
  return <div data-testid="shimmer">{String(opacity)}</div>;
}

describe('useShimmerOnChange', () => {
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

  it('returns 1 immediately under reduced motion', () => {
    window.matchMedia = vi.fn(() => fakeMql(true)) as unknown as typeof window.matchMedia;
    const captured: number[] = [];
    render(
      <ShimmerProbe
        initialValue={1}
        onValue={(o) => {
          captured.push(o);
        }}
      />,
    );
    expect(captured[captured.length - 1]).toBe(1);
  });

  it('returns 1 when durationMs <= 0', () => {
    const captured: number[] = [];
    render(
      <ShimmerProbe
        initialValue={1}
        durationMs={0}
        onValue={(o) => {
          captured.push(o);
        }}
      />,
    );
    expect(captured[captured.length - 1]).toBe(1);
  });

  it('ramps opacity from 0.6 → 1 over the duration via rAF', () => {
    const rafQueue: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
    let nowMs = 1_000;
    vi.spyOn(performance, 'now').mockImplementation(() => nowMs);

    const captured: number[] = [];
    render(
      <ShimmerProbe
        initialValue={1}
        durationMs={100}
        onValue={(o) => {
          captured.push(o);
        }}
      />,
    );
    // After mount, opacity reset to 0.6 (the SHIMMER_FROM constant).
    expect(captured[captured.length - 1]).toBe(0.6);

    // Half-way: linear 0.6 + (1-0.6)*0.5 = 0.8.
    nowMs = 1_050;
    act(() => {
      rafQueue.shift()?.(0);
    });
    expect(captured[captured.length - 1]).toBeCloseTo(0.8, 5);

    // Past duration: clamped to t=1, opacity=1.
    nowMs = 1_200;
    act(() => {
      rafQueue.shift()?.(0);
    });
    expect(captured[captured.length - 1]).toBe(1);
  });

  it('cancels rAF on unmount', () => {
    const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame');
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((_cb: FrameRequestCallback) => 1);
    const { unmount } = render(
      <ShimmerProbe initialValue={1} durationMs={500} onValue={() => undefined} />,
    );
    unmount();
    expect(cancelSpy).toHaveBeenCalled();
  });

  it('tolerates a no-rAF environment by returning 1', () => {
    const realRaf = window.requestAnimationFrame;
    (window as unknown as { requestAnimationFrame: undefined }).requestAnimationFrame = undefined;
    try {
      const captured: number[] = [];
      render(
        <ShimmerProbe
          initialValue={1}
          durationMs={500}
          onValue={(o) => {
            captured.push(o);
          }}
        />,
      );
      expect(captured[captured.length - 1]).toBe(1);
    } finally {
      window.requestAnimationFrame = realRaf;
    }
  });
});
