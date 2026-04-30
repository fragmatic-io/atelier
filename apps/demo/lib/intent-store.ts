// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Demo-only intent profile store.
 *
 * Persists the user's granted lenses to `localStorage` so the onboarding
 * flow has somewhere to write the result of the grant screen and the
 * route gates have somewhere to read it. The shape validates against
 * `@cir/schemas`'s `IntentProfileSchema`, so swapping this for the real
 * vault later is a drop-in replacement.
 *
 * TODO(vault): replace this entire module with a vault-backed client.
 *   In production, intent lives in the user's vault — the app receives
 *   a scoped read token (per `docs/artifacts.md` § "The vault") rather
 *   than reading raw profile JSON from local storage. The wire shape
 *   matches `IntentProfileSchema` so that swap is a one-file change.
 */

import { IntentProfileSchema, type IntentProfile } from '@cir/schemas';

/** localStorage key. Namespaced so the key is unambiguous in DevTools. */
export const INTENT_STORAGE_KEY = 'cir.demo.intent';

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
 * Load the intent profile from local storage. Returns null if absent,
 * unparseable, or schema-invalid. Never throws — corrupt storage is treated
 * as "no profile" so the user is bounced back to onboarding.
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

/** Persist an intent profile. Throws if the profile fails schema validation. */
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
