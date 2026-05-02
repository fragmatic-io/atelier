// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Wave 11 / Vis-6 — `resolveDensity` precedence tests.
 *
 * The resolver must apply this order:
 *   1. The first `density_overrides` rule whose `route_pattern` matches.
 *   2. `intent.global_preferences.density` if set to a canonical value.
 *   3. The framework default `'comfortable'`.
 *
 * The glob matcher mirrors shell-style globs: `*` is a single segment
 * (no `/`), `**` spans any number of segments, literal characters match
 * exactly. The matcher is anchored — partial matches do not count.
 */
import { describe, expect, it } from 'vitest';
import type { IntentProfile } from '@atelier/schemas';
import { compileRouteGlob, matchRouteGlob, resolveDensity } from '../src/density-resolver.js';

function intent(profile: Partial<IntentProfile>): IntentProfile {
  return {
    user_id: 'test-user',
    profile_version: 1,
    updated_at: '2026-05-02T00:00:00Z',
    global_preferences: {},
    lenses: {},
    rules: [],
    vocabulary: {},
    ...profile,
  };
}

describe('matchRouteGlob', () => {
  it('matches a literal route', () => {
    expect(matchRouteGlob('/admin/queues', '/admin/queues')).toBe(true);
  });

  it('does not match a literal that differs', () => {
    expect(matchRouteGlob('/admin/queues', '/admin/queue')).toBe(false);
    expect(matchRouteGlob('/admin/queues', '/admin/queues/123')).toBe(false);
  });

  it('matches a single segment via `*`', () => {
    expect(matchRouteGlob('/admin/*', '/admin/queues')).toBe(true);
    expect(matchRouteGlob('/admin/*', '/admin/users')).toBe(true);
  });

  it('does not let `*` cross a `/`', () => {
    expect(matchRouteGlob('/admin/*', '/admin/queues/123')).toBe(false);
    expect(matchRouteGlob('/admin/*', '/admin')).toBe(false);
  });

  it('matches across segments via `**`', () => {
    expect(matchRouteGlob('/admin/**', '/admin/queues')).toBe(true);
    expect(matchRouteGlob('/admin/**', '/admin/queues/123')).toBe(true);
    expect(matchRouteGlob('/admin/**', '/admin/')).toBe(true);
  });

  it('matches `/admin/**` exactly at `/admin/...` boundary only', () => {
    expect(matchRouteGlob('/admin/**', '/admin')).toBe(false);
    expect(matchRouteGlob('/admin/**', '/billing')).toBe(false);
  });

  it('rejects empty pattern or empty route', () => {
    expect(matchRouteGlob('', '/anything')).toBe(false);
    expect(matchRouteGlob('/admin/*', '')).toBe(false);
  });

  it('escapes regex metacharacters in literals', () => {
    // A literal `.` must not behave as the regex any-char.
    expect(matchRouteGlob('/file.json', '/file.json')).toBe(true);
    expect(matchRouteGlob('/file.json', '/fileXjson')).toBe(false);
  });

  it('compileRouteGlob is exported and produces the right anchored regex', () => {
    const re = compileRouteGlob('/admin/*');
    expect(re.test('/admin/queues')).toBe(true);
    expect(re.test('/admin')).toBe(false);
    expect(re.test('xx/admin/queues')).toBe(false);
  });
});

describe('resolveDensity precedence', () => {
  it('returns the framework default when intent is undefined', () => {
    expect(resolveDensity(undefined, '/anything')).toBe('comfortable');
  });

  it('returns the framework default when no preference is set', () => {
    expect(resolveDensity(intent({}), '/anything')).toBe('comfortable');
  });

  it('honours `global_preferences.density` when no override matches', () => {
    expect(
      resolveDensity(intent({ global_preferences: { density: 'compact' } }), '/anything'),
    ).toBe('compact');
  });

  it('falls through to the default when global_preferences.density is non-canonical', () => {
    expect(
      resolveDensity(intent({ global_preferences: { density: 'mega-cramped' } }), '/anything'),
    ).toBe('comfortable');
  });

  it('an override that matches takes precedence over the global preference', () => {
    expect(
      resolveDensity(
        intent({
          global_preferences: { density: 'comfortable' },
          density_overrides: [{ route_pattern: '/admin/*', density: 'compact' }],
        }),
        '/admin/queues',
      ),
    ).toBe('compact');
  });

  it('the FIRST matching override wins when multiple match', () => {
    expect(
      resolveDensity(
        intent({
          global_preferences: { density: 'comfortable' },
          density_overrides: [
            { route_pattern: '/admin/**', density: 'compact' },
            { route_pattern: '/admin/queues', density: 'spacious' },
          ],
        }),
        '/admin/queues',
      ),
    ).toBe('compact');
  });

  it('non-matching overrides fall through to the global preference', () => {
    expect(
      resolveDensity(
        intent({
          global_preferences: { density: 'spacious' },
          density_overrides: [{ route_pattern: '/admin/*', density: 'compact' }],
        }),
        '/today',
      ),
    ).toBe('spacious');
  });

  it('overrides without a matching pattern fall through to the default', () => {
    expect(
      resolveDensity(
        intent({
          density_overrides: [{ route_pattern: '/admin/*', density: 'compact' }],
        }),
        '/today',
      ),
    ).toBe('comfortable');
  });

  it('mixed override densities resolve per-route', () => {
    const profile = intent({
      global_preferences: { density: 'comfortable' },
      density_overrides: [
        { route_pattern: '/admin/**', density: 'compact', reason: 'admin power-user surface' },
        { route_pattern: '/onboarding/**', density: 'spacious', reason: 'first-run surface' },
      ],
    });
    expect(resolveDensity(profile, '/admin/queues/123')).toBe('compact');
    expect(resolveDensity(profile, '/onboarding/welcome')).toBe('spacious');
    expect(resolveDensity(profile, '/today')).toBe('comfortable');
  });

  it('an override with a `reason` is still resolved correctly', () => {
    expect(
      resolveDensity(
        intent({
          density_overrides: [
            { route_pattern: '/admin/*', density: 'compact', reason: 'audit reason' },
          ],
        }),
        '/admin/dashboard',
      ),
    ).toBe('compact');
  });
});
