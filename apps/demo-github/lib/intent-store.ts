// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Intent profile store for `apps/demo-github`. Modelled on
 * `apps/demo/lib/intent-store.ts` but with two demo-specific additions:
 *
 *   1. `loadGitHubToken()` / `saveGitHubToken()` — the GitHub personal
 *      access token lives under `vocabulary.github_token` of the intent
 *      profile, so it inherits the vault's encryption + scoped-grant
 *      semantics. The setting page wires through these.
 *
 *   2. The lens scope set is `lens.today / lens.repos / lens.inbox` —
 *      narrower than apps/demo because the surfaces are different.
 *
 * The sync (localStorage) API is the immediate-render fallback the route
 * gates use; the async API goes through the vault when a token is
 * present. Identical to apps/demo's two-tier shape.
 */

/* eslint-disable no-console */

import {
  MemoryTokenStorage,
  VaultClient,
  VaultResponseError,
  VaultUnauthorizedError,
  VaultUnreachableError,
  type VaultTokenStorage,
} from '@cir/vault-client';
import { IntentProfileSchema, type IntentProfile } from '@cir/schemas';

/** localStorage key. Namespaced for clarity in DevTools. */
export const INTENT_STORAGE_KEY = 'cir.demo-github.intent';
/** localStorage key the vault token is persisted under. */
export const VAULT_TOKEN_STORAGE_KEY = 'cir.demo-github.vault.token';
/** localStorage key the demo tracks minted grant jtis under (for revoke-all). */
export const VAULT_GRANT_JTI_REGISTRY_KEY = 'cir.demo-github.vault.jtis';

/** GitHub token vocabulary key inside the IntentProfile. */
export const GITHUB_TOKEN_VOCAB_KEY = 'github_token';

/** Lens scope set the demo-github asks for. Three surfaces. */
export const DEMO_GITHUB_LENS_SCOPES = [
  {
    id: 'lens.today',
    label: 'Today queue',
    description: 'Issues that need a decision, sorted by salience.',
  },
  {
    id: 'lens.repos',
    label: 'Repository list',
    description: 'Browse repos with hover-card popovers showing recent activity.',
  },
  {
    id: 'lens.inbox',
    label: 'Notifications inbox',
    description: 'Notifications that follow the inbox-zero workflow.',
  },
] as const;

export type DemoGitHubLensScopeId = (typeof DEMO_GITHUB_LENS_SCOPES)[number]['id'];

export const DEMO_USER_ID = 'demo-github-user';
export const DEMO_APP_ID = 'cir.demo-github';

export const DEMO_VAULT_URL =
  (typeof process !== 'undefined' && process.env['NEXT_PUBLIC_VAULT_URL']) ||
  'http://localhost:4001';

export const DEMO_VAULT_FALLBACK_ENABLED =
  (typeof process !== 'undefined' && process.env['NEXT_PUBLIC_VAULT_FALLBACK']) !== 'disabled';

/** Build a minimal `IntentProfile` from a set of granted scope ids. */
export function buildDemoProfile(grantedScopes: readonly string[]): IntentProfile {
  const lenses: Record<string, string> = {};
  if (grantedScopes.includes('lens.today')) lenses['today'] = 'default';
  if (grantedScopes.includes('lens.repos')) lenses['repos'] = 'default';
  if (grantedScopes.includes('lens.inbox')) lenses['inbox'] = 'default';
  return {
    user_id: DEMO_USER_ID,
    profile_version: 1,
    updated_at: new Date().toISOString(),
    global_preferences: { granted_scopes: [...grantedScopes] },
    lenses,
    rules: [],
    vocabulary: {},
    cross_app_workflows: [],
  };
}

