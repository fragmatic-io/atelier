// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Vault consent UI — server-rendered HTML for the OAuth-style grant dance.
 *
 * Wave 8 / track V-3. Closes the loop V-1 left open: instead of the host
 * app calling `POST /vault/grants` itself (which bypasses the user), the
 * host redirects the browser to `GET /vault/consent?...` and the vault
 * runs the consent screen. Approve mints a token + redirects back; deny
 * redirects back with `?error=denied`.
 *
 * Why the consent UI lives on the vault side: that is how OAuth-grade flows
 * work. The user trusts the vault. If the host rendered the consent screen
 * the user would be trusting the app to faithfully describe what it is
 * asking for — which is the whole problem CIR is built to solve.
 *
 * Why server-rendered HTML (no React, no JS framework): the vault is not a
 * frontend app. Adding a CSS pipeline / bundler to the vault doubles the
 * dep surface for a one-page form. Hand-rolled `<form>` + `<button>` works
 * across every browser and survives JS-disabled trust modes.
 *
 * CSRF: a per-request HMAC nonce is set as both a cookie AND a hidden form
 * field on the GET. The POST handler requires the two values match and the
 * HMAC is valid against the vault's signing key. Protects against an
 * attacker forging an Approve POST from a malicious page.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import type { VaultRequest, VaultResponse } from './server.js';
import type { VaultService } from './server.js';

/** Description shown alongside the scope id on the consent screen. */
const SCOPE_DESCRIPTIONS: Record<string, string> = {
  'lens.today': 'Read the threads + tasks needed to render the daily decision queue.',
  'lens.thread': 'Read individual email threads when you open them.',
  'lens.github': 'Read the GitHub-flavoured lens for review queues.',
  'lens.shopping': 'Read shopping-tab lens slices.',
  'lens.email': 'Read email-tab lens slices.',
  'vocabulary.read': 'Read your name aliases and time references for friendlier rendering.',
  'vocabulary.write': 'Update your vocabulary entries.',
  'rules.read': 'Read the full rules array.',
  'rules.append': 'Append new rules. Cannot remove or modify existing rules.',
  'preferences.read': 'Read your global preferences (density, color mode, etc.).',
  'preferences.write': 'Update global preferences keys.',
  'vault.admin': 'Administrative access — revoke any grant, full read/write.',
};

/**
 * Best-effort label for a scope id. Pure presentation — the authoritative
 * scope semantics live in `scopes.ts`.
 */
function describeScope(scope: string): string {
  if (SCOPE_DESCRIPTIONS[scope] !== undefined) return SCOPE_DESCRIPTIONS[scope];
  if (scope.startsWith('lens.')) {
    const domain = scope.slice('lens.'.length).split('.')[0];
    return `Read + write the ${domain ?? 'unknown'} lens slice.`;
  }
  return `Custom scope: ${scope}.`;
}

/** Cookie name the consent GET sets and the POST checks. */
export const CONSENT_NONCE_COOKIE = 'cir_vault_consent_nonce';

/** Cookie + form fields a malformed request might be missing. */
const MAX_NONCE_AGE_SECONDS = 10 * 60; // 10 min

/**
 * Inputs the consent screen reads off the GET request. Safe-decoded —
 * the parser maps malformed query strings to `null`.
 */
export interface ConsentRequestParams {
  appId: string;
  scopes: string[];
  redirect: string;
  /** Optional purpose string the consent screen may surface. */
  purpose?: string;
  /** Optional user_id override (default 'demo-user'). */
  userId?: string;
}

/**
 * Parse + validate the consent GET query. Returns null on invalid input;
 * the caller maps null to a 400 response.
 */
