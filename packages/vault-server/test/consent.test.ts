// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Tests for the vault consent UI (Wave 8 / track V-3).
 *
 * Covers the full grant dance:
 *   - GET /vault/consent renders the form with the requested scopes,
 *   - POST /vault/consent/approve mints a token + redirects with `?token=`,
 *   - POST /vault/consent/deny redirects with `?error=denied`,
 *   - CSRF nonce binding (HMAC + cookie/form pair),
 *   - malformed redirect rejection,
 *   - invalid app_id rejection,
 *   - nonce expiry behavior,
 *   - parseFormBody / readCookie unit shape.
 */
import { describe, expect, it } from 'vitest';
import {
  CONSENT_NONCE_COOKIE,
  MemoryVaultStorage,
  VaultService,
  deriveCsrfSecret,
  handleConsentRequest,
  handleVaultRequest,
  loadOrGenerateKeyPair,
  mintNonce,
  parseConsentParams,
  parseFormBody,
  readCookie,
  renderConsentPage,
  verifyNonce,
  type VaultRequest,
} from '../src/index.js';

function svc(opts?: { now?: () => number }): VaultService {
  const storage = new MemoryVaultStorage();
  storage.putProfile({
    user_id: 'demo-user',
    profile_version: 1,
    updated_at: '2026-04-30T00:00:00.000Z',
    global_preferences: {},
    lenses: { today: 'default' },
    rules: [],
    vocabulary: {},
  });
  const { pair } = loadOrGenerateKeyPair(undefined);
  return new VaultService({
    storage,
    key: pair,
    issuer: 'https://vault.test',
    ...(opts?.now ? { now: opts.now } : {}),
  });
}

function req(opts: Partial<VaultRequest> & { method: string; path: string }): VaultRequest {
  return {
    method: opts.method,
    path: opts.path,
    query: opts.query ?? {},
    headers: opts.headers ?? {},
    body: opts.body ?? null,
  };
}

describe('parseConsentParams', () => {
  it('parses a well-formed query', () => {
    const p = parseConsentParams({
      app_id: 'cir.demo',
      scopes: 'lens.today,vocabulary.read',
      redirect: 'http://localhost:3000/onboarding/grant-callback',
    });
    expect(p).not.toBeNull();
    expect(p?.appId).toBe('cir.demo');
    expect(p?.scopes).toEqual(['lens.today', 'vocabulary.read']);
  });

  it('rejects a redirect with a non-http scheme', () => {
    expect(
      parseConsentParams({
        app_id: 'cir.demo',
        scopes: 'lens.today',
        redirect: 'javascript:alert(1)',
      }),
    ).toBeNull();
    expect(
      parseConsentParams({
        app_id: 'cir.demo',
        scopes: 'lens.today',
        redirect: 'file:///etc/passwd',
      }),
    ).toBeNull();
  });

  it('rejects an app_id with html-injection-y characters', () => {
    expect(
      parseConsentParams({
        app_id: '<script>',
        scopes: 'lens.today',
        redirect: 'http://localhost:3000/cb',
      }),
    ).toBeNull();
  });

  it('rejects malformed scope identifiers', () => {
    expect(
      parseConsentParams({
        app_id: 'cir.demo',
        scopes: 'lens.today,not a scope',
        redirect: 'http://localhost:3000/cb',
      }),
    ).toBeNull();
  });

  it('rejects empty scope list', () => {
    expect(
      parseConsentParams({
        app_id: 'cir.demo',
        scopes: '',
        redirect: 'http://localhost:3000/cb',
      }),
    ).toBeNull();
  });

  it('rejects missing required fields', () => {
    expect(parseConsentParams({})).toBeNull();
    expect(parseConsentParams({ app_id: 'cir.demo' })).toBeNull();
    expect(parseConsentParams({ app_id: 'cir.demo', scopes: 'lens.today' })).toBeNull();
  });
});

describe('CSRF nonce', () => {
  it('round-trips a freshly minted nonce', () => {
    const secret = Buffer.from('test-secret');
    const nonce = mintNonce(secret, 1_000_000);
    expect(verifyNonce(nonce, secret, 1_000_001)).toBe(true);
  });

  it('rejects a nonce signed with a different secret', () => {
    const a = Buffer.from('a');
    const b = Buffer.from('b');
    const nonce = mintNonce(a, 1_000_000);
    expect(verifyNonce(nonce, b, 1_000_001)).toBe(false);
  });

  it('rejects an expired nonce', () => {
    const secret = Buffer.from('test-secret');
    const nonce = mintNonce(secret, 1_000_000);
    // 11 minutes later
    expect(verifyNonce(nonce, secret, 1_000_000 + 11 * 60)).toBe(false);
  });

  it('rejects malformed nonces', () => {
    const secret = Buffer.from('test-secret');
    expect(verifyNonce('not-a-nonce', secret, 1)).toBe(false);
    expect(verifyNonce('a.b.c.d', secret, 1)).toBe(false);
    expect(verifyNonce('zzz.111.zzz', secret, 1)).toBe(false);
  });
});

