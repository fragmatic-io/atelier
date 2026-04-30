// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Typed errors for the vault client.
 *
 * Callers branch on `instanceof` to choose between "user needs to re-grant"
 * (`VaultUnauthorizedError`), "vault is offline, fall back to local"
 * (`VaultUnreachableError`), and "the token expired, ask the user to renew"
 * (`VaultTokenExpiredError`). The constructors keep messages terse and
 * actionable; reasons live on dedicated fields, not in stringified text.
 */

/** Base class so callers can `catch (e: unknown) { if (e instanceof VaultError) ... }`. */
export class VaultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VaultError';
  }
}

/**
 * The vault returned 401. The token might be revoked, malformed, or the
 * audience claim might not match. The caller should drop the token from
 * storage and trigger a re-grant.
 */
export class VaultUnauthorizedError extends VaultError {
  override readonly name = 'VaultUnauthorizedError';
  /** The HTTP status the vault returned. Always 401 for this class. */
  readonly status = 401 as const;
  /** The vault's `error` body field, if any. */
  readonly serverMessage: string | undefined;

  constructor(serverMessage?: string) {
    super(serverMessage ?? 'vault rejected the bearer token');
    this.serverMessage = serverMessage;
  }
}

/**
 * The vault server is unreachable (network error, DNS failure, refused
 * connection, timeout). Hosts may fall through to a local cache when this
 * fires; demos may fall through to localStorage. Production deployers
 * usually want to fail closed instead.
 */
export class VaultUnreachableError extends VaultError {
  override readonly name = 'VaultUnreachableError';
  override readonly cause: Error;

  constructor(cause: Error) {
    super(`vault unreachable: ${cause.message}`);
    this.cause = cause;
  }
}

/**
 * Local pre-flight rejected the token because its `exp` claim is in the
 * past. Distinct from `VaultUnauthorizedError` because the client can
 * detect this WITHOUT a network round-trip — the cached JWKS is enough.
 */
export class VaultTokenExpiredError extends VaultError {
  override readonly name = 'VaultTokenExpiredError';
  /** Unix seconds at which the token expired. */
  readonly expiredAt: number;

  constructor(expiredAt: number) {
    super(`token expired at ${new Date(expiredAt * 1000).toISOString()}`);
    this.expiredAt = expiredAt;
  }
}

/**
 * The vault responded with an unexpected status code (not 200/204/401). The
 * client surfaces the status + body so callers can log + fail loudly.
 */
export class VaultResponseError extends VaultError {
  override readonly name = 'VaultResponseError';
  readonly status: number;
  readonly serverBody: unknown;

  constructor(status: number, serverBody: unknown) {
    super(`vault returned ${String(status)}`);
    this.status = status;
    this.serverBody = serverBody;
  }
}
