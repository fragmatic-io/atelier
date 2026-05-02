// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Vault HTTP server.
 *
 * Built on `node:http` (no Hono / Express). The brief allowed Hono but
 * lifting in a new dep just for five JSON endpoints isn't worth the
 * complexity — a 200-line dispatcher matches the rest of the repo's
 * "no-deps unless absolutely necessary" stance.
 *
 * The HTTP transport is a thin wrapper around `handleVaultRequest`, which
 * is a pure function `(VaultRequest) => VaultResponse`. Tests exercise the
 * pure layer directly so we don't need to bind sockets in CI; the eval
 * harness uses the same entry point to drive the in-memory chain.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { IntentProfileSchema, type IntentProfile } from '@atelier/schemas';
import { buildJwks, signJwt, verifyJwt, type JwtClaims, type VaultKeyPair } from './signing.js';
import {
  authorizeWrite,
  filterProfileForRead,
  parseScopeClaim,
  type ParsedScope,
} from './scopes.js';
import type { GrantRecord, VaultStorage } from './storage.js';
import { handleConsentRequest } from './consent.js';
import {
  MemoryMarketplaceStorage,
  handleMarketplaceRequest,
  type MarketplaceStorage,
} from './marketplace.js';

/**
 * Shape of the `system.security_revocation` trigger we emit on revoke.
 * Mirrors `@atelier/schemas`'s discriminated-union member without depending on
 * the Zod-inferred type (the schemas package does not export the per-member
 * inferred type alias today; defining it locally keeps the dep on the wire
 * shape, not the codegen).
 */
export interface VaultRevocationTrigger {
  type: 'system.security_revocation';
  app_id: string;
  reason: string;
  capability_id?: string;
}

/** Minimal trigger emitter contract. The runtime's `TriggerSubscription`
 * interface is structurally compatible — passing `bus.emit.bind(bus)` works. */
export type TriggerEmitter = (event: VaultRevocationTrigger) => void | Promise<void>;

export interface VaultServerOptions {
  /** Storage adapter. Tests pass `MemoryVaultStorage`. */
  storage: VaultStorage;
  /** Vault signing keypair. */
  key: VaultKeyPair;
  /** Issuer claim placed in every minted token. */
  issuer: string;
  /** Default token lifetime if the request omits `expiry_seconds`. */
  defaultTokenTtlSeconds?: number;
  /** Hard cap on token lifetime regardless of request. */
  maxTokenTtlSeconds?: number;
  /** Optional trigger emitter; called on revoke. */
  onRevoked?: TriggerEmitter;
  /**
   * Marketplace bundle storage (Wave 8 / V-6). Optional — when omitted, an
   * in-memory store is created so tests and the dev server keep working
   * without separate wiring. Production deployments pass a file-backed
   * adapter (`JsonFileMarketplaceStorage`) rooted on the same disk as the
   * vault state file.
   */
  marketplaceStorage?: MarketplaceStorage;
  /**
   * Optional clock override for tests. Returns Unix seconds.
   * Defaults to `() => Math.floor(Date.now() / 1000)`.
   */
  now?: () => number;
}

const DEFAULT_TTL = 60 * 60 * 24; // 24 h
const MAX_TTL = 60 * 60 * 24 * 30; // 30 d

/** Pure-form request: method + path + headers + parsed body. Stable for tests. */
export interface VaultRequest {
  method: string;
  /** Path WITHOUT query string. */
  path: string;
  /** Parsed query string. */
  query: Record<string, string>;
  headers: Record<string, string>;
  body: unknown;
}

/** Pure-form response. Status + JSON body (or empty). */
export interface VaultResponse {
  status: number;
  body?: unknown;
  /**
   * Optional response headers. Most JSON endpoints leave this undefined and
   * the HTTP adapter sets `content-type: application/json`. The consent UI
   * sets `content-type: text/html` + a `set-cookie` for the CSRF nonce, so
   * the dispatcher returns the explicit header map there.
   */
  headers?: Record<string, string>;
  /**
   * Optional pre-stringified body. When set, the HTTP adapter writes this
   * verbatim instead of JSON-encoding `body`. Used by the consent UI for
   * server-rendered HTML.
   */
  rawBody?: string;
}

