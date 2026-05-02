// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Density resolver — Wave 11 / Vis-6.
 *
 * `resolveDensity(intent, route)` returns the effective density for a route,
 * applying the precedence:
 *
 *   1. The first `intent.density_overrides` rule whose `route_pattern`
 *      matches the route path.
 *   2. `intent.global_preferences.density` (the user's default).
 *   3. `'comfortable'` (the framework default).
 *
 * Glob syntax (mirrors the convention used by the priority-overrides
 * matcher, but anchored on `/` rather than `.`):
 *   - `*`   matches a single path segment (one stretch of non-`/` chars).
 *   - `**`  matches any number of path segments, including the empty match
 *           and segments containing `/`.
 *   - literal characters match exactly.
 *
 * The walker calls `resolveDensity` ONCE per route render and threads the
 * result to every density-aware component. Components do not re-resolve
 * per-node — that would be a footgun (different parts of the same route
 * would render at different densities).
 */

import type { DensityOverride, IntentProfile } from '@atelier/schemas';
import { DEFAULT_DENSITY, type Density } from './components/density.js';

/**
 * Compile a route-pattern glob to a regular expression. The pattern is split
 * into a simple character-by-character pass: `**` becomes `.*`, `*` becomes
 * `[^/]*`, and every other character is escaped literally. The result is
 * anchored (`^...$`) so the entire route must match.
 *
 * Exported for tests; the runtime always reaches for `matchRouteGlob`.
 */
export function compileRouteGlob(pattern: string): RegExp {
  let out = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        out += '.*';
        i += 1;
      } else {
        out += '[^/]*';
      }
    } else if (
      // Escape regex metacharacters; everything else is a literal.
      ch === '.' ||
      ch === '+' ||
      ch === '?' ||
      ch === '^' ||
      ch === '$' ||
      ch === '(' ||
      ch === ')' ||
      ch === '[' ||
      ch === ']' ||
      ch === '{' ||
      ch === '}' ||
      ch === '|' ||
      ch === '\\' ||
      ch === '/'
    ) {
      out += `\\${ch}`;
    } else if (ch !== undefined) {
      out += ch;
    }
  }
  return new RegExp(`^${out}$`);
}

/**
 * Match a route path against a glob pattern. Returns `true` when the entire
 * route matches the pattern after expanding `*` / `**`. Empty patterns and
 * empty routes never match (a `route_pattern` of `''` is rejected at the
 * schema layer via `z.string().min(1)`).
 */
export function matchRouteGlob(pattern: string, route: string): boolean {
  if (pattern.length === 0 || route.length === 0) return false;
  return compileRouteGlob(pattern).test(route);
}

/**
 * Resolve the effective density for `route` against the user's intent
 * profile. Precedence:
 *
 *   1. The first `density_overrides` rule whose pattern matches the route.
 *   2. `global_preferences.density` if it is one of the canonical values.
 *   3. The framework default (`'comfortable'`).
 *
 * `intent` may be `undefined` (host hasn't wired the vault) — the helper
 * still returns the framework default so callers do not have to defend.
 */
export function resolveDensity(intent: IntentProfile | undefined, route: string): Density {
  if (intent === undefined) return DEFAULT_DENSITY;

  const overrides = intent.density_overrides;
  if (overrides !== undefined) {
    for (const rule of overrides) {
      if (matchRouteGlob(rule.route_pattern, route)) {
        return rule.density;
      }
    }
  }

  const global = intent.global_preferences['density'];
  if (global === 'compact' || global === 'comfortable' || global === 'spacious') {
    return global;
  }
  return DEFAULT_DENSITY;
}

/**
 * Re-export so consumers don't have to dual-import from
 * `./components/density.js` AND this file when they want the type.
 */
export type { Density } from './components/density.js';
export { DEFAULT_DENSITY } from './components/density.js';

/**
 * Re-export the schema type for the same reason.
 */
export type { DensityOverride };
