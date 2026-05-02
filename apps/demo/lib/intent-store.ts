// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Demo intent profile store — vault-backed with a localStorage fallback.
 *
 * Wave 7 / track V-1 swapped this module from "localStorage shim" to a
 * `@atelier/vault-client` wrapper. The sync API (`loadIntentProfile`,
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
  VaultResponseError,
  VaultUnauthorizedError,
  VaultUnreachableError,
  type VaultTokenStorage,
} from '@atelier/vault-client';
import { IntentProfileSchema, type IntentProfile } from '@atelier/schemas';

/** localStorage key. Namespaced so the key is unambiguous in DevTools. */
export const INTENT_STORAGE_KEY = 'cir.demo.intent';

/** localStorage key the vault token is persisted under. */
export const VAULT_TOKEN_STORAGE_KEY = 'cir.demo.vault.token';

/** localStorage key the demo tracks minted grant jtis under (for revoke-all). */
export const VAULT_GRANT_JTI_REGISTRY_KEY = 'cir.demo.vault.jtis';

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

/** Default user_id used by the demo. Matches `atelier-providers.tsx`. */
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

/**
 * Test-only: reset the cached client. The intent-store unit tests do not
 * touch this; the integration eval calls it to inject a stubbed client.
 */
export function _resetVaultClientForTesting(): void {
  cachedClient = null;
}

/**
 * Read the per-app jti registry (the set of grants the demo minted on this
 * device). Returns [] when none. Used by `revokeIntentProfileAsync` to
 * issue a `DELETE /vault/grants/:jti` per minted token.
 */
export function trackedGrantJtis(): string[] {
  const s = getStorage();
  if (s === null) return [];
  const raw = s.getItem(VAULT_GRANT_JTI_REGISTRY_KEY);
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string' && x.length > 0);
  } catch {
    return [];
  }
}

/** Append a jti to the registry. Idempotent — duplicates are dropped. */
export function trackGrantJti(jti: string): void {
  if (jti.length === 0) return;
  const s = getStorage();
  if (s === null) return;
  const existing = trackedGrantJtis();
  if (existing.includes(jti)) return;
  s.setItem(VAULT_GRANT_JTI_REGISTRY_KEY, JSON.stringify([...existing, jti]));
}

/** Clear the registry. Called after revoke-all. */
export function clearTrackedGrantJtis(): void {
  const s = getStorage();
  if (s === null) return;
  s.removeItem(VAULT_GRANT_JTI_REGISTRY_KEY);
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
  storage.removeItem(VAULT_GRANT_JTI_REGISTRY_KEY);
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
 * Persist an intent profile via the vault.
 *
 * Wave 8 / V-3 update: the grant must already be minted (the consent dance
 * runs BEFORE save). We assume a token is in `tokenStorage`; if not,
 * `patchProfile` will throw `VaultUnauthorizedError` and the caller routes
 * to the consent screen.
 *
 * If the vault has no profile for this user yet (404 on PATCH), the demo
 * falls back to localStorage as a baseline so the route gates have
 * something to gate on. Production deployments seed the vault out-of-band
 * (e.g. a sign-up flow on the vault host) so this path doesn't fire.
 *
 * On vault unreachable + fallback enabled: write to localStorage only.
 */
export async function saveIntentProfileAsync(profile: IntentProfile): Promise<void> {
  const client = getVaultClient();
  try {
    if (client.getToken() === null) {
      // No token. The caller forgot to run the consent flow; mirror to
      // localStorage so the user isn't stuck, but log loudly because this
      // is a programming error in the host integration.
      console.error(
        '[cir-demo] saveIntentProfileAsync called with no token — did the consent flow complete? Falling back to localStorage.',
      );
      saveIntentProfile(profile);
      return;
    }
    await client.patchProfile({
      lenses: profile.lenses,
      vocabulary: profile.vocabulary,
      global_preferences: profile.global_preferences,
      rules: profile.rules,
    });
    saveIntentProfile(profile); // mirror to localStorage
  } catch (err) {
    if (err instanceof VaultResponseError && err.status === 404) {
      // Vault has no profile for this user yet. The reference vault dev
      // server doesn't auto-seed; we mirror locally and surface a hint.
      console.warn(
        '[cir-demo] vault has no profile for this user yet (PATCH 404); persisted to localStorage. Seed the vault via storage.putProfile() to use the vault for reads.',
      );
      saveIntentProfile(profile);
      return;
    }
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

/** Async variant of `revokeIntentProfile`. Calls the vault, then clears local.
 *
 * Wave 8 / V-3: reaches the vault's `DELETE /vault/grants/:jti` for every
 * known jti the demo minted. The reference demo only mints one token at a
 * time so this is a single call today; the multi-jti registry shape is
 * future-proofing for when the demo asks for multiple narrowly-scoped
 * tokens. The vault emits `system.security_revocation` per revocation;
 * subscribed runtimes invalidate manifests compiled from the affected
 * slice. */
export async function revokeIntentProfileAsync(): Promise<void> {
  const client = getVaultClient();
  const jtis = trackedGrantJtis();
  // Always include the active token's jti even if it isn't in the registry
  // (tracked list may be stale across older sessions).
  const activeJti = client.getActiveJti();
  if (activeJti !== null && !jtis.includes(activeJti)) jtis.push(activeJti);
  let lastErr: unknown = null;
  for (const jti of jtis) {
    try {
      await client.revokeGrant(jti);
    } catch (err) {
      if (!shouldFallBack(err) && !(err instanceof VaultUnauthorizedError)) {
        lastErr = err;
      }
    }
  }
  // Clear the registry + local profile regardless of vault outcome — we want
  // the local UI to reflect "revoked" even when the vault was unreachable.
  clearTrackedGrantJtis();
  revokeIntentProfile();
  if (lastErr !== null) throw lastErr;
}

/**
 * Async variant of `revokeLens`.
 *
 * Wave 8 / V-3: real revocation. The current token covers the entire
 * granted scope set, so revoking a single lens means revoking the active
 * token at the vault (which fires `system.security_revocation` →
 * subscribed runtimes invalidate the affected manifests) and clearing the
 * local mirror. The user is then bounced back through the consent flow to
 * re-grant the reduced scope set.
 *
 * Returns `true` when the caller should bounce to `/onboarding` for a
 * fresh consent dance, `false` when the profile was cleared entirely (also
 * routes to onboarding).
 */
export async function revokeLensAsync(scope: string): Promise<{ shouldReGrant: boolean }> {
  const current = loadIntentProfile();
  if (current === null) return { shouldReGrant: false };
  const remaining = grantedScopesFromProfile(current).filter((s) => s !== scope);
  // Always revoke the current token at the vault — the token covers all
  // currently granted scopes, so any reduction needs to revoke the broad
  // grant before re-minting a narrower one.
  await revokeIntentProfileAsync();
  // The profile is gone locally. If there were remaining scopes, the
  // caller redirects to /onboarding which will re-prompt for consent.
  return { shouldReGrant: remaining.length > 0 };
}