/**
 * Stateful service object. Pulls the config + storage + key into a single
 * value the route handlers close over.
 */
export class VaultService {
  readonly storage: VaultStorage;
  readonly key: VaultKeyPair;
  readonly issuer: string;
  readonly defaultTokenTtlSeconds: number;
  readonly maxTokenTtlSeconds: number;
  readonly onRevoked: TriggerEmitter | undefined;
  readonly marketplaceStorage: MarketplaceStorage;
  readonly now: () => number;

  constructor(opts: VaultServerOptions) {
    this.storage = opts.storage;
    this.key = opts.key;
    this.issuer = opts.issuer;
    this.defaultTokenTtlSeconds = opts.defaultTokenTtlSeconds ?? DEFAULT_TTL;
    this.maxTokenTtlSeconds = opts.maxTokenTtlSeconds ?? MAX_TTL;
    this.onRevoked = opts.onRevoked;
    this.marketplaceStorage = opts.marketplaceStorage ?? new MemoryMarketplaceStorage();
    this.now = opts.now ?? (() => Math.floor(Date.now() / 1000));
  }

  /**
   * Mint a new grant. The reference vault is single-user (the dev
   * convenience); the user_id is read from the request body or defaults to
   * the storage's only profile owner.
   */
  mintGrant(input: {
    app_id: string;
    user_id?: string;
    scopes: string[];
    expiry_seconds?: number;
    purpose?: string;
  }): { token: string; record: GrantRecord; claims: JwtClaims } {
    const userId = input.user_id ?? 'demo-user';
    const ttl = Math.min(
      Math.max(60, input.expiry_seconds ?? this.defaultTokenTtlSeconds),
      this.maxTokenTtlSeconds,
    );
    const iat = this.now();
    const exp = iat + ttl;
    // jti is derived from random bytes; collision space is 2^96 so we don't
    // bother checking the storage for a clash.
    const jti = `g_${randomBytes(8).toString('hex')}`;
    const claims: JwtClaims = {
      iss: this.issuer,
      aud: input.app_id,
      sub: userId,
      scope: input.scopes.join(' '),
      iat,
      exp,
      jti,
    };
    const token = signJwt(claims, this.key);
    const record: GrantRecord = {
      jti,
      app_id: input.app_id,
      user_id: userId,
      scopes: input.scopes,
      iat,
      exp,
    };
    if (input.purpose !== undefined) record.purpose = input.purpose;
    this.storage.putGrant(record);
    return { token, record, claims };
  }

  /**
   * Verify a bearer token and return the parsed claims plus the live grant
   * record. Throws on signature failure, expiry, or revocation.
   */
  verifyBearer(token: string, expectedAud?: string): { claims: JwtClaims; record: GrantRecord } {
    const { claims } = verifyJwt(token, this.key.publicKey, this.now());
    if (expectedAud !== undefined && claims.aud !== expectedAud) {
      throw new Error(`audience mismatch: token aud=${claims.aud} expected=${expectedAud}`);
    }
    const record = this.storage.getGrant(claims.jti);
    if (record === undefined) throw new Error('unknown grant');
    if (record.revoked_at !== undefined) throw new Error('token revoked');
    return { claims, record };
  }

  /** Revoke a grant by jti. Emits a `system.security_revocation` trigger. */
  async revokeByJti(jti: string, reason: string): Promise<GrantRecord | undefined> {
    const updated = this.storage.revokeGrant(jti, this.now());
    if (updated === undefined) return undefined;
    if (this.onRevoked !== undefined) {
      const trigger: VaultRevocationTrigger = {
        type: 'system.security_revocation',
        app_id: updated.app_id,
        reason,
      };
      // Don't await emit failures; revocation should not be blocked by a
      // misbehaving trigger consumer.
      try {
        await this.onRevoked(trigger);
      } catch (err) {
        console.error(`vault-server: trigger emit failed: ${(err as Error).message}`);
      }
    }
    return updated;
  }
}

