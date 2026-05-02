// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
// @vitest-environment happy-dom
import './setup.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { useEffect, type ReactElement } from 'react';
import { useReducedMotion } from '../src/hooks/use-reduced-motion.js';

interface FakeMql {
  matches: boolean;
  addEventListener: (type: string, fn: (ev: { matches: boolean }) => void) => void;
  removeEventListener: (type: string, fn: (ev: { matches: boolean }) => void) => void;
  fire: (matches: boolean) => void;
}

function makeFakeMql(initial: boolean): FakeMql {
  const listeners: Array<(ev: { matches: boolean }) => void> = [];
  return {
    matches: initial,
    addEventListener: (_type, fn) => {
      listeners.push(fn);
    },
    removeEventListener: (_type, fn) => {
      const idx = listeners.indexOf(fn);
      if (idx >= 0) listeners.splice(idx, 1);
    },
    fire(matches: boolean) {
      this.matches = matches;
      for (const fn of listeners) fn({ matches });
    },
  };
}

interface ProbeProps {
  onValue: (v: boolean) => void;
}
function Probe({ onValue }: ProbeProps): ReactElement {
  const v = useReducedMotion();
  useEffect(() => {
    onValue(v);
  }, [onValue, v]);
  return <div data-testid="probe">{String(v)}</div>;
}

describe('useReducedMotion', () => {
  let originalMM: typeof window.matchMedia | undefined;
  afterEach(() => {
    if (originalMM !== undefined) {
      window.matchMedia = originalMM;
      originalMM = undefined;
    }
  });

  it('initially mirrors matchMedia state on mount', () => {
    const mql = makeFakeMql(true);
    originalMM = window.matchMedia;
    window.matchMedia = vi.fn(() => mql) as unknown as typeof window.matchMedia;
    const values: boolean[] = [];
    render(<Probe onValue={(v) => values.push(v)} />);
    // First render returns the conservative SSR default (true). Effect
    // also runs and re-syncs to the actual mql.matches (also true here).
    expect(values[values.length - 1]).toBe(true);
  });

  it('updates when matchMedia fires a change event', () => {
    const mql = makeFakeMql(false);
    originalMM = window.matchMedia;
    window.matchMedia = vi.fn(() => mql) as unknown as typeof window.matchMedia;
    const values: boolean[] = [];
    render(<Probe onValue={(v) => values.push(v)} />);
    expect(values[values.length - 1]).toBe(false);
    act(() => {
      mql.fire(true);
    });
    expect(values[values.length - 1]).toBe(true);
    act(() => {
      mql.fire(false);
    });
    expect(values[values.length - 1]).toBe(false);
  });

  it('survives matchMedia throwing (SSR fallback applies)', () => {
    originalMM = window.matchMedia;
    window.matchMedia = vi.fn(() => {
      throw new Error('unsupported');
    });
    const values: boolean[] = [];
    render(<Probe onValue={(v) => values.push(v)} />);
    // Effect bails out; conservative default `true` remains.
    expect(values[values.length - 1]).toBe(true);
  });

  it('removes the change listener on unmount', () => {
    const mql = makeFakeMql(false);
    const removeSpy = vi.spyOn(mql, 'removeEventListener');
    originalMM = window.matchMedia;
    window.matchMedia = vi.fn(() => mql) as unknown as typeof window.matchMedia;
    const { unmount } = render(<Probe onValue={() => undefined} />);
    unmount();
    expect(removeSpy).toHaveBeenCalledTimes(1);
  });
});
