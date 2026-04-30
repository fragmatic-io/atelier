// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * `VaultClient` — typed wire client for `@cir/vault-server`.
 *
 * Each method maps 1:1 to a wire endpoint. The client:
 *   - persists the active token via the storage adapter,
 *   - locally verifies signature + expiry before trusting the token,
 *   - maps response codes to typed errors callers branch on.
 *
 * The client is framework-agnostic. Hosts wrap it (e.g. the demo's
 * `lib/intent-store.ts`) when they need framework-specific behaviour
 * (React state, redirects to consent UI, fall-through to localStorage).
 */

import { IntentProfileSchema, type IntentProfile } from '@cir/schemas';
import {
  VaultResponseError,
  VaultTokenExpiredError,
  VaultUnauthorizedError,
  VaultUnreachableError,
} from './errors.js';
import { JwksCache, decodeJwt } from './jwks-cache.js';
import { defaultTokenStorage, type VaultTokenStorage } from './storage.js';

export interface VaultClientOptions {
  /** Vault base URL (e.g. `http://localhost:4001`). */
  vaultUrl: string;
  /** App id this client is acting on behalf of. Sent on grant requests + checked on read. */
  appId: string;
  /** Token storage adapter. Default: localStorage in browser, in-memory in Node. */
  tokenStorage?: VaultTokenStorage;
  /** Override the fetcher (tests pass a stub). */
  fetcher?: typeof fetch;
  /** Override the clock. Default: `() => Date.now()`. */
  now?: () => number;
}

export interface RequestGrantInput {
  scopes: string[];
  user_id?: string;
  expiry_seconds?: number;
  purpose?: string;
}

export interface GrantResponse {
  token: string;
  scopes_granted: string[];
  expires_at: string;
  jti: string;
  user_id: string;
}

/** Result of a profile read/write — the wire shape includes a metadata wrapper. */
export interface ProfileEnvelope {
  profile: IntentProfile;
  jti?: string;
}

/** Skinny safe-fetch that maps low-level network failures to VaultUnreachableError. */
async function safeFetch(
  fetcher: typeof fetch,
  url: string,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await fetcher(url, init);
  } catch (err) {
    throw new VaultUnreachableError(err as Error);
  }
}

export class VaultClient {
  private readonly vaultUrl: string;
  private readonly appId: string;
  private readonly tokenStorage: VaultTokenStorage;
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private readonly jwks: JwksCache;

  constructor(opts: VaultClientOptions) {
    this.vaultUrl = opts.vaultUrl.replace(/\/+$/, '');
    this.appId = opts.appId;
    this.tokenStorage = opts.tokenStorage ?? defaultTokenStorage();
    this.fetcher = opts.fetcher ?? fetch;
    this.now = opts.now ?? (() => Date.now());
    this.jwks = new JwksCache({
      vaultUrl: this.vaultUrl,
      fetcher: this.fetcher,
      now: this.now,
    });
  }

  /** Inspect the persisted token (does not verify). Returns null when none. */
  getToken(): string | null {
    return this.tokenStorage.read();
  }

  /** Drop the persisted token. Used after a revoke or audience-mismatch. */
  clearToken(): void {
    this.tokenStorage.clear();
  }

  /**
   * Verify the persisted token locally (signature + exp). Throws on a bad
   * sig or expiry; returns false when no token is stored.
   *
   * Network call: one to the JWKS endpoint on first use (cached afterwards
   * for the JwksCache TTL).
   */
  async verifyStoredToken(): Promise<boolean> {
    const token = this.tokenStorage.read();
    if (token === null) return false;
    const decoded = decodeJwt(token);
    const kid = decoded.header.kid;
    if (kid === undefined) {
      throw new VaultUnauthorizedError('token missing kid');
    }
    const ok = await this.jwks.verify(kid, decoded.signingInput, decoded.signatureBytes);
    if (!ok) throw new VaultUnauthorizedError('signature verification failed');
    const exp = decoded.claims.exp;
    if (typeof exp !== 'number' || exp * 1000 <= this.now()) {
      throw new VaultTokenExpiredError(exp ?? 0);
    }
    return true;
  }

