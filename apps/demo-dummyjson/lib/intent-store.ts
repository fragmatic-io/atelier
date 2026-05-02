// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Intent profile store for the dummyjson catalog demo.
 *
 * Mirrors `apps/demo/lib/intent-store.ts` but with the lens-switching
 * showcase as its raison d'être: the only intent change this demo cares
 * about is `global_preferences.density`. The lens switcher writes through
 * the vault when reachable and falls back to localStorage with a warning,
 * matching the production posture (`NEXT_PUBLIC_VAULT_FALLBACK=disabled`
 * fails closed).
 *
 * The async API is the headline path; the sync API is the immediate-render
 * fallback the route gates use on first paint.
 */

/* eslint-disable no-console */

import {
  MemoryTokenStorage,
  VaultClient,
  VaultResponseError,
  VaultUnauthorizedError,
  VaultUnreachableError,
  type VaultTokenStorage,
} from '@atelier/vault-client';
import { IntentProfileSchema, type IntentProfile } from '@atelier/schemas';
import type { Density } from '@atelier/components';

/** localStorage key for this demo's profile slot. Namespaced. */
export const INTENT_STORAGE_KEY = 'cir.demo-dummyjson.intent';
/** localStorage key the vault token persists under. */
export const VAULT_TOKEN_STORAGE_KEY = 'cir.demo-dummyjson.vault.token';

export const DEMO_USER_ID = 'demo-user';
export const DEMO_APP_ID = 'cir.demo-dummyjson';

export const DEMO_VAULT_URL =
  (typeof process !== 'undefined' && process.env['NEXT_PUBLIC_VAULT_URL']) ||
  'http://localhost:4001';

export const DEMO_VAULT_FALLBACK_ENABLED =
  (typeof process !== 'undefined' && process.env['NEXT_PUBLIC_VAULT_FALLBACK']) !== 'disabled';

/** The valid `density` values the lens picker writes. */
export type LensDensity = Density;
export const LENS_DENSITIES: readonly LensDensity[] = ['compact', 'comfortable', 'spacious'];

/** Build a fresh profile with a chosen density. */
export function buildDummyJsonProfile(density: LensDensity): IntentProfile {
  return {
    user_id: DEMO_USER_ID,
    profile_version: 1,
    updated_at: new Date().toISOString(),
    global_preferences: {
      density,
      granted_scopes: ['catalog:read', 'cart:read', 'cart:write'],
    },
    lenses: { catalog: 'default' },
    rules: [],
    vocabulary: {},
    cross_app_workflows: [],
  };
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function getStorage(): StorageLike | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

class DemoTokenStorage implements VaultTokenStorage {
  read(): string | null {
    const s = getStorage();
    return s === null ? null : s.getItem(VAULT_TOKEN_STORAGE_KEY);
  }
  write(token: string): void {
    const s = getStorage();
    if (s === null) return;
    s.setItem(VAULT_TOKEN_STORAGE_KEY, token);
  }
  clear(): void {
    const s = getStorage();
    if (s === null) return;
    s.removeItem(VAULT_TOKEN_STORAGE_KEY);
  }
}

let cachedClient: VaultClient | null = null;
export function getVaultClient(): VaultClient {
  if (cachedClient !== null) return cachedClient;
  const tokenStorage =
    typeof window !== 'undefined' ? new DemoTokenStorage() : new MemoryTokenStorage();
  cachedClient = new VaultClient({
    vaultUrl: DEMO_VAULT_URL,
    appId: DEMO_APP_ID,
    tokenStorage,
  });
  return cachedClient;
}

export function _resetVaultClientForTesting(): void {
  cachedClient = null;
}

export function _setVaultClientForTesting(client: VaultClient | null): void {
  cachedClient = client;
}

export function loadIntentProfile(): IntentProfile | null {
  const storage = getStorage();
  if (!storage) return null;
  const raw = storage.getItem(INTENT_STORAGE_KEY);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    const result = IntentProfileSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function saveIntentProfile(profile: IntentProfile): void {
  const storage = getStorage();
  if (!storage) return;
  IntentProfileSchema.parse(profile);
  storage.setItem(INTENT_STORAGE_KEY, JSON.stringify(profile));
}

/** Read the active lens off the profile, defaulting to `comfortable`. */
export function loadLens(): LensDensity {
  const p = loadIntentProfile();
  const raw = p?.global_preferences['density'];
  if (typeof raw === 'string' && (LENS_DENSITIES as readonly string[]).includes(raw)) {
    return raw as LensDensity;
  }
  return 'comfortable';
}

function shouldFallBack(err: unknown): boolean {
  if (err instanceof VaultUnreachableError && DEMO_VAULT_FALLBACK_ENABLED) {
    console.error(
      `[cir-demo-dummyjson] vault unreachable at ${DEMO_VAULT_URL}; falling back to localStorage. Set NEXT_PUBLIC_VAULT_FALLBACK=disabled to fail closed instead.`,
      err.cause.message,
    );
    return true;
  }
  return false;
}

/**
 * Headline async write path: switch lens. Goes through the vault when a
 * token exists; mirrors successful writes back into localStorage so the
 * sync render path agrees on the next paint.
 */
export async function setLensAsync(density: LensDensity): Promise<void> {
  const profile = buildDummyJsonProfile(density);
  const client = getVaultClient();
  try {
    if (client.getToken() === null) {
      // No token yet — guests browse just fine; the demo doesn't gate /browse
      // on a profile. Write locally and move on.
      saveIntentProfile(profile);
      return;
    }
    await client.patchProfile({
      lenses: profile.lenses,
      vocabulary: profile.vocabulary,
      global_preferences: profile.global_preferences,
      rules: profile.rules,
    });
    saveIntentProfile(profile);
  } catch (err) {
    if (err instanceof VaultResponseError && err.status === 404) {
      console.warn(
        '[cir-demo-dummyjson] vault has no profile for this user yet (PATCH 404); persisted to localStorage only.',
      );
      saveIntentProfile(profile);
      return;
    }
    if (shouldFallBack(err)) {
      saveIntentProfile(profile);
      return;
    }
    if (err instanceof VaultUnauthorizedError) {
      // Token revoked — fall back locally rather than error the lens picker.
      saveIntentProfile(profile);
      return;
    }
    throw err;
  }
}

/** Sync mirror used by route gates / first paint. */
export function setLens(density: LensDensity): void {
  saveIntentProfile(buildDummyJsonProfile(density));
}
