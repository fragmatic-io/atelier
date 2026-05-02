// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
// @vitest-environment happy-dom
/**
 * Tests for the demo's localStorage-backed intent profile store.
 *
 * The store is a thin shim that gives the onboarding flow somewhere to
 * persist a `Zod`-validated `IntentProfile`. These tests cover the
 * documented contract: corrupt JSON, schema-violating JSON, round-trips,
 * revoke, and `hasGrantedLens`.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  INTENT_STORAGE_KEY,
  buildDemoProfile,
  hasGrantedLens,
  loadIntentProfile,
  revokeIntentProfile,
  revokeLens,
  saveIntentProfile,
} from '../lib/intent-store';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe('intent-store', () => {
  it('round-trips a saved profile through localStorage', () => {
    const profile = buildDemoProfile(['lens.today', 'lens.thread']);
    saveIntentProfile(profile);
    const loaded = loadIntentProfile();
    expect(loaded).not.toBeNull();
    expect(loaded?.user_id).toBe('demo-user');
    expect(loaded?.lenses['today']).toBe('default');
    expect(loaded?.lenses['thread']).toBe('default');
  });

  it('returns null when storage holds corrupt JSON, without throwing', () => {
    window.localStorage.setItem(INTENT_STORAGE_KEY, 'not-json{');
    expect(() => loadIntentProfile()).not.toThrow();
    expect(loadIntentProfile()).toBeNull();
  });

  it('returns null when storage holds JSON that violates the schema', () => {
    // Missing required `user_id`, `profile_version`, etc.
    window.localStorage.setItem(INTENT_STORAGE_KEY, JSON.stringify({ totally: 'wrong shape' }));
    expect(loadIntentProfile()).toBeNull();
  });

  it('revokeIntentProfile clears the slot', () => {
    saveIntentProfile(buildDemoProfile(['lens.today']));
    expect(loadIntentProfile()).not.toBeNull();
    revokeIntentProfile();
    expect(loadIntentProfile()).toBeNull();
  });

  it('hasGrantedLens reflects the granted set; revokeLens removes one', () => {
    saveIntentProfile(buildDemoProfile(['lens.today', 'vocabulary.read']));
    expect(hasGrantedLens('lens.today')).toBe(true);
    expect(hasGrantedLens('vocabulary.read')).toBe(true);
    expect(hasGrantedLens('lens.thread')).toBe(false);

    revokeLens('lens.today');
    expect(hasGrantedLens('lens.today')).toBe(false);
    expect(hasGrantedLens('vocabulary.read')).toBe(true);

    // Revoking the last scope clears the profile entirely so the user is
    // bounced back to onboarding instead of dangling with an empty grant.
    revokeLens('vocabulary.read');
    expect(loadIntentProfile()).toBeNull();
  });
});
