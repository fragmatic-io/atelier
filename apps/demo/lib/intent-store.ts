// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Demo intent profile store — vault-backed with a localStorage fallback.
 *
 * Wave 7 / track V-1 swapped this module from "localStorage shim" to a
 * `@cir/vault-client` wrapper. The sync API (`loadIntentProfile`,
 * `saveIntentProfile`, etc.) still operates against localStorage — it's the
 * immediate-render path the route gates use to decide where to redirect on
 * first paint, AND it's the fallback when the vault server isn't running.
 *
 * The async API (`*Async` variants) goes through `VaultClient` first and
 * mirrors successful reads/writes back into localStorage so the sync path
 * stays consistent. When the vault is unreachable, the async helpers log a
 * `console.error` and fall through to localStorage. Production hosts
 * disable the fallback by setting `NEXT_PUBLIC_VAULT_FALLBACK=disabled`.
 *
 * Configure the vault URL via `NEXT_PUBLIC_VAULT_URL` (default
 * `http://localhost:4001`, matching `cir vault dev`'s default port).
 */

/* eslint-disable no-console */

import {
  MemoryTokenStorage,
  VaultClient,
  VaultUnauthorizedError,
  VaultUnreachableError,
  type VaultTokenStorage,
} from '@cir/vault-client';
import { IntentProfileSchema, type IntentProfile } from '@cir/schemas';

/** localStorage key. Namespaced so the key is unambiguous in DevTools. */
export const INTENT_STORAGE_KEY = 'cir.demo.intent';

/** localStorage key the vault token is persisted under. */
export const VAULT_TOKEN_STORAGE_KEY = 'cir.demo.vault.token';

/** The lens scopes the demo asks for. Realistic for an email-triage app. */
export const DEMO_LENS_SCOPES = [
  {
    id: 'lens.today',
    label: 'Today view',
    description: 'Read the threads and tasks needed to render the daily decision queue.',
  },
  {
    id: 'lens.thread',
    label: 'Thread view',
    description: 'Read individual email threads when you open one.',
  },
  {
    id: 'vocabulary.read',
    label: 'Vocabulary (read-only)',
    description: 'Read your name aliases and time references for friendlier rendering.',
  },
] as const;

export type DemoLensScopeId = (typeof DEMO_LENS_SCOPES)[number]['id'];

/** Default user_id used by the demo. Matches `cir-providers.tsx`. */
export const DEMO_USER_ID = 'demo-user';

/** Vault URL config. Falls back to the `cir vault dev` default. */
export const DEMO_VAULT_URL =
  (typeof process !== 'undefined' && process.env['NEXT_PUBLIC_VAULT_URL']) ||
  'http://localhost:4001';

/** App id sent to the vault on grant requests. */
export const DEMO_APP_ID = 'cir.demo';

/**
 * When unset (or 'enabled'), unreachable-vault errors fall through to
 * localStorage. Production hosts set this to 'disabled' to fail closed.
 */
export const DEMO_VAULT_FALLBACK_ENABLED =
  (typeof process !== 'undefined' && process.env['NEXT_PUBLIC_VAULT_FALLBACK']) !== 'disabled';

/**
 * Build a minimal `IntentProfile` from a set of granted scope ids.
 * Sets sensible empty defaults for fields the demo does not exercise.
 */
export function buildDemoProfile(grantedScopes: readonly string[]): IntentProfile {
  // Map our demo lens ids onto the persistent profile's `lenses` map.
  // The key is the domain (e.g. `email`, `today`); the value is the lens
  // selection name. Vocabulary read is recorded as a global preference flag
  // because it's a permission, not a lens choice.
  const lenses: Record<string, string> = {};
  if (grantedScopes.includes('lens.today')) lenses['today'] = 'default';
  if (grantedScopes.includes('lens.thread')) lenses['thread'] = 'default';

  const globalPreferences: Record<string, unknown> = {
    granted_scopes: [...grantedScopes],
  };

  return {
    user_id: DEMO_USER_ID,
    profile_version: 1,
    updated_at: new Date().toISOString(),
    global_preferences: globalPreferences,
    lenses,
    rules: [],
    vocabulary: {},
    cross_app_workflows: [],
  };
}

/** Read the granted scope list off a profile. Returns [] if the profile is missing the marker. */
export function grantedScopesFromProfile(profile: IntentProfile): string[] {
  const raw = profile.global_preferences['granted_scopes'];
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Look up the browser localStorage, or null if not in a browser. */
function getStorage(): StorageLike | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    // Some environments (file://, privacy modes) throw on access.
    return null;
  }
}

/**
 * Token storage backed by `localStorage` under a separate key. Used so the
 * vault client's bearer token persists across refreshes; SSR-safe.
 */
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

