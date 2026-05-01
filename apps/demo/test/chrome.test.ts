// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
// @vitest-environment happy-dom
/**
 * Tests for the demo chrome helpers: `nextColorMode`, `applyColorMode`,
 * and `readColorMode`.
 *
 * These are pure (or near-pure) helpers that the chrome's React component
 * uses to derive its toggle state from the loaded `IntentProfile`. The
 * React component itself is exercised by the demo's Playwright suite; this
 * file pins the deterministic helper contract.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyColorMode, nextColorMode, readColorMode } from '../components/Chrome';
import { buildDemoProfile, saveIntentProfile } from '../lib/intent-store';

beforeEach(() => {
  document.documentElement.className = '';
  document.documentElement.dataset['colorMode'] = '';
  window.localStorage.clear();
});

afterEach(() => {
  document.documentElement.className = '';
});

describe('nextColorMode', () => {
  it('cycles light -> dark -> system -> light', () => {
    expect(nextColorMode('light')).toBe('dark');
    expect(nextColorMode('dark')).toBe('system');
    expect(nextColorMode('system')).toBe('light');
  });
});

describe('applyColorMode', () => {
  it('adds the `dark` class on dark mode and sets data-color-mode', () => {
    applyColorMode('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.dataset['colorMode']).toBe('dark');
  });

  it('removes the `dark` class on light mode', () => {
    document.documentElement.classList.add('dark');
    applyColorMode('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.dataset['colorMode']).toBe('light');
  });

  it('on system mode, defers to the prefers-color-scheme media query', () => {
    // happy-dom's matchMedia returns matches: false by default; force dark
    // via a stub so we exercise the branch.
    const original = window.matchMedia;
    window.matchMedia = vi.fn(
      () =>
        ({
          matches: true,
          media: '(prefers-color-scheme: dark)',
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          addListener: () => undefined,
          removeListener: () => undefined,
          onchange: null,
          dispatchEvent: () => true,
        }) as unknown as MediaQueryList,
    );
    applyColorMode('system');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    window.matchMedia = original;
  });
});

describe('readColorMode', () => {
  it('returns "system" when no profile is loaded', () => {
    expect(readColorMode(null)).toBe('system');
  });

  it('returns "system" when the profile has no color_mode preference', () => {
    const p = buildDemoProfile(['lens.today']);
    expect(readColorMode(p)).toBe('system');
  });

  it('reads "dark" / "light" / "system" from the profile preferences', () => {
    const base = buildDemoProfile(['lens.today']);
    const dark = {
      ...base,
      global_preferences: { ...base.global_preferences, color_mode: 'dark' },
    };
    const light = {
      ...base,
      global_preferences: { ...base.global_preferences, color_mode: 'light' },
    };
    const sys = {
      ...base,
      global_preferences: { ...base.global_preferences, color_mode: 'system' },
    };
    expect(readColorMode(dark)).toBe('dark');
    expect(readColorMode(light)).toBe('light');
    expect(readColorMode(sys)).toBe('system');
  });

  it('treats an unknown color_mode value as "system" (defensive)', () => {
    const base = buildDemoProfile(['lens.today']);
    const wonky = {
      ...base,
      global_preferences: { ...base.global_preferences, color_mode: 'sepia' },
    };
    expect(readColorMode(wonky)).toBe('system');
  });
});

describe('color mode persists through localStorage round-trip (vault fallback)', () => {
  it('saving + reloading the profile preserves the chrome toggle state', () => {
    const base = buildDemoProfile(['lens.today']);
    const next = {
      ...base,
      global_preferences: { ...base.global_preferences, color_mode: 'dark' },
    };
    saveIntentProfile(next);
    // Re-read via the chrome helper. localStorage round-trip is the vault
    // fallback path; the async vault PATCH is mocked elsewhere.
    const reloaded = JSON.parse(window.localStorage.getItem('cir.demo.intent') ?? 'null') as
      | typeof base
      | null;
    expect(reloaded).not.toBeNull();
    expect(readColorMode(reloaded)).toBe('dark');
  });
});