/** Helper: get a Bearer token from the headers, or undefined. */
function readBearer(headers: Record<string, string>): string | undefined {
  const auth = headers['authorization'] ?? headers['Authorization'];
  if (auth === undefined) return undefined;
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  return m ? m[1] : undefined;
}

/** JSON helper to keep the routes terse. */
function json(status: number, body: unknown): VaultResponse {
  return { status, body };
}

/**
 * Pure request → response dispatcher. Tests drive this directly; the HTTP
 * transport just adapts node:http into `VaultRequest` / `VaultResponse`.
 */
export async function handleVaultRequest(
  service: VaultService,
  req: VaultRequest,
): Promise<VaultResponse> {
  // 0) Consent UI — runs before the JSON endpoints because it serves HTML
  //    and reads form-encoded bodies. Returns null when the request didn't
  //    match a consent route, so the rest of the dispatcher takes over.
  const consentResponse = handleConsentRequest(service, req);
  if (consentResponse !== null) return consentResponse;

  // 0a) Marketplace endpoints — Wave 8 / V-6. Publish + fetch a signed
  //     bundle. Returns null when no marketplace route matched.
  const marketplaceResponse = handleMarketplaceRequest(service.marketplaceStorage, req);
  if (marketplaceResponse !== null) return marketplaceResponse;

  // 1) JWKS — public, unauthenticated.
  if (req.method === 'GET' && req.path === '/.well-known/jwks.json') {
    return json(200, buildJwks([service.key]));
  }

  // 2) POST /vault/grants — mint a token. Reference vault is open
  //    (consent UI is the host's concern); production deployments wrap
  //    this with their auth.
  if (req.method === 'POST' && req.path === '/vault/grants') {
    const body = req.body as {
      app_id?: string;
      user_id?: string;
      scopes?: string[];
      expiry_seconds?: number;
      purpose?: string;
    } | null;
    if (body === null || typeof body !== 'object') {
      return json(400, { error: 'body must be an object' });
    }
    if (typeof body.app_id !== 'string' || body.app_id.length === 0) {
      return json(400, { error: 'app_id is required' });
    }
    if (!Array.isArray(body.scopes) || body.scopes.length === 0) {
      return json(400, { error: 'scopes is required and must be non-empty' });
    }
    for (const s of body.scopes) {
      if (typeof s !== 'string' || s.length === 0) {
        return json(400, { error: 'each scope must be a non-empty string' });
      }
    }
    const { token, record, claims } = service.mintGrant({
      app_id: body.app_id,
      ...(body.user_id !== undefined ? { user_id: body.user_id } : {}),
      scopes: body.scopes,
      ...(body.expiry_seconds !== undefined ? { expiry_seconds: body.expiry_seconds } : {}),
      ...(body.purpose !== undefined ? { purpose: body.purpose } : {}),
    });
    return json(200, {
      token,
      scopes_granted: record.scopes,
      expires_at: new Date(claims.exp * 1000).toISOString(),
      jti: claims.jti,
      user_id: claims.sub,
    });
  }

  // 3) GET /vault/profile?aud=<app_id> — read.
  if (req.method === 'GET' && req.path === '/vault/profile') {
    const token = readBearer(req.headers);
    if (token === undefined) return json(401, { error: 'missing bearer token' });
    const aud = req.query['aud'];
    let claims: JwtClaims;
    let record: GrantRecord;
    try {
      const verified = service.verifyBearer(token, aud);
      claims = verified.claims;
      record = verified.record;
    } catch (err) {
      return json(401, { error: (err as Error).message });
    }
    const profile = service.storage.getProfile(claims.sub);
    if (profile === undefined) {
      return json(404, { error: `no profile for user ${claims.sub}` });
    }
    const scopes = parseScopeClaim(claims.scope);
    const slice = filterProfileForRead(profile, scopes);
    return json(200, { profile: slice, jti: record.jti });
  }

  // 4) PATCH /vault/profile — write.
  if (req.method === 'PATCH' && req.path === '/vault/profile') {
    const token = readBearer(req.headers);
    if (token === undefined) return json(401, { error: 'missing bearer token' });
    let claims: JwtClaims;
    try {
      ({ claims } = service.verifyBearer(token));
    } catch (err) {
      return json(401, { error: (err as Error).message });
    }
    const body = req.body as Partial<IntentProfile> | null;
    if (body === null || typeof body !== 'object') {
      return json(400, { error: 'body must be a partial IntentProfile' });
    }
    const scopes: ParsedScope[] = parseScopeClaim(claims.scope);
    const { allowed, denied } = authorizeWrite(body, scopes);
    if (denied.length > 0) {
      return json(403, {
        error: 'scope violation: write rejected',
        denied,
      });
    }
    const existing = service.storage.getProfile(claims.sub);
    if (existing === undefined) {
      return json(404, { error: `no profile for user ${claims.sub}` });
    }
    // Apply the patch. `rules.append` is enforced here: the patch's `rules`
    // must extend the existing array (every existing rule remains; only new
    // entries may appear).
    const merged: IntentProfile = mergePatch(existing, allowed, scopes, service.now());
    const validated = IntentProfileSchema.safeParse(merged);
    if (!validated.success) {
      return json(400, {
        error: 'patch produced an invalid profile',
        issues: validated.error.issues,
      });
    }
    service.storage.putProfile(validated.data);
    const slice = filterProfileForRead(validated.data, scopes);
    return json(200, { profile: slice });
  }

  // 5) DELETE /vault/grants/:jti — revoke.
  if (req.method === 'DELETE' && req.path.startsWith('/vault/grants/')) {
    const jti = req.path.slice('/vault/grants/'.length);
    if (jti.length === 0) return json(404, { error: 'jti required' });
    const token = readBearer(req.headers);
    if (token === undefined) return json(401, { error: 'missing bearer token' });
    let claims: JwtClaims;
    try {
      ({ claims } = service.verifyBearer(token));
    } catch (err) {
      return json(401, { error: (err as Error).message });
    }
    // Self-revoke or vault.admin only.
    const isSelf = claims.jti === jti;
    const isAdmin = parseScopeClaim(claims.scope).some(
      (s) => s.category === 'vault' && s.modifier === 'admin',
    );
    if (!isSelf && !isAdmin) {
      return json(403, { error: 'caller may only revoke their own grant' });
    }
    const updated = await service.revokeByJti(jti, isSelf ? 'self_revoked' : 'admin_revoked');
    if (updated === undefined) return json(404, { error: 'grant not found' });
    return json(204, undefined);
  }

  return json(404, { error: `no route for ${req.method} ${req.path}` });
}