/** Singleton client. Lazily constructed so SSR doesn't try to instantiate. */
let cachedClient: VaultClient | null = null;
function getVaultClient(): VaultClient {
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

/**
 * Test-only: reset the cached client. The intent-store unit tests do not
 * touch this; the integration eval calls it to inject a stubbed client.
 */
export function _resetVaultClientForTesting(): void {
  cachedClient = null;
}

/**
 * Test-only: swap in a custom client (e.g. one that targets an in-process
 * vault server in the integration eval). Production code does not call this.
 */
export function _setVaultClientForTesting(client: VaultClient | null): void {
  cachedClient = client;
}

/**
 * Load the intent profile from local storage. Returns null if absent,
 * unparseable, or schema-invalid. Never throws — corrupt storage is treated
 * as "no profile" so the user is bounced back to onboarding.
 *
 * This is the SYNC fallback path the route gates use on first paint. The
 * `loadIntentProfileAsync` variant goes through the vault.
 */
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

/** Persist an intent profile to localStorage (sync fallback). */
export function saveIntentProfile(profile: IntentProfile): void {
  const storage = getStorage();
  if (!storage) return;
  // Validate on write so a callsite can't corrupt the slot.
  IntentProfileSchema.parse(profile);
  storage.setItem(INTENT_STORAGE_KEY, JSON.stringify(profile));
}

/** Clear the slot. Used by `/settings/intent` "revoke all". */
export function revokeIntentProfile(): void {
  const storage = getStorage();
  if (!storage) return;
  storage.removeItem(INTENT_STORAGE_KEY);
  storage.removeItem(VAULT_TOKEN_STORAGE_KEY);
}

/**
 * True if the loaded profile contains the given scope in its granted_scopes
 * marker. Returns false when no profile is present — route gates depend on
 * this.
 */
export function hasGrantedLens(scope: string): boolean {
  const profile = loadIntentProfile();
  if (!profile) return false;
  return grantedScopesFromProfile(profile).includes(scope);
}

/**
 * Revoke a single scope. If the result has no remaining lenses or vocabulary
 * grants, clears the slot entirely (matches the "needs at least one grant"
 * stub in `/onboarding/denied`).
 */
export function revokeLens(scope: string): void {
  const current = loadIntentProfile();
  if (!current) return;
  const remaining = grantedScopesFromProfile(current).filter((s) => s !== scope);
  if (remaining.length === 0) {
    revokeIntentProfile();
    return;
  }
  saveIntentProfile(buildDemoProfile(remaining));
}

// ---------------------------------------------------------------------------
// Async (vault-backed) API
// ---------------------------------------------------------------------------

/**
 * Common error handler: log + decide whether to fall back to localStorage.
 * Returns `true` when the caller should run the localStorage fallback.
 */
function shouldFallBack(err: unknown): boolean {
  if (err instanceof VaultUnreachableError && DEMO_VAULT_FALLBACK_ENABLED) {
    console.error(
      `[cir-demo] vault unreachable at ${DEMO_VAULT_URL}; falling back to localStorage. Set NEXT_PUBLIC_VAULT_FALLBACK=disabled to fail closed instead.`,
      err.cause.message,
    );
    return true;
  }
  return false;
}

/**
 * Provision a grant + save the profile via the vault.
 *
 * Demo flow:
 *   1) Mint a token covering the requested scopes.
 *   2) Seed the vault with a `buildDemoProfile()` baseline (the demo's
 *      vault is open — production deployments won't allow this).
 *   3) Mirror the result into localStorage so the sync path agrees.
 *
 * On vault unreachable + fallback enabled: write to localStorage only.
 */
export async function saveIntentProfileAsync(profile: IntentProfile): Promise<void> {
  const client = getVaultClient();
  const grantedScopes = grantedScopesFromProfile(profile);
  try {
    // Provision a grant (idempotent at the demo level — minting a fresh
    // grant on every save mirrors the "consent screen confirms each save"
    // posture; production deployments use longer-lived grants).
    if (client.getToken() === null) {
      await client.requestGrant({
        scopes: grantedScopes,
        purpose: 'CIR demo onboarding',
        user_id: profile.user_id,
      });
    }
    await client.patchProfile({
      lenses: profile.lenses,
      vocabulary: profile.vocabulary,
      global_preferences: profile.global_preferences,
      rules: profile.rules,
    });
    saveIntentProfile(profile); // mirror to localStorage
  } catch (err) {
    if (shouldFallBack(err)) {
      saveIntentProfile(profile);
      return;
    }
    throw err;
  }
}

/** Async variant of `loadIntentProfile`. Tries vault, falls back to localStorage. */
export async function loadIntentProfileAsync(): Promise<IntentProfile | null> {
  const client = getVaultClient();
  if (client.getToken() === null) {
    // No token at all — nothing the vault can do. Return what's local.
    return loadIntentProfile();
  }
  try {
    const profile = await client.getProfile();
    // Mirror successful reads into localStorage so the sync path agrees.
    saveIntentProfile(profile);
    return profile;
  } catch (err) {
    if (err instanceof VaultUnauthorizedError) {
      // Token revoked or invalid; clear local state and bounce to onboarding.
      revokeIntentProfile();
      return null;
    }
    if (shouldFallBack(err)) {
      return loadIntentProfile();
    }
    throw err;
  }
}

/** Async variant of `revokeIntentProfile`. Calls the vault, then clears local. */
export async function revokeIntentProfileAsync(): Promise<void> {
  const client = getVaultClient();
  try {
    if (client.getToken() !== null) {
      await client.revokeGrant();
    }
  } catch (err) {
    if (!shouldFallBack(err) && !(err instanceof VaultUnauthorizedError)) {
      // Re-throw real errors; ignore unauthorized (token already gone).
      throw err;
    }
  } finally {
    revokeIntentProfile();
  }
}

/**
 * Async variant of `revokeLens`. Patches the vault to drop the scope from
 * `granted_scopes`, then mirrors locally. Falls through to localStorage on
 * vault unreachable.
 */
export async function revokeLensAsync(scope: string): Promise<void> {
  const current = loadIntentProfile();
  if (current === null) return;
  const remaining = grantedScopesFromProfile(current).filter((s) => s !== scope);
  if (remaining.length === 0) {
    await revokeIntentProfileAsync();
    return;
  }
  await saveIntentProfileAsync(buildDemoProfile(remaining));
}