export function parseConsentParams(query: Record<string, string>): ConsentRequestParams | null {
  const appId = query['app_id'];
  const scopesCsv = query['scopes'];
  const redirect = query['redirect'];
  if (typeof appId !== 'string' || appId.length === 0) return null;
  // Whitelist the app_id shape (alphanumerics + `.` + `-` + `_`) so HTML
  // / script / whitespace / control characters never reach the renderer.
  if (!/^[A-Za-z0-9._-]+$/.test(appId)) return null;
  if (typeof scopesCsv !== 'string' || scopesCsv.length === 0) return null;
  if (typeof redirect !== 'string' || redirect.length === 0) return null;
  // Reject non-http(s) redirect schemes outright. `javascript:` / `data:` /
  // `file:` are obviously dangerous; the reference vault allows only http(s).
  let parsed: URL;
  try {
    parsed = new URL(redirect);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  const scopes = scopesCsv
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (scopes.length === 0) return null;
  for (const s of scopes) {
    if (!/^[a-z][a-z0-9_.-]*$/.test(s)) return null;
  }
  const out: ConsentRequestParams = { appId, scopes, redirect };
  if (typeof query['purpose'] === 'string' && query['purpose'].length > 0) {
    out.purpose = query['purpose'];
  }
  if (typeof query['user_id'] === 'string' && query['user_id'].length > 0) {
    out.userId = query['user_id'];
  }
  return out;
}

/**
 * Mint a CSRF nonce. Format: `<random>.<issuedAtSeconds>.<hmac>` so we can
 * verify the issued-at + binding without server-side state. The HMAC key is
 * derived from the vault's ed25519 private key bytes (stable across
 * restarts when the same key is loaded; rotates with the signing key).
 */
export function mintNonce(secret: Buffer, nowSeconds: number): string {
  const random = randomBytes(16).toString('hex');
  const issued = String(nowSeconds);
  const payload = `${random}.${issued}`;
  const mac = createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${mac}`;
}

/**
 * Verify a CSRF nonce. Constant-time compare on the HMAC; rejects expired
 * nonces. Returns false on any malformed input rather than throwing.
 */
export function verifyNonce(nonce: string, secret: Buffer, nowSeconds: number): boolean {
  const parts = nonce.split('.');
  if (parts.length !== 3) return false;
  const [random, issuedStr, mac] = parts as [string, string, string];
  if (!/^[a-f0-9]+$/i.test(random) || !/^[0-9]+$/.test(issuedStr) || !/^[a-f0-9]+$/i.test(mac)) {
    return false;
  }
  const issued = Number.parseInt(issuedStr, 10);
  if (!Number.isFinite(issued)) return false;
  if (nowSeconds - issued > MAX_NONCE_AGE_SECONDS) return false;
  if (issued > nowSeconds + 60) return false; // future-dated nonce: clock skew or forgery
  const payload = `${random}.${issuedStr}`;
  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  // timingSafeEqual requires equal-length buffers.
  if (mac.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(expected, 'hex'));
}

/**
 * Derive an HMAC secret from the signing key. We use the SPKI bytes of the
 * public key — stable, available on every service, and rotates whenever the
 * signing key rotates (which is exactly when we want CSRF binding to also
 * rotate).
 */
export function deriveCsrfSecret(service: VaultService): Buffer {
  return service.key.publicKey.export({ format: 'der', type: 'spki' });
}

/**
 * Look up a cookie value by name on a `Cookie:` header. Defensive: missing
 * header / malformed pair returns undefined.
 */
export function readCookie(headers: Record<string, string>, name: string): string | undefined {
  const raw = headers['cookie'];
  if (raw === undefined) return undefined;
  for (const pair of raw.split(';')) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    const k = pair.slice(0, eq).trim();
    if (k === name) return pair.slice(eq + 1).trim();
  }
  return undefined;
}

/**
 * Parse a `application/x-www-form-urlencoded` body. The vault speaks JSON
 * everywhere else; the consent POST is the one form-encoded surface so
 * native `<form method=POST>` keeps working with JS disabled.
 */
export function parseFormBody(body: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof body !== 'string') return out;
  for (const pair of body.split('&')) {
    const eq = pair.indexOf('=');
    if (eq === -1) {
      out[decodeURIComponent(pair.replace(/\+/g, ' '))] = '';
      continue;
    }
    const k = decodeURIComponent(pair.slice(0, eq).replace(/\+/g, ' '));
    const v = decodeURIComponent(pair.slice(eq + 1).replace(/\+/g, ' '));
    out[k] = v;
  }
  return out;
}

/** Minimal HTML escaper. We only emit a small handful of values. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Render the consent HTML page. Pure function — easy to test. */
export function renderConsentPage(input: {
  params: ConsentRequestParams;
  nonce: string;
  /** Issuer claim that will go on the minted token. Surfaced for transparency. */
  issuer: string;
  /** Pre-computed claim preview the "Show details" disclosure renders. */
  claimsPreview: Record<string, unknown>;
}): string {
  const { params, nonce, issuer, claimsPreview } = input;
  const scopeRows = params.scopes
    .map(
      (s) => `
      <li class="scope-row">
        <code>${escapeHtml(s)}</code>
        <span class="scope-desc">${escapeHtml(describeScope(s))}</span>
      </li>`,
    )
    .join('');

  const hiddenScopes = params.scopes
    .map((s) => `<input type="hidden" name="scopes" value="${escapeHtml(s)}" />`)
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Authorize ${escapeHtml(params.appId)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
         max-width: 560px; margin: 40px auto; padding: 0 16px; color: #111827; line-height: 1.5; }
  h1 { font-size: 22px; margin: 0 0 8px; }
  .vault-tag { color: #6b7280; font-size: 13px; }
  .app-id { font-weight: 600; }
  .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-top: 16px; background: #fff; }
  .scope-list { list-style: none; padding: 0; margin: 12px 0; }
  .scope-row { padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 8px; }
  .scope-row code { display: block; font-weight: 600; margin-bottom: 4px; }
  .scope-desc { color: #4b5563; font-size: 14px; }
  .actions { display: flex; gap: 12px; margin-top: 20px; }
  button { font-size: 15px; padding: 10px 16px; border-radius: 8px; cursor: pointer; border: 1px solid; }
  button.approve { background: #2563eb; border-color: #2563eb; color: #fff; }
  button.deny { background: #fff; border-color: #d1d5db; color: #111827; }
  details { margin-top: 16px; }
  summary { cursor: pointer; color: #2563eb; font-size: 14px; }
  pre.claims { background: #f9fafb; padding: 12px; border-radius: 8px; overflow-x: auto;
               font-size: 12px; line-height: 1.4; border: 1px solid #e5e7eb; }
  .purpose { background: #f0f9ff; border: 1px solid #bae6fd; padding: 12px; border-radius: 8px;
             margin: 12px 0; font-size: 14px; }
</style>
</head>
<body>
  <p class="vault-tag">CIR Vault &middot; ${escapeHtml(issuer)}</p>
  <h1>Authorize <span class="app-id">${escapeHtml(params.appId)}</span></h1>
  <p>This app is asking for the following access to your intent profile. Approve to mint a scoped token; deny to refuse.</p>

  <div class="card">
    ${
      params.purpose !== undefined
        ? `<div class="purpose"><strong>Purpose:</strong> ${escapeHtml(params.purpose)}</div>`
        : ''
    }
    <strong>Requested scopes:</strong>
    <ul class="scope-list">${scopeRows}
    </ul>

    <details>
      <summary>Show full claim payload</summary>
      <pre class="claims">${escapeHtml(JSON.stringify(claimsPreview, null, 2))}</pre>
    </details>

    <form method="POST" action="/vault/consent/approve">
      <input type="hidden" name="csrf_nonce" value="${escapeHtml(nonce)}" />
      <input type="hidden" name="app_id" value="${escapeHtml(params.appId)}" />
      <input type="hidden" name="redirect" value="${escapeHtml(params.redirect)}" />
      ${
        params.purpose !== undefined
          ? `<input type="hidden" name="purpose" value="${escapeHtml(params.purpose)}" />`
          : ''
      }
      ${
        params.userId !== undefined
          ? `<input type="hidden" name="user_id" value="${escapeHtml(params.userId)}" />`
          : ''
      }
      ${hiddenScopes}
      <div class="actions">
        <button type="submit" name="decision" value="approve" class="approve">Approve</button>
        <button type="submit" name="decision" value="deny" class="deny" formaction="/vault/consent/deny">Deny</button>
      </div>
    </form>
  </div>
</body>
</html>`;
}

/** Adds a Set-Cookie + Content-Type header to a VaultResponse. */
function htmlResponseWithCookie(html: string, cookieValue: string): VaultResponse {
  // Cookie attributes:
  //   - HttpOnly: not accessible to JS (defense in depth).
  //   - SameSite=Lax: cookie still sent on top-level GET navigation from the
  //     host's redirect, but suppressed on cross-site form posts.
  //   - Path=/vault/consent: scoped to the consent endpoints only.
  //   - Max-Age: matches MAX_NONCE_AGE_SECONDS so a stale tab fails closed.
  const cookie = `${CONSENT_NONCE_COOKIE}=${cookieValue}; HttpOnly; SameSite=Lax; Path=/vault/consent; Max-Age=${String(
    MAX_NONCE_AGE_SECONDS,
  )}`;
  return {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'set-cookie': cookie,
    },
    rawBody: html,
  };
}