describe('parseFormBody + readCookie', () => {
  it('parses a typical form body', () => {
    const f = parseFormBody('app_id=cir.demo&redirect=http%3A%2F%2Flocalhost%2Fcb&csrf_nonce=abc');
    expect(f['app_id']).toBe('cir.demo');
    expect(f['redirect']).toBe('http://localhost/cb');
    expect(f['csrf_nonce']).toBe('abc');
  });

  it('decodes plus-as-space', () => {
    const f = parseFormBody('purpose=email+triage');
    expect(f['purpose']).toBe('email triage');
  });

  it('reads a named cookie out of a Cookie header', () => {
    const v = readCookie(
      { cookie: 'foo=1; cir_vault_consent_nonce=zzz; bar=2' },
      'cir_vault_consent_nonce',
    );
    expect(v).toBe('zzz');
  });

  it('returns undefined when no Cookie header is present', () => {
    expect(readCookie({}, 'cir_vault_consent_nonce')).toBeUndefined();
  });
});

describe('renderConsentPage', () => {
  it('escapes user-controlled fields', () => {
    const html = renderConsentPage({
      params: {
        appId: 'safe.app',
        scopes: ['lens.today'],
        redirect: 'http://localhost/cb',
        purpose: '<script>alert(1)</script>',
      },
      nonce: 'abc.123.def',
      issuer: 'https://vault.test',
      claimsPreview: { aud: 'safe.app' },
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('safe.app');
    expect(html).toContain('lens.today');
  });

  it('emits one hidden input per scope so the form preserves multi-value semantics', () => {
    const html = renderConsentPage({
      params: {
        appId: 'cir.demo',
        scopes: ['lens.today', 'vocabulary.read'],
        redirect: 'http://localhost/cb',
      },
      nonce: 'n',
      issuer: 'https://vault.test',
      claimsPreview: {},
    });
    expect(html).toContain('value="lens.today"');
    expect(html).toContain('value="vocabulary.read"');
  });
});

describe('handleConsentRequest — GET /vault/consent', () => {
  it('renders an HTML form with the requested scopes + sets a CSRF cookie', () => {
    const service = svc();
    const res = handleConsentRequest(
      service,
      req({
        method: 'GET',
        path: '/vault/consent',
        query: {
          app_id: 'cir.demo',
          scopes: 'lens.today,vocabulary.read',
          redirect: 'http://localhost:3000/onboarding/grant-callback',
        },
      }),
    );
    expect(res).not.toBeNull();
    expect(res?.status).toBe(200);
    expect(res?.headers?.['content-type']).toContain('text/html');
    expect(res?.headers?.['set-cookie']).toContain(CONSENT_NONCE_COOKIE);
    expect(res?.rawBody).toContain('cir.demo');
    expect(res?.rawBody).toContain('lens.today');
    expect(res?.rawBody).toContain('vocabulary.read');
    expect(res?.rawBody).toContain('action="/vault/consent/approve"');
  });

  it('400s on a malformed redirect', () => {
    const service = svc();
    const res = handleConsentRequest(
      service,
      req({
        method: 'GET',
        path: '/vault/consent',
        query: {
          app_id: 'cir.demo',
          scopes: 'lens.today',
          redirect: 'javascript:alert(1)',
        },
      }),
    );
    expect(res?.status).toBe(400);
  });

  it('400s on an invalid app_id', () => {
    const service = svc();
    const res = handleConsentRequest(
      service,
      req({
        method: 'GET',
        path: '/vault/consent',
        query: {
          app_id: '<bad>',
          scopes: 'lens.today',
          redirect: 'http://localhost:3000/cb',
        },
      }),
    );
    expect(res?.status).toBe(400);
  });

  it('returns null for non-consent paths so the dispatcher falls through', () => {
    const service = svc();
    const res = handleConsentRequest(service, req({ method: 'GET', path: '/vault/profile' }));
    expect(res).toBeNull();
  });
});

describe('handleConsentRequest — POST /vault/consent/approve', () => {
  it('mints a token + redirects when the CSRF nonce matches', () => {
    const service = svc();
    const secret = deriveCsrfSecret(service);
    const nonce = mintNonce(secret, service.now());
    const formBody = [
      `csrf_nonce=${encodeURIComponent(nonce)}`,
      'app_id=cir.demo',
      'redirect=' + encodeURIComponent('http://localhost:3000/onboarding/grant-callback'),
      'scopes=lens.today',
      'scopes=vocabulary.read',
      'purpose=' + encodeURIComponent('Email triage demo'),
    ].join('&');
    const res = handleConsentRequest(
      service,
      req({
        method: 'POST',
        path: '/vault/consent/approve',
        headers: {
          cookie: `${CONSENT_NONCE_COOKIE}=${nonce}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: formBody,
      }),
    );
    expect(res?.status).toBe(302);
    const location = res?.headers?.['location'];
    expect(location).toBeDefined();
    const url = new URL(location ?? '');
    expect(url.origin + url.pathname).toBe('http://localhost:3000/onboarding/grant-callback');
    const token = url.searchParams.get('token');
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

    // The minted token should round-trip a profile read.
    const verified = service.verifyBearer(token ?? '', 'cir.demo');
    expect(verified.claims.scope).toContain('lens.today');
    expect(verified.claims.scope).toContain('vocabulary.read');
    expect(verified.record.purpose).toBe('Email triage demo');
  });

  it('refuses approval when the CSRF cookie is missing', () => {
    const service = svc();
    const secret = deriveCsrfSecret(service);
    const nonce = mintNonce(secret, service.now());
    const formBody = [
      `csrf_nonce=${encodeURIComponent(nonce)}`,
      'app_id=cir.demo',
      'redirect=' + encodeURIComponent('http://localhost:3000/cb'),
      'scopes=lens.today',
    ].join('&');
    const res = handleConsentRequest(
      service,
      req({
        method: 'POST',
        path: '/vault/consent/approve',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: formBody,
      }),
    );
    expect(res?.status).toBe(403);
  });

  it('refuses approval when the cookie and form nonces disagree', () => {
    const service = svc();
    const secret = deriveCsrfSecret(service);
    const nonceA = mintNonce(secret, service.now());
    const nonceB = mintNonce(secret, service.now());
    const formBody = [
      `csrf_nonce=${encodeURIComponent(nonceA)}`,
      'app_id=cir.demo',
      'redirect=' + encodeURIComponent('http://localhost:3000/cb'),
      'scopes=lens.today',
    ].join('&');
    const res = handleConsentRequest(
      service,
      req({
        method: 'POST',
        path: '/vault/consent/approve',
        headers: {
          cookie: `${CONSENT_NONCE_COOKIE}=${nonceB}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: formBody,
      }),
    );
    expect(res?.status).toBe(403);
  });

  it('refuses an expired CSRF nonce even if the cookie matches', () => {
    let now = 1_000_000;
    const service = svc({ now: () => now });
    const secret = deriveCsrfSecret(service);
    const nonce = mintNonce(secret, now);
    now += 11 * 60; // 11 minutes later
    const formBody = [
      `csrf_nonce=${encodeURIComponent(nonce)}`,
      'app_id=cir.demo',
      'redirect=' + encodeURIComponent('http://localhost:3000/cb'),
      'scopes=lens.today',
    ].join('&');
    const res = handleConsentRequest(
      service,
      req({
        method: 'POST',
        path: '/vault/consent/approve',
        headers: {
          cookie: `${CONSENT_NONCE_COOKIE}=${nonce}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: formBody,
      }),
    );
    expect(res?.status).toBe(403);
  });

  it('rejects approval pointing at a non-http(s) redirect', () => {
    const service = svc();
    const secret = deriveCsrfSecret(service);
    const nonce = mintNonce(secret, service.now());
    const formBody = [
      `csrf_nonce=${encodeURIComponent(nonce)}`,
      'app_id=cir.demo',
      'redirect=' + encodeURIComponent('javascript:alert(1)'),
      'scopes=lens.today',
    ].join('&');
    const res = handleConsentRequest(
      service,
      req({
        method: 'POST',
        path: '/vault/consent/approve',
        headers: {
          cookie: `${CONSENT_NONCE_COOKIE}=${nonce}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: formBody,
      }),
    );
    expect(res?.status).toBe(400);
  });
});

describe('handleConsentRequest — POST /vault/consent/deny', () => {
  it('redirects back with ?error=denied', () => {
    const service = svc();
    const formBody =
      'redirect=' + encodeURIComponent('http://localhost:3000/onboarding/grant-callback');
    const res = handleConsentRequest(
      service,
      req({
        method: 'POST',
        path: '/vault/consent/deny',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: formBody,
      }),
    );
    expect(res?.status).toBe(302);
    const location = res?.headers?.['location'] ?? '';
    expect(location).toContain('error=denied');
  });

  it('rejects a deny without a redirect', () => {
    const service = svc();
    const res = handleConsentRequest(
      service,
      req({
        method: 'POST',
        path: '/vault/consent/deny',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: '',
      }),
    );
    expect(res?.status).toBe(400);
  });
});

describe('handleVaultRequest dispatcher integration', () => {
  it('routes /vault/consent through the consent handler', async () => {
    const service = svc();
    const res = await handleVaultRequest(
      service,
      req({
        method: 'GET',
        path: '/vault/consent',
        query: {
          app_id: 'cir.demo',
          scopes: 'lens.today',
          redirect: 'http://localhost:3000/cb',
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers?.['content-type']).toContain('text/html');
  });

  it('still 404s on completely unknown routes', async () => {
    const service = svc();
    const res = await handleVaultRequest(service, req({ method: 'GET', path: '/no/such/path' }));
    expect(res.status).toBe(404);
  });
});