/** Apply a write-authorized patch to a profile. */
function mergePatch(
  existing: IntentProfile,
  patch: Partial<IntentProfile>,
  scopes: readonly ParsedScope[],
  nowSeconds: number,
): IntentProfile {
  const next: IntentProfile = { ...existing };
  if (patch.lenses !== undefined) {
    next.lenses = { ...existing.lenses, ...patch.lenses };
  }
  if (patch.vocabulary !== undefined) {
    next.vocabulary = { ...existing.vocabulary, ...patch.vocabulary };
  }
  if (patch.global_preferences !== undefined) {
    next.global_preferences = { ...existing.global_preferences, ...patch.global_preferences };
  }
  if (patch.rules !== undefined) {
    // `rules.append` semantics: the new rules array must be a superset of
    // the existing one. We dedupe by rule.scope + rule.rule (string compare)
    // so re-submitting the same patch is idempotent. `vault.admin` skips this
    // and overwrites verbatim.
    const isAdmin = scopes.some((s) => s.category === 'vault' && s.modifier === 'admin');
    if (isAdmin) {
      next.rules = patch.rules;
    } else {
      const seen = new Set(existing.rules.map((r) => `${r.scope} ${r.rule}`));
      const additions = patch.rules.filter((r) => !seen.has(`${r.scope} ${r.rule}`));
      next.rules = [...existing.rules, ...additions];
    }
  }
  next.profile_version = existing.profile_version + 1;
  next.updated_at = new Date(nowSeconds * 1000).toISOString();
  return next;
}

