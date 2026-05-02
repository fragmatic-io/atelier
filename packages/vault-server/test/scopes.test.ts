// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { describe, expect, it } from 'vitest';
import {
  authorizeWrite,
  filterProfileForRead,
  parseScope,
  parseScopeClaim,
} from '../src/scopes.js';
import type { IntentProfile } from '@atelier/schemas';

const PROFILE: IntentProfile = {
  user_id: 'demo-user',
  profile_version: 1,
  updated_at: '2026-04-30T00:00:00.000Z',
  global_preferences: {
    density: 'comfortable',
    granted_scopes: ['lens.today', 'vocabulary.read'],
  },
  lenses: { today: 'default', thread: 'compact', github: 'tableview' },
  rules: [
    { scope: 'today', rule: 'mark Sundays as read', version: 0 },
    { scope: 'github', rule: 'highlight my reviews', version: 0 },
    { scope: '*', rule: 'never auto-archive without confirm', version: 0, locked: true },
  ],
  vocabulary: { me: 'Vid', spouse: 'P' },
  cross_app_workflows: [{ name: 'wf', trigger: 'fri', uses: ['email.starred'] }],
};

describe('parseScope', () => {
  it('parses lens.<domain>', () => {
    expect(parseScope('lens.github')).toEqual({
      category: 'lens',
      domain: 'github',
      raw: 'lens.github',
    });
  });

  it('parses lens.<domain>.write', () => {
    expect(parseScope('lens.github.write')).toEqual({
      category: 'lens',
      domain: 'github',
      modifier: 'write',
      raw: 'lens.github.write',
    });
  });

  it('parses vocabulary.read', () => {
    expect(parseScope('vocabulary.read').modifier).toBe('read');
  });

  it('parses rules.append', () => {
    expect(parseScope('rules.append').modifier).toBe('append');
  });

  it('parses preferences.write', () => {
    expect(parseScope('preferences.write').modifier).toBe('write');
  });

  it('marks unknown scopes as such', () => {
    expect(parseScope('bogus.scope').category).toBe('unknown');
    expect(parseScope('lens').category).toBe('unknown'); // lens with no domain
    expect(parseScope('lens.github.weird').category).toBe('unknown');
  });

  it('parses the space-separated scope claim', () => {
    const parsed = parseScopeClaim('lens.today vocabulary.read');
    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.category).toBe('lens');
    expect(parsed[1]?.modifier).toBe('read');
  });

  it('tolerates extra whitespace in the claim', () => {
    expect(parseScopeClaim('  lens.today    rules.read ')).toHaveLength(2);
  });
});

describe('filterProfileForRead', () => {
  it('returns only the requested lens domain', () => {
    const sliced = filterProfileForRead(PROFILE, parseScopeClaim('lens.today'));
    expect(Object.keys(sliced.lenses)).toEqual(['today']);
    expect(sliced.lenses['today']).toBe('default');
    expect(sliced.vocabulary).toEqual({});
  });

  it('includes only domain-scoped rules, not global ones', () => {
    const sliced = filterProfileForRead(PROFILE, parseScopeClaim('lens.github'));
    expect(sliced.rules.map((r) => r.rule)).toEqual(['highlight my reviews']);
  });

  it('vocabulary.read includes the vocabulary map', () => {
    const sliced = filterProfileForRead(PROFILE, parseScopeClaim('vocabulary.read'));
    expect(sliced.vocabulary).toEqual({ me: 'Vid', spouse: 'P' });
    expect(Object.keys(sliced.lenses)).toEqual([]);
  });

  it('preferences.read returns full global_preferences', () => {
    const sliced = filterProfileForRead(PROFILE, parseScopeClaim('preferences.read'));
    expect(sliced.global_preferences['density']).toBe('comfortable');
  });

  it('non-preferences readers see only the granted_scopes marker', () => {
    const sliced = filterProfileForRead(PROFILE, parseScopeClaim('lens.today'));
    expect(sliced.global_preferences['granted_scopes']).toBeDefined();
    expect(sliced.global_preferences['density']).toBeUndefined();
  });

  it('vault.admin sees every slice including global rules', () => {
    const sliced = filterProfileForRead(PROFILE, parseScopeClaim('vault.admin'));
    expect(Object.keys(sliced.lenses).sort()).toEqual(['github', 'thread', 'today']);
    expect(sliced.rules).toHaveLength(3); // includes the global '*' rule
    expect(sliced.cross_app_workflows).toHaveLength(1);
  });

  it('rules.read pulls every rule but no lens slices', () => {
    const sliced = filterProfileForRead(PROFILE, parseScopeClaim('rules.read'));
    expect(sliced.rules).toHaveLength(3);
    expect(sliced.lenses).toEqual({});
  });

  it('preserves header fields verbatim', () => {
    const sliced = filterProfileForRead(PROFILE, parseScopeClaim('lens.today'));
    expect(sliced.user_id).toBe('demo-user');
    expect(sliced.profile_version).toBe(1);
    expect(sliced.updated_at).toBe('2026-04-30T00:00:00.000Z');
  });
});

