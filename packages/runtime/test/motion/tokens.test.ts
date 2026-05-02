// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { afterEach, describe, expect, it } from 'vitest';
import { MOTION_DEFAULTS, durationFor, readMotionTokens } from '../../src/motion/tokens.js';

/**
 * Minimal DOM stub. `tokens.ts` reads `window` + `document.documentElement`
 * + `getComputedStyle().getPropertyValue(name)`. The runtime package's
 * vitest environment is `node` (no happy-dom by default), so we install a
 * just-enough fake.
 */
type StubGlobals = {
  window?: unknown;
  document?: unknown;
  getComputedStyle?: unknown;
};

function installDomStub(
  opts: {
    vars?: Record<string, string>;
    reduced?: boolean;
  } = {},
): () => void {
  const vars = opts.vars ?? {};
  const matchMedia = (q: string): { matches: boolean } => ({
    matches: q.includes('reduce') ? Boolean(opts.reduced) : false,
  });
  const documentElement = {};
  const stub = globalThis as unknown as StubGlobals;
  const prevWindow = stub.window;
  const prevDocument = stub.document;
  const prevGCS = stub.getComputedStyle;
  stub.window = { matchMedia };
  stub.document = { documentElement };
  stub.getComputedStyle = () => ({
    getPropertyValue: (name: string) => vars[name] ?? '',
  });
  return (): void => {
    stub.window = prevWindow;
    stub.document = prevDocument;
    stub.getComputedStyle = prevGCS;
  };
}

describe('readMotionTokens', () => {
  let restore: (() => void) | null = null;
  afterEach(() => {
    restore?.();
    restore = null;
  });

  it('returns Atelier defaults in SSR / non-DOM contexts', () => {
    const tokens = readMotionTokens();
    expect(tokens.duration).toEqual(MOTION_DEFAULTS.duration);
    expect(tokens.easing).toEqual(MOTION_DEFAULTS.easing);
  });

  it('returns a fresh copy callers can mutate without polluting defaults', () => {
    const a = readMotionTokens();
    a.duration.fast = 999;
    const b = readMotionTokens();
    expect(b.duration.fast).toBe(MOTION_DEFAULTS.duration.fast);
  });

  it('parses ms-suffixed CSS variables', () => {
    restore = installDomStub({
      vars: {
        '--cir-duration-fast': '120ms',
        '--cir-duration-normal': '200ms',
        '--cir-duration-slow': '400ms',
        '--cir-easing-out': 'cubic-bezier(0.1, 0.2, 0.3, 0.4)',
      },
    });
    const tokens = readMotionTokens();
    expect(tokens.duration.fast).toBe(120);
    expect(tokens.duration.normal).toBe(200);
    expect(tokens.duration.slow).toBe(400);
    expect(tokens.easing.out).toBe('cubic-bezier(0.1, 0.2, 0.3, 0.4)');
    // Untouched easings fall back to defaults.
    expect(tokens.easing.in_out).toBe(MOTION_DEFAULTS.easing.in_out);
  });

  it('parses s-suffixed durations and bare numbers', () => {
    restore = installDomStub({
      vars: {
        '--cir-duration-fast': '0.2s',
        '--cir-duration-normal': '300', // bare → ms
      },
    });
    const tokens = readMotionTokens();
    expect(tokens.duration.fast).toBe(200);
    expect(tokens.duration.normal).toBe(300);
  });

  it('falls back to defaults on unparseable values', () => {
    restore = installDomStub({
      vars: {
        '--cir-duration-fast': 'banana',
        '--cir-duration-slow': '-50ms',
      },
    });
    const tokens = readMotionTokens();
    expect(tokens.duration.fast).toBe(MOTION_DEFAULTS.duration.fast);
    // Negative durations are nonsensical; fall back rather than coerce.
    expect(tokens.duration.slow).toBe(MOTION_DEFAULTS.duration.slow);
  });
});

describe('durationFor', () => {
  let restore: (() => void) | null = null;
  afterEach(() => {
    restore?.();
    restore = null;
  });

  it('returns the resolved duration when motion is allowed', () => {
    restore = installDomStub({
      vars: { '--cir-duration-normal': '180ms' },
      reduced: false,
    });
    expect(durationFor('normal')).toBe(180);
  });

  it('returns 0 when prefers-reduced-motion is set', () => {
    restore = installDomStub({
      vars: { '--cir-duration-normal': '180ms' },
      reduced: true,
    });
    expect(durationFor('normal')).toBe(0);
  });

  it('returns 0 in SSR / non-DOM contexts (conservative default)', () => {
    expect(durationFor('fast')).toBe(0);
  });
});