/** A live HTTP server bound to a port. Returned by `startVaultServer`. */
export interface RunningVaultServer {
  /** The underlying node:http server. Useful for tests that need .address(). */
  server: Server;
  /** The port the server is listening on. */
  port: number;
  /** Stop the server (closes accepted connections). */
  close(): Promise<void>;
  /** The service object the server dispatches to. */
  service: VaultService;
}

/**
 * Boot an HTTP server that adapts incoming requests into `VaultRequest`s
 * and dispatches through `handleVaultRequest`. Returns a handle the caller
 * can `await close()` for graceful teardown.
 */
export async function startVaultServer(
  opts: VaultServerOptions & { port?: number },
): Promise<RunningVaultServer> {
  const service = new VaultService(opts);
  const server = createServer((req, res) => {
    void adaptHttp(service, req, res);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port ?? 0, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  const addr = server.address();
  const port = typeof addr === 'object' && addr !== null ? addr.port : 0;

  return {
    server,
    port,
    service,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      }),
  };
}

/** Adapt one node:http request into the pure dispatcher and write back. */
async function adaptHttp(
  service: VaultService,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  // Permissive CORS for local dev: the demo runs on :3000 and the vault on
  // :4001 so the browser would otherwise reject the cross-origin call. Hosts
  // that front the vault behind their own gateway can override at the proxy.
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('access-control-allow-headers', 'authorization, content-type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const urlText = req.url ?? '/';
  // node:http doesn't expose a reliable "host" for relative paths, so we
  // build a synthetic absolute URL just for parsing.
  const url = new URL(urlText, 'http://localhost');
  const query: Record<string, string> = {};
  for (const [k, v] of url.searchParams.entries()) {
    query[k] = v;
  }
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === 'string') headers[k.toLowerCase()] = v;
    else if (Array.isArray(v)) headers[k.toLowerCase()] = v.join(', ');
  }

  let body: unknown = null;
  if (req.method === 'POST' || req.method === 'PATCH' || req.method === 'PUT') {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    const raw = Buffer.concat(chunks).toString('utf8');
    if (raw.length > 0) {
      // The consent endpoints accept `application/x-www-form-urlencoded`
      // (so JS-disabled `<form method=POST>` keeps working). Everything
      // else is JSON. We dispatch on the `content-type` header.
      const contentType = headers['content-type'] ?? '';
      if (contentType.includes('application/x-www-form-urlencoded')) {
        body = raw;
      } else {
        try {
          body = JSON.parse(raw);
        } catch {
          res.statusCode = 400;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: 'invalid JSON body' }));
          return;
        }
      }
    }
  }

  const out = await handleVaultRequest(service, {
    method: req.method ?? 'GET',
    path: url.pathname,
    query,
    headers,
    body,
  });
  res.statusCode = out.status;
  // Apply any explicit response headers (the consent UI sets HTML
  // content-type + a CSRF cookie). We let the route override CORS headers
  // so a 302 redirect's `Location` header lands on the response.
  if (out.headers !== undefined) {
    for (const [k, v] of Object.entries(out.headers)) {
      res.setHeader(k, v);
    }
  }
  if (out.rawBody !== undefined) {
    res.end(out.rawBody);
  } else if (out.body !== undefined) {
    if (out.headers?.['content-type'] === undefined) {
      res.setHeader('content-type', 'application/json');
    }
    res.end(JSON.stringify(out.body));
  } else {
    res.end();
  }
}
