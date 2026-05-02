// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Demo-side grant kickoff and callback helpers.
 *
 * Wave 8 / track V-3. The host app no longer mints tokens directly via
 * `VaultClient.requestGrant()` — that bypassed the user. Instead, the host
 * REDIRECTS the browser to the vault's `/vault/consent` screen. The user
 * approves there; the vault mints a token + redirects back to the
 * configured callback with `?token=...`. The callback page calls
 * `consumeGrantCallback()` to persist the token via the vault client and
 * then routes the user to wherever they were headed.
 *
 * On deny, the vault redirects back with `?error=denied`. The callback
 * surfaces that to the caller.
 *
 * Why a separate file: keeps the grant-redirect plumbing out of
 * `intent-store.ts` (which is now focused on profile read/write) and gives
 * the unit tests a tight surface to exercise without booting Next.js.
 */

import {
  DEMO_APP_ID,
  DEMO_VAULT_FALLBACK_ENABLED,
  DEMO_VAULT_URL,
  VAULT_TOKEN_STORAGE_KEY,
} from './intent-store.js';

/** Path on the demo where the vault redirects back after consent. */
export const GRANT_CALLBACK_PATH = '/onboarding/grant-callback';

/** sessionStorage key the kickoff stashes so the callback knows where to land. */
export const GRANT_INTENDED_TARGET_KEY = 'cir.demo.grant.intended';

/**
 * Build the consent URL the demo redirects the browser to. Pure — used by
 * unit tests that want to verify the URL shape without a live `window`.
 *
 * @param scopes  the scope ids to request
 * @param redirect  fully-qualified redirect URL (the vault appends `?token=` or `?error=`)
 * @param purpose  optional, surfaced on the consent screen
 */
export function buildConsentUrl(input: {
  vaultUrl: string;
  appId: string;
  scopes: readonly string[];
  redirect: string;
  purpose?: string;
  userId?: string;
}): string {
  const url = new URL(`${input.vaultUrl.replace(/\/+$/, '')}/vault/consent`);
  url.searchParams.set('app_id', input.appId);
  url.searchParams.set('scopes', [...input.scopes].join(','));
  url.searchParams.set('redirect', input.redirect);
  if (input.purpose !== undefined) url.searchParams.set('purpose', input.purpose);
  if (input.userId !== undefined) url.searchParams.set('user_id', input.userId);
  return url.toString();
}

/** Decision for `consumeGrantCallback` — returned by reading the URL. */
export type GrantCallbackResult =
  | { kind: 'approved'; token: string; intended: string }
  | { kind: 'denied'; intended: string }
  | { kind: 'missing'; intended: string };

/**
 * Inspect a callback URL's query string + the stashed intended-target. Pure
 * — does NOT touch storage. The caller is the side-effecting wrapper.
 */
export function readCallbackResult(input: {
  query: Record<string, string | undefined>;
  intended: string | null;
}): GrantCallbackResult {
  const intended = input.intended ?? '/today';
  if (typeof input.query['token'] === 'string' && input.query['token'].length > 0) {
    return { kind: 'approved', token: input.query['token'], intended };
  }
  if (input.query['error'] === 'denied') {
    return { kind: 'denied', intended };
  }
  return { kind: 'missing', intended };
}

/**
 * Kick off the grant dance: stash the intended-target in sessionStorage and
 * redirect the browser to the vault's consent screen.
 *
 * Browser-only — calling this in SSR is a programmer error and we throw to
 * make the failure loud.
 */
export function requestGrant(input: {
  scopes: readonly string[];
  intended: string;
  purpose?: string;
  userId?: string;
}): void {
  if (typeof window === 'undefined') {
    throw new Error('requestGrant is browser-only');
  }
  if (DEMO_VAULT_URL.length === 0 || !DEMO_VAULT_FALLBACK_ENABLED) {
    // Production deployments with NEXT_PUBLIC_VAULT_FALLBACK=disabled still
    // want a working flow when the vault URL is set; we only block when the
    // URL is unset AND the fallback is disabled (no path forward).
    if (DEMO_VAULT_URL.length === 0) {
      throw new Error(
        '[cir-demo] NEXT_PUBLIC_VAULT_URL is unset and fallback is disabled. Cannot request a grant.',
      );
    }
  }
  try {
    window.sessionStorage.setItem(GRANT_INTENDED_TARGET_KEY, input.intended);
  } catch {
    // Storage may be unavailable in some privacy modes; the callback falls
    // back to '/today' which is the sensible default for the demo.
  }
  const callback = new URL(GRANT_CALLBACK_PATH, window.location.origin).toString();
  const url = buildConsentUrl({
    vaultUrl: DEMO_VAULT_URL,
    appId: DEMO_APP_ID,
    scopes: input.scopes,
    redirect: callback,
    ...(input.purpose !== undefined ? { purpose: input.purpose } : {}),
    ...(input.userId !== undefined ? { userId: input.userId } : {}),
  });
  window.location.assign(url);
}

/**
 * Storage interface the callback handler needs. Decoupled so unit tests can
 * pass a fake without booting `window.localStorage` / `sessionStorage`.
 */
export interface CallbackStorage {
  setToken(token: string): void;
  takeIntendedTarget(): string | null;
}

/** Build the default `CallbackStorage` for a real browser. SSR-safe (returns no-ops). */
export function defaultCallbackStorage(): CallbackStorage {
  return {
    setToken(token: string): void {
      if (typeof window === 'undefined') return;
      try {
        window.localStorage.setItem(VAULT_TOKEN_STORAGE_KEY, token);
      } catch {
        // localStorage unavailable; we silently drop. The demo will route
        // back through onboarding on next paint because no token is stored.
      }
    },
    takeIntendedTarget(): string | null {
      if (typeof window === 'undefined') return null;
      try {
        const v = window.sessionStorage.getItem(GRANT_INTENDED_TARGET_KEY);
        if (v !== null) {
          window.sessionStorage.removeItem(GRANT_INTENDED_TARGET_KEY);
        }
        return v;
      } catch {
        return null;
      }
    },
  };
}

/**
 * Consume a callback URL: read `?token=` or `?error=`, persist + return a
 * decision the page renders / acts on. Pure-ish — accepts the storage
 * adapter so tests can inject a fake.
 */
export function consumeGrantCallback(input: {
  query: Record<string, string | undefined>;
  storage?: CallbackStorage;
}): GrantCallbackResult {
  const storage = input.storage ?? defaultCallbackStorage();
  const result = readCallbackResult({
    query: input.query,
    intended: storage.takeIntendedTarget(),
  });
  if (result.kind === 'approved') {
    storage.setToken(result.token);
  }
  return result;
}