/** Build a 302 redirect response with the location header. */
function redirectResponse(location: string): VaultResponse {
  return {
    status: 302,
    headers: { location },
  };
}

/** Build an "append + return location" string with proper encoding. */
function appendQuery(redirect: string, key: string, value: string): string {
  const url = new URL(redirect);
  url.searchParams.set(key, value);
  return url.toString();
}

/**
 * Wire up the consent endpoints. Returns a handler the dispatcher can call
 * before falling through to the rest of the routes. Returns `null` when the
 * request did not match any consent route.
 */
export function handleConsentRequest(
  service: VaultService,
  req: VaultRequest,
): VaultResponse | null {
  // GET /vault/consent — render the form.
  if (req.method === 'GET' && req.path === '/vault/consent') {
    const params = parseConsentParams(req.query);
    if (params === null) {
      return {
        status: 400,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        rawBody: '<h1>Bad Request</h1><p>Malformed consent parameters.</p>',
      };
    }
    const secret = deriveCsrfSecret(service);
    const nonce = mintNonce(secret, service.now());
    const claimsPreview = {
      iss: service.issuer,
      aud: params.appId,
      sub: params.userId ?? 'demo-user',
      scope: params.scopes.join(' '),
      // exp / iat are minted at approve-time; show TTL caps in the preview.
      ttl_seconds_default: service.defaultTokenTtlSeconds,
      ttl_seconds_max: service.maxTokenTtlSeconds,
    };
    const html = renderConsentPage({
      params,
      nonce,
      issuer: service.issuer,
      claimsPreview,
    });
    return htmlResponseWithCookie(html, nonce);
  }

  // POST /vault/consent/approve — mint a token + redirect back.
  if (req.method === 'POST' && req.path === '/vault/consent/approve') {
    const form = parseFormBody(req.body);
    const cookie = readCookie(req.headers, CONSENT_NONCE_COOKIE);
    const formNonce = form['csrf_nonce'];
    const secret = deriveCsrfSecret(service);
    if (cookie === undefined || formNonce === undefined || cookie !== formNonce) {
      return {
        status: 403,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        rawBody: '<h1>Forbidden</h1><p>Missing or mismatched CSRF nonce.</p>',
      };
    }
    if (!verifyNonce(formNonce, secret, service.now())) {
      return {
        status: 403,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        rawBody: '<h1>Forbidden</h1><p>Invalid or expired CSRF nonce.</p>',
      };
    }
    const appId = form['app_id'];
    const redirect = form['redirect'];
    if (typeof appId !== 'string' || appId.length === 0) {
      return { status: 400, body: { error: 'app_id is required' } };
    }
    if (typeof redirect !== 'string' || redirect.length === 0) {
      return { status: 400, body: { error: 'redirect is required' } };
    }
    let parsedRedirect: URL;
    try {
      parsedRedirect = new URL(redirect);
    } catch {
      return { status: 400, body: { error: 'redirect is not a valid URL' } };
    }
    if (parsedRedirect.protocol !== 'http:' && parsedRedirect.protocol !== 'https:') {
      return { status: 400, body: { error: 'redirect must be http(s)' } };
    }
    // Multi-value form fields: `parseFormBody` collapses to last-wins; the
    // form puts each scope as its own hidden input so we re-extract from the
    // raw body string here.
    const scopes = extractAllScopes(req.body);
    if (scopes.length === 0) {
      return { status: 400, body: { error: 'at least one scope is required' } };
    }
    const userId =
      typeof form['user_id'] === 'string' && form['user_id'].length > 0
        ? form['user_id']
        : undefined;
    const purpose =
      typeof form['purpose'] === 'string' && form['purpose'].length > 0
        ? form['purpose']
        : undefined;
    const minted = service.mintGrant({
      app_id: appId,
      scopes,
      ...(userId !== undefined ? { user_id: userId } : {}),
      ...(purpose !== undefined ? { purpose } : {}),
    });
    const target = appendQuery(redirect, 'token', minted.token);
    return redirectResponse(target);
  }

  // POST /vault/consent/deny — redirect back with ?error=denied.
  if (req.method === 'POST' && req.path === '/vault/consent/deny') {
    const form = parseFormBody(req.body);
    const redirect = form['redirect'];
    if (typeof redirect !== 'string' || redirect.length === 0) {
      return { status: 400, body: { error: 'redirect is required' } };
    }
    let parsedRedirect: URL;
    try {
      parsedRedirect = new URL(redirect);
    } catch {
      return { status: 400, body: { error: 'redirect is not a valid URL' } };
    }
    if (parsedRedirect.protocol !== 'http:' && parsedRedirect.protocol !== 'https:') {
      return { status: 400, body: { error: 'redirect must be http(s)' } };
    }
    return redirectResponse(appendQuery(redirect, 'error', 'denied'));
  }

  return null;
}

/**
 * Re-parse the form body to collect EVERY value of the `scopes` field, since
 * the form emits one hidden input per scope. `parseFormBody` returns
 * last-wins so we use this for the multi-value case only.
 */
function extractAllScopes(body: unknown): string[] {
  if (typeof body !== 'string') return [];
  const out: string[] = [];
  for (const pair of body.split('&')) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    const k = decodeURIComponent(pair.slice(0, eq).replace(/\+/g, ' '));
    if (k !== 'scopes') continue;
    const v = decodeURIComponent(pair.slice(eq + 1).replace(/\+/g, ' '));
    if (v.length > 0) out.push(v);
  }
  return out;
}