export function grantedScopesFromProfile(profile: IntentProfile): string[] {
  const raw = profile.global_preferences['granted_scopes'];
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
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

export function revokeIntentProfile(): void {
  const storage = getStorage();
  if (!storage) return;
  storage.removeItem(INTENT_STORAGE_KEY);
  storage.removeItem(VAULT_TOKEN_STORAGE_KEY);
  storage.removeItem(VAULT_GRANT_JTI_REGISTRY_KEY);
}

export function hasGrantedLens(scope: string): boolean {
  const profile = loadIntentProfile();
  if (!profile) return false;
  return grantedScopesFromProfile(profile).includes(scope);
}

// ---------------------------------------------------------------------------
// GitHub-token (BYO key) — sync helpers
// ---------------------------------------------------------------------------

/**
 * Read the GitHub token stored under `vocabulary.github_token` on the
 * intent profile. Falls back to env so server-side bootstraps still work.
 *
 * The token is treated as opaque — we never log it.
 */
export function loadGitHubToken(): string | null {
  // Server side: the env var is the canonical source.
  if (typeof window === 'undefined') {
    const envToken = process.env['GITHUB_TOKEN'];
    if (envToken && envToken.length > 0) return envToken;
    return null;
  }
  const profile = loadIntentProfile();
  if (!profile) return null;
  const raw = profile.vocabulary[GITHUB_TOKEN_VOCAB_KEY];
  if (typeof raw === 'string' && raw.length > 0) return raw;
  return null;
}

/**
 * Persist the GitHub token under `vocabulary.github_token`. The profile
 * must already exist (the user has gone through onboarding) — we patch
 * the existing entry rather than minting a new profile.
 *
 * Logs a single non-secret line on success. Never echoes the token.
 */
export function saveGitHubToken(token: string): void {
  const profile = loadIntentProfile();
  if (!profile) {
    console.error('[cir-demo-github] saveGitHubToken: no intent profile present');
    return;
  }
  const next: IntentProfile = {
    ...profile,
    profile_version: profile.profile_version + 1,
    updated_at: new Date().toISOString(),
    vocabulary: { ...profile.vocabulary, [GITHUB_TOKEN_VOCAB_KEY]: token },
  };
  saveIntentProfile(next);
}

/** Clear the stored token without revoking the profile itself. */
export function clearGitHubToken(): void {
  const profile = loadIntentProfile();
  if (!profile) return;
  const nextVocab = { ...profile.vocabulary };
  delete nextVocab[GITHUB_TOKEN_VOCAB_KEY];
  const next: IntentProfile = {
    ...profile,
    profile_version: profile.profile_version + 1,
    updated_at: new Date().toISOString(),
    vocabulary: nextVocab,
  };
  saveIntentProfile(next);
}

// ---------------------------------------------------------------------------
// Async (vault-backed) variants
// ---------------------------------------------------------------------------

function shouldFallBack(err: unknown): boolean {
  if (err instanceof VaultUnreachableError && DEMO_VAULT_FALLBACK_ENABLED) {
    console.error(
      `[cir-demo-github] vault unreachable at ${DEMO_VAULT_URL}; falling back to localStorage. Set NEXT_PUBLIC_VAULT_FALLBACK=disabled to fail closed.`,
    );
    return true;
  }
  return false;
}

export async function saveGitHubTokenAsync(token: string): Promise<void> {
  const client = getVaultClient();
  const profile = loadIntentProfile();
  if (!profile) {
    console.error('[cir-demo-github] saveGitHubTokenAsync: no profile present');
    return;
  }
  const nextVocab = { ...profile.vocabulary, [GITHUB_TOKEN_VOCAB_KEY]: token };
  try {
    if (client.getToken() === null) {
      saveGitHubToken(token);
      return;
    }
    await client.patchProfile({ vocabulary: nextVocab });
    saveGitHubToken(token);
  } catch (err) {
    if (err instanceof VaultResponseError && err.status === 404) {
      saveGitHubToken(token);
      return;
    }
    if (shouldFallBack(err)) {
      saveGitHubToken(token);
      return;
    }
    if (err instanceof VaultUnauthorizedError) {
      saveGitHubToken(token);
      return;
    }
    throw err;
  }
}
