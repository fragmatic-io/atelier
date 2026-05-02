// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { afterEach, describe, expect, it } from 'vitest';
import { REDUCED_MOTION_QUERY, isReducedMotion } from '../../src/motion/reduced-motion.js';

type StubGlobals = { window?: unknown };

function installWindow(matchMedia: ((q: string) => { matches: boolean }) | undefined): () => void {
  const stub = globalThis as unknown as StubGlobals;
  const prev = stub.window;
  stub.window = matchMedia ? { matchMedia } : {};
  return (): void => {
    stub.window = prev;
  };
}

describe('isReducedMotion', () => {
  let restore: (() => void) | null = null;
  afterEach(() => {
    restore?.();
    restore = null;
  });

  it('returns true (conservative) in SSR / no-window contexts', () => {
    expect(isReducedMotion()).toBe(true);
  });

  it('returns true when window has no matchMedia', () => {
    restore = installWindow(undefined);
    expect(isReducedMotion()).toBe(true);
  });

  it('returns true when matchMedia matches the reduced-motion query', () => {
    let queried = '';
    restore = installWindow((q) => {
      queried = q;
      return { matches: true };
    });
    expect(isReducedMotion()).toBe(true);
    expect(queried).toBe(REDUCED_MOTION_QUERY);
  });

  it('returns false when matchMedia does not match', () => {
    restore = installWindow(() => ({ matches: false }));
    expect(isReducedMotion()).toBe(false);
  });

  it('returns true (conservative) if matchMedia throws', () => {
    restore = installWindow(() => {
      throw new Error('unsupported query');
    });
    expect(isReducedMotion()).toBe(true);
  });
});