  /**
   * Mint a new grant. The reference vault is open; production deployments
   * front this with their consent UI / OAuth dance / device-code flow. The
   * client forwards `app_id` on the body.
   */
  async requestGrant(input: RequestGrantInput): Promise<GrantResponse> {
    const res = await safeFetch(this.fetcher, `${this.vaultUrl}/vault/grants`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        app_id: this.appId,
        scopes: input.scopes,
        ...(input.user_id !== undefined ? { user_id: input.user_id } : {}),
        ...(input.expiry_seconds !== undefined ? { expiry_seconds: input.expiry_seconds } : {}),
        ...(input.purpose !== undefined ? { purpose: input.purpose } : {}),
      }),
    });
    if (res.status === 401) {
      throw new VaultUnauthorizedError(await readErrorMessage(res));
    }
    if (!res.ok) {
      throw new VaultResponseError(res.status, await readBody(res));
    }
    const body = (await res.json()) as GrantResponse;
    this.tokenStorage.write(body.token);
    return body;
  }

  /** Read the slice the bearer token authorizes. */
  async getProfile(): Promise<IntentProfile> {
    const token = this.requireToken();
    const url = `${this.vaultUrl}/vault/profile?aud=${encodeURIComponent(this.appId)}`;
    const res = await safeFetch(this.fetcher, url, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (res.status === 401) {
      const msg = await readErrorMessage(res);
      this.tokenStorage.clear();
      throw new VaultUnauthorizedError(msg);
    }
    if (!res.ok) throw new VaultResponseError(res.status, await readBody(res));
    const wire = (await res.json()) as ProfileEnvelope;
    // Re-validate the schema on the client side so a misbehaving vault
    // can't poison the runtime with malformed JSON.
    return IntentProfileSchema.parse(wire.profile);
  }

  /** Apply a scope-authorized partial update. Returns the resulting slice. */
  async patchProfile(patch: Partial<IntentProfile>): Promise<IntentProfile> {
    const token = this.requireToken();
    const res = await safeFetch(this.fetcher, `${this.vaultUrl}/vault/profile`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(patch),
    });
    if (res.status === 401) {
      const msg = await readErrorMessage(res);
      this.tokenStorage.clear();
      throw new VaultUnauthorizedError(msg);
    }
    if (!res.ok) throw new VaultResponseError(res.status, await readBody(res));
    const wire = (await res.json()) as ProfileEnvelope;
    return IntentProfileSchema.parse(wire.profile);
  }

  /**
   * Revoke a grant. If `jti` is omitted, the active token's jti is read
   * locally and the active token is dropped on success.
   */
  async revokeGrant(jti?: string): Promise<void> {
    const token = this.requireToken();
    let targetJti = jti;
    if (targetJti === undefined) {
      const decoded = decodeJwt(token);
      targetJti = decoded.claims.jti;
      if (targetJti === undefined) {
        throw new VaultUnauthorizedError('token missing jti claim');
      }
    }
    const res = await safeFetch(this.fetcher, `${this.vaultUrl}/vault/grants/${targetJti}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
    });
    if (res.status === 401) {
      const msg = await readErrorMessage(res);
      this.tokenStorage.clear();
      throw new VaultUnauthorizedError(msg);
    }
    if (res.status === 204) {
      // Drop the token after a successful self-revoke.
      this.tokenStorage.clear();
      return;
    }
    throw new VaultResponseError(res.status, await readBody(res));
  }

  /**
   * Read JTI from the active token without going to the network. Useful
   * for UI that wants to display "this app holds grant g_abc...".
   */
  getActiveJti(): string | null {
    const token = this.tokenStorage.read();
    if (token === null) return null;
    try {
      return decodeJwt(token).claims.jti ?? null;
    } catch {
      return null;
    }
  }

  /** Throws `VaultUnauthorizedError` when no token is stored. */
  private requireToken(): string {
    const token = this.tokenStorage.read();
    if (token === null) throw new VaultUnauthorizedError('no token stored');
    return token;
  }
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? `HTTP ${String(res.status)}`;
  } catch {
    return `HTTP ${String(res.status)}`;
  }
}

async function readBody(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    try {
      return await res.text();
    } catch {
      return null;
    }
  }
}
