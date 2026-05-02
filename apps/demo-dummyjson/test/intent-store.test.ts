// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
// @vitest-environment happy-dom
/**
 * Lens picker writes density to the vault. Exercises:
 *  - `setLensAsync` calls `client.patchProfile` with the right shape.
 *  - The fallback path (no token) writes to localStorage only.
 *  - `loadLens` reads the persisted density back.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  INTENT_STORAGE_KEY,
  LENS_DENSITIES,
  _resetVaultClientForTesting,
  _setVaultClientForTesting,
  buildDummyJsonProfile,
  loadIntentProfile,
  loadLens,
  setLens,
  setLensAsync,
} from '../lib/intent-store';

interface PatchCall {
  global_preferences?: Record<string, unknown>;
}

function fakeClient(token: string | null = 'tok'): {
  patchCalls: PatchCall[];
  client: {
    getToken: () => string | null;
    patchProfile: (input: PatchCall) => Promise<void>;
  };
} {
  const patchCalls: PatchCall[] = [];
  const client = {
    getToken: () => token,
    patchProfile: vi.fn(async (input: PatchCall): Promise<void> => {
      patchCalls.push(input);
    }),
  };
  return { patchCalls, client };
}

beforeEach(() => {
  window.localStorage.clear();
  _resetVaultClientForTesting();
});

afterEach(() => {
  window.localStorage.clear();
  _resetVaultClientForTesting();
});

describe('lens density store', () => {
  it('round-trips a saved profile through localStorage via setLens', () => {
    setLens('compact');
    const loaded = loadIntentProfile();
    expect(loaded).not.toBeNull();
    expect(loaded?.global_preferences['density']).toBe('compact');
    expect(loadLens()).toBe('compact');
  });

  it('defaults to comfortable when nothing is persisted', () => {
    expect(loadLens()).toBe('comfortable');
  });

  it('sanitises an unknown density value back to comfortable', () => {
    window.localStorage.setItem(
      INTENT_STORAGE_KEY,
      JSON.stringify(buildDummyJsonProfile('compact')),
    );
    // Manually corrupt the density.
    const profile = buildDummyJsonProfile('compact');
    profile.global_preferences['density'] = 'unknown-mode';
    window.localStorage.setItem(INTENT_STORAGE_KEY, JSON.stringify(profile));
    expect(loadLens()).toBe('comfortable');
  });

  it('LENS_DENSITIES enumerates the three valid lenses', () => {
    expect(LENS_DENSITIES).toEqual(['compact', 'comfortable', 'spacious']);
  });

  it('setLensAsync calls vault patchProfile with a density-bearing global_preferences', async () => {
    const { patchCalls, client } = fakeClient('valid-token');
    _setVaultClientForTesting(client as never);
    await setLensAsync('spacious');
    expect(patchCalls).toHaveLength(1);
    expect(patchCalls[0]?.global_preferences?.['density']).toBe('spacious');
    // Sync mirror also persisted.
    expect(loadLens()).toBe('spacious');
  });

  it('setLensAsync falls back to localStorage when no token is present', async () => {
    const { patchCalls, client } = fakeClient(null);
    _setVaultClientForTesting(client as never);
    await setLensAsync('compact');
    expect(patchCalls).toHaveLength(0);
    expect(loadLens()).toBe('compact');
  });
});
