// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
// @vitest-environment happy-dom
/**
 * Tests for the demo's grant-redirect kickoff + callback (Wave 8 / V-3).
 *
 * Exercises:
 *   - `buildConsentUrl` shapes the URL with the right query fields.
 *   - `readCallbackResult` decodes `?token=` / `?error=` correctly.
 *   - `consumeGrantCallback` persists the token + clears intended-target.
 *   - The intended target is preserved across the round-trip.
 *
 * These are pure-helper tests — they do not depend on the live vault
 * server. End-to-end coverage (real consent screen → real callback) is the
 * Playwright suite's job.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildConsentUrl,
  consumeGrantCallback,
  readCallbackResult,
  GRANT_CALLBACK_PATH,
  GRANT_INTENDED_TARGET_KEY,
  type CallbackStorage,
} from '../lib/intent-grant';

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('buildConsentUrl', () => {
  it('produces a well-formed consent URL with the right query fields', () => {
    const url = buildConsentUrl({
      vaultUrl: 'http://localhost:4001',
      appId: 'cir.demo',
      scopes: ['lens.today', 'vocabulary.read'],
      redirect: 'http://localhost:3000/onboarding/grant-callback',
      purpose: 'demo onboarding',
    });
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('http://localhost:4001/vault/consent');
    expect(parsed.searchParams.get('app_id')).toBe('cir.demo');
    expect(parsed.searchParams.get('scopes')).toBe('lens.today,vocabulary.read');
    expect(parsed.searchParams.get('redirect')).toBe(
      'http://localhost:3000/onboarding/grant-callback',
    );
    expect(parsed.searchParams.get('purpose')).toBe('demo onboarding');
  });

  it('strips trailing slashes off the vault URL', () => {
    const url = buildConsentUrl({
      vaultUrl: 'http://localhost:4001/',
      appId: 'cir.demo',
      scopes: ['lens.today'],
      redirect: 'http://localhost:3000/cb',
    });
    expect(url.startsWith('http://localhost:4001/vault/consent?')).toBe(true);
  });

  it('omits optional purpose when not provided', () => {
    const url = buildConsentUrl({
      vaultUrl: 'http://localhost:4001',
      appId: 'cir.demo',
      scopes: ['lens.today'],
      redirect: 'http://localhost:3000/cb',
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get('purpose')).toBeNull();
  });

  it('includes user_id when provided', () => {
    const url = buildConsentUrl({
      vaultUrl: 'http://localhost:4001',
      appId: 'cir.demo',
      scopes: ['lens.today'],
      redirect: 'http://localhost:3000/cb',
      userId: 'demo-user',
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get('user_id')).toBe('demo-user');
  });
});

describe('readCallbackResult', () => {
  it('returns approved when token is present', () => {
    const r = readCallbackResult({
      query: { token: 'header.payload.signature' },
      intended: '/today',
    });
    expect(r.kind).toBe('approved');
    if (r.kind === 'approved') {
      expect(r.token).toBe('header.payload.signature');
      expect(r.intended).toBe('/today');
    }
  });

  it('returns denied when error=denied is set', () => {
    const r = readCallbackResult({ query: { error: 'denied' }, intended: '/today' });
    expect(r.kind).toBe('denied');
  });

  it('returns missing when no recognised fields are present', () => {
    const r = readCallbackResult({ query: {}, intended: null });
    expect(r.kind).toBe('missing');
  });

  it('falls back to /today when intended is null', () => {
    const r = readCallbackResult({ query: { token: 'x.y.z' }, intended: null });
    if (r.kind === 'approved') {
      expect(r.intended).toBe('/today');
    } else {
      throw new Error('expected approved');
    }
  });
});

function fakeStorage(): CallbackStorage & { writes: string[]; intended: string | null } {
  const state = {
    writes: [] as string[],
    intended: null as string | null,
  };
  return {
    writes: state.writes,
    get intended() {
      return state.intended;
    },
    set intended(v: string | null) {
      state.intended = v;
    },
    setToken(t: string): void {
      state.writes.push(t);
    },
    takeIntendedTarget(): string | null {
      const v = state.intended;
      state.intended = null;
      return v;
    },
  };
}

describe('consumeGrantCallback', () => {
  it('persists the token + clears intended target on approve', () => {
    const storage = fakeStorage();
    storage.intended = '/onboarding/review';
    const r = consumeGrantCallback({
      query: { token: 'h.p.s' },
      storage,
    });
    expect(r.kind).toBe('approved');
    if (r.kind === 'approved') {
      expect(r.intended).toBe('/onboarding/review');
      expect(r.token).toBe('h.p.s');
    }
    expect(storage.writes).toEqual(['h.p.s']);
    // Intended target was consumed.
    expect(storage.intended).toBeNull();
  });

  it('does NOT persist a token on deny', () => {
    const storage = fakeStorage();
    storage.intended = '/today';
    const r = consumeGrantCallback({
      query: { error: 'denied' },
      storage,
    });
    expect(r.kind).toBe('denied');
    expect(storage.writes).toEqual([]);
  });

  it('falls back to /today when no intended target was stashed', () => {
    const storage = fakeStorage();
    const r = consumeGrantCallback({
      query: { token: 'h.p.s' },
      storage,
    });
    if (r.kind === 'approved') {
      expect(r.intended).toBe('/today');
    } else {
      throw new Error('expected approved');
    }
  });

  it('preserves the intended target across the round-trip', () => {
    // Set the intended via sessionStorage to mirror the real production
    // flow (real `defaultCallbackStorage` reads sessionStorage).
    window.sessionStorage.setItem(GRANT_INTENDED_TARGET_KEY, '/some/where');
    const storage: CallbackStorage = {
      setToken(): void {
        // no-op
      },
      takeIntendedTarget(): string | null {
        const v = window.sessionStorage.getItem(GRANT_INTENDED_TARGET_KEY);
        if (v !== null) window.sessionStorage.removeItem(GRANT_INTENDED_TARGET_KEY);
        return v;
      },
    };
    const r = consumeGrantCallback({
      query: { token: 'a.b.c' },
      storage,
    });
    if (r.kind === 'approved') {
      expect(r.intended).toBe('/some/where');
    } else {
      throw new Error('expected approved');
    }
    // sessionStorage was cleared.
    expect(window.sessionStorage.getItem(GRANT_INTENDED_TARGET_KEY)).toBeNull();
  });
});

describe('GRANT_CALLBACK_PATH constant', () => {
  it('is the well-known callback path the vault redirects to', () => {
    // Trivial but pin-stable: we depend on this in the consent URL we emit.
    expect(GRANT_CALLBACK_PATH).toBe('/onboarding/grant-callback');
  });
});
