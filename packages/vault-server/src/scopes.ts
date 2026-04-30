// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Scope parsing + profile filtering.
 *
 * The vault speaks four scope categories:
 *
 *   lens.<domain>          read + write the `lenses[domain]` slice plus rules
 *                          whose `scope === domain`. The unsuffixed form is
 *                          the canonical user-facing scope.
 *   lens.<domain>.read     read-only variant (excludes write).
 *   vocabulary.read        read the entire vocabulary map.
 *   vocabulary.write       full-replace writes to the vocabulary keys named
 *                          in the patch.
 *   rules.read             read the entire `rules` array.
 *   rules.append           append-only access (patch may add new entries
 *                          but cannot remove or modify existing ones).
 *   preferences.read       read `global_preferences`.
 *   preferences.write      write the named keys in `global_preferences`.
 *   vault.admin            administrative (revoke any grant). Reference
 *                          server does not mint this today.
 *
 * Filtering is allow-listed: if no scope covers a top-level field, the
 * field is omitted from the response (NOT 401'd). This lets one token
 * legitimately read multiple slices and the others fall away cleanly.
 */

import type { IntentProfile, IntentRule } from '@cir/schemas';

/** A parsed scope. Tokens carry the original strings; this is the workable form. */
export interface ParsedScope {
  category: 'lens' | 'vocabulary' | 'rules' | 'preferences' | 'vault' | 'unknown';
  /** For `lens.<domain>`, the domain. Undefined for non-lens scopes. */
  domain?: string;
  /** Either an explicit `read` / `write` / `append` / `admin`, or undefined for the bare form. */
  modifier?: 'read' | 'write' | 'append' | 'admin';
  /** The raw scope string for debugging / pass-through. */
  raw: string;
}

const KNOWN_CATEGORIES = new Set(['lens', 'vocabulary', 'rules', 'preferences', 'vault']);
const KNOWN_MODIFIERS = new Set(['read', 'write', 'append', 'admin']);

/** Parse one scope string. Unknown shapes parse to `category: 'unknown'`. */
export function parseScope(raw: string): ParsedScope {
  const parts = raw.split('.');
  const head = parts[0];
  if (head === undefined || !KNOWN_CATEGORIES.has(head)) {
    return { category: 'unknown', raw };
  }
  const category = head as ParsedScope['category'];
  if (category === 'lens') {
    // lens.<domain> | lens.<domain>.read | lens.<domain>.write
    const domain = parts[1];
    if (domain === undefined || domain.length === 0) {
      return { category: 'unknown', raw };
    }
    const tail = parts[2];
    if (tail === undefined) {
      return { category: 'lens', domain, raw };
    }
    if (tail === 'read' || tail === 'write') {
      return { category: 'lens', domain, modifier: tail, raw };
    }
    return { category: 'unknown', raw };
  }
  // vocabulary, rules, preferences, vault — second segment is the modifier.
  const mod = parts[1];
  if (mod === undefined) {
    return { category, raw };
  }
  if (KNOWN_MODIFIERS.has(mod)) {
    return { category, modifier: mod as 'read' | 'write' | 'append' | 'admin', raw };
  }
  return { category: 'unknown', raw };
}

/** Parse a space-separated scope string (the JWT `scope` claim format). */
export function parseScopeClaim(scopeClaim: string): ParsedScope[] {
  return scopeClaim
    .split(/\s+/)
    .filter((s) => s.length > 0)
    .map(parseScope);
}

/** Does the scope set authorize reading the given top-level field? */
function canReadField(scopes: readonly ParsedScope[], field: keyof IntentProfile): boolean {
  for (const s of scopes) {
    switch (field) {
      case 'lenses':
      case 'rules': {
        // Any lens scope (read or write) implicitly grants read of `lenses` and
        // the rules whose `scope === domain`. A bare `rules.read` or
        // `rules.append` covers the full rules array.
        if (s.category === 'lens') return true;
        if (s.category === 'rules') return true;
        break;
      }
      case 'vocabulary':
        if (s.category === 'vocabulary') return true;
        break;
      case 'global_preferences':
        if (s.category === 'preferences') return true;
        // The demo persists a `granted_scopes` marker in global_preferences;
        // every grant carries a "you can see what you were granted" implicit
        // read of that key. We over-grant and re-filter below in `filterProfileForRead`.
        if (s.category === 'lens' || s.category === 'vocabulary') return true;
        break;
      case 'cross_app_workflows':
        // Workflows are user-private; only an explicit `vault.admin` reads.
        if (s.category === 'vault' && s.modifier === 'admin') return true;
        break;
      case 'compile_budget':
      case 'priority_rules':
        // Read with `preferences.read` (these tune compile + render behavior).
        if (s.category === 'preferences') return true;
        break;
      default:
        // user_id, tenant_id, profile_version, updated_at — header fields,
        // always readable for any valid token.
        return true;
    }
  }
  return false;
}

/**
 * Project the read-allowed view of a profile through a scope set. Header
 * fields (`user_id`, `profile_version`, `updated_at`) always pass through;
 * top-level slices are filtered allow-list-style; within `lenses`, only the
 * domains the scopes name appear, and within `rules`, only entries whose
 * `scope` is covered.
 */
export function filterProfileForRead(
  profile: IntentProfile,
  scopes: readonly ParsedScope[],
): IntentProfile {
  const lensDomains = new Set<string>();
  let allLenses = false;
  let allRules = false;
  for (const s of scopes) {
    if (s.category === 'lens') {
      if (s.domain !== undefined) lensDomains.add(s.domain);
    }
    if (s.category === 'rules') allRules = true;
    if (s.category === 'vault' && s.modifier === 'admin') {
      allLenses = true;
      allRules = true;
    }
  }

  // Build the projected profile. We preserve header fields verbatim so
  // recipients can audit who/when/which version they're seeing.
  const out: IntentProfile = {
    user_id: profile.user_id,
    profile_version: profile.profile_version,
    updated_at: profile.updated_at,
    global_preferences: {},
    lenses: {},
    rules: [],
    vocabulary: {},
  };
  if (profile.tenant_id !== undefined) out.tenant_id = profile.tenant_id;

  // global_preferences: one of {preferences, lens, vocabulary} grants partial
  // visibility. `preferences` reads the full map; lens/vocabulary readers only
  // see the demo's `granted_scopes` marker (so the UI knows what to show).
  if (canReadField(scopes, 'global_preferences')) {
    const hasPrefsScope = scopes.some((s) => s.category === 'preferences');
    if (hasPrefsScope) {
      out.global_preferences = { ...profile.global_preferences };
    } else {
      // Surface only the granted_scopes marker for non-preferences readers.
      const marker = profile.global_preferences['granted_scopes'];
      if (marker !== undefined) out.global_preferences['granted_scopes'] = marker;
    }
  }

  // lenses: filter to authorized domains.
  if (allLenses || lensDomains.size > 0) {
    const next: Record<string, string> = {};
    for (const [domain, lens] of Object.entries(profile.lenses)) {
      if (allLenses || lensDomains.has(domain)) next[domain] = lens;
    }
    out.lenses = next;
  }

  // rules: include entries whose `scope` is allowed. `scope === '*'` (global)
  // is included only when `vault.admin` grants full access — global rules
  // affect every domain so a single-lens reader should not see them.
  if (allRules || lensDomains.size > 0) {
    out.rules = profile.rules.filter((rule: IntentRule) => {
      if (allRules) return true;
      if (rule.scope === '*') return false;
      return lensDomains.has(rule.scope);
    });
  }

  // vocabulary: only with `vocabulary.read`.
  if (canReadField(scopes, 'vocabulary')) {
    out.vocabulary = { ...profile.vocabulary };
  }

  // cross_app_workflows: vault.admin only.
  if (canReadField(scopes, 'cross_app_workflows') && profile.cross_app_workflows !== undefined) {
    out.cross_app_workflows = [...profile.cross_app_workflows];
  }

  // compile_budget + priority_rules: preferences readers see them.
  if (canReadField(scopes, 'compile_budget') && profile.compile_budget !== undefined) {
    out.compile_budget = profile.compile_budget;
  }
  if (canReadField(scopes, 'priority_rules') && profile.priority_rules !== undefined) {
    out.priority_rules = [...profile.priority_rules];
  }

  return out;
}

/**
 * Result of a write authorization check. `allowed` is the patch with
 * unauthorized keys stripped; `denied` is the list of keys that were
 * present in the patch but not covered by any scope.
 */
export interface WriteCheck {
  allowed: Partial<IntentProfile>;
  denied: string[];
}

/**
 * Authorize a patch against the scope set. Each top-level key in the patch
 * is checked independently. Keys without a covering scope are dropped and
 * surfaced in `denied` so the server can return a 403 with concrete fields
 * (callers that want strict semantics should reject when `denied.length > 0`;
 * the reference server rejects the request rather than partially-applying).
 */
export function authorizeWrite(
  patch: Partial<IntentProfile>,
  scopes: readonly ParsedScope[],
): WriteCheck {
  const allowed: Partial<IntentProfile> = {};
  const denied: string[] = [];

  for (const [key, value] of Object.entries(patch)) {
    const k = key as keyof IntentProfile;
    let ok = false;
    switch (k) {
      case 'lenses': {
        // Need at least one lens scope. Within the patch, every domain the
        // patch names must be covered by either a write-capable lens scope
        // for that domain, or vault.admin.
        const lensesPatch = value as Record<string, string>;
        const writableDomains = new Set<string>();
        let admin = false;
        for (const s of scopes) {
          if (s.category === 'vault' && s.modifier === 'admin') admin = true;
          // Bare `lens.<domain>` and `lens.<domain>.write` both grant write.
          if (s.category === 'lens' && s.domain !== undefined && s.modifier !== 'read') {
            writableDomains.add(s.domain);
          }
        }
        const filtered: Record<string, string> = {};
        let anyDomainOk = false;
        for (const [domain, lensVal] of Object.entries(lensesPatch)) {
          if (admin || writableDomains.has(domain)) {
            filtered[domain] = lensVal;
            anyDomainOk = true;
          }
        }
        if (anyDomainOk) {
          allowed.lenses = filtered;
          ok = true;
        }
        break;
      }
      case 'vocabulary': {
        if (
          scopes.some(
            (s) =>
              (s.category === 'vocabulary' && s.modifier === 'write') ||
              (s.category === 'vault' && s.modifier === 'admin'),
          )
        ) {
          allowed.vocabulary = value as Record<string, unknown>;
          ok = true;
        }
        break;
      }
      case 'rules': {
        // `rules.append` allows additions only — diff is enforced server-side
        // in `applyPatch` because we need the prior state. Here we just admit
        // the patch when the scope is present.
        if (
          scopes.some(
            (s) =>
              (s.category === 'rules' && s.modifier === 'append') ||
              (s.category === 'vault' && s.modifier === 'admin'),
          )
        ) {
          allowed.rules = value as IntentRule[];
          ok = true;
        }
        break;
      }
      case 'global_preferences': {
        if (
          scopes.some(
            (s) =>
              (s.category === 'preferences' && s.modifier === 'write') ||
              (s.category === 'vault' && s.modifier === 'admin'),
          )
        ) {
          allowed.global_preferences = value as Record<string, unknown>;
          ok = true;
        }
        break;
      }
      // Header fields are not writable through the patch endpoint.
      default:
        ok = false;
    }
    if (!ok) denied.push(key);
  }

  return { allowed, denied };
}