describe('authorizeWrite', () => {
  it('admits a lens write only for granted domains', () => {
    const { allowed, denied } = authorizeWrite(
      { lenses: { today: 'compact-cards', github: 'tableview' } },
      parseScopeClaim('lens.today'),
    );
    expect(allowed.lenses).toEqual({ today: 'compact-cards' });
    // The patch named github but the scope didn't cover it; we strip + admit
    // the partial. The server-level rule rejects the request when `denied`
    // is non-empty, but the function itself is allow-list filter.
    expect(denied).toEqual([]);
  });

  it('rejects a vocabulary write without vocabulary.write', () => {
    const { allowed, denied } = authorizeWrite(
      { vocabulary: { me: 'V' } },
      parseScopeClaim('vocabulary.read'),
    );
    expect(allowed.vocabulary).toBeUndefined();
    expect(denied).toEqual(['vocabulary']);
  });

  it('admits a vocabulary write with the right scope', () => {
    const { allowed, denied } = authorizeWrite(
      { vocabulary: { me: 'V' } },
      parseScopeClaim('vocabulary.write'),
    );
    expect(allowed.vocabulary).toEqual({ me: 'V' });
    expect(denied).toEqual([]);
  });

  it('rejects a rules patch without rules.append', () => {
    const { denied } = authorizeWrite(
      { rules: [{ scope: 'today', rule: 'x', version: 0 }] },
      parseScopeClaim('lens.today'),
    );
    expect(denied).toEqual(['rules']);
  });

  it('admits a rules patch with rules.append', () => {
    const { allowed } = authorizeWrite(
      { rules: [{ scope: 'today', rule: 'x', version: 0 }] },
      parseScopeClaim('rules.append'),
    );
    expect(allowed.rules).toBeDefined();
  });

  it('lens.<domain>.read does NOT permit writes', () => {
    const { denied } = authorizeWrite(
      { lenses: { today: 'x' } },
      parseScopeClaim('lens.today.read'),
    );
    expect(denied).toEqual(['lenses']);
  });

  it('lens.<domain> (bare) permits writes', () => {
    const { allowed, denied } = authorizeWrite(
      { lenses: { today: 'x' } },
      parseScopeClaim('lens.today'),
    );
    expect(allowed.lenses).toEqual({ today: 'x' });
    expect(denied).toEqual([]);
  });

  it('rejects writes to header fields', () => {
    // We construct the patch shape with `as unknown as Partial<IntentProfile>`
    // because the schema's header fields aren't writable through this code
    // path; the test pins that they'd be denied if they did slip through.
    const patch = {
      user_id: 'someone-else',
      profile_version: 999,
    } as unknown as Parameters<typeof authorizeWrite>[0];
    const { denied } = authorizeWrite(patch, parseScopeClaim('vault.admin'));
    expect(denied).toContain('user_id');
    expect(denied).toContain('profile_version');
  });
});
