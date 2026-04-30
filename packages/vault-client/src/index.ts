// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * `@cir/vault-client` — public surface.
 *
 * Typed wire client for the CIR intent vault. Pairs with `@cir/vault-server`.
 * See `/Users/vid/cir/docs/vault-protocol.md` for the wire spec.
 */

export {
  VaultClient,
  type GrantResponse,
  type ProfileEnvelope,
  type RequestGrantInput,
  type VaultClientOptions,
} from './client.js';

export {
  VaultError,
  VaultResponseError,
  VaultTokenExpiredError,
  VaultUnauthorizedError,
  VaultUnreachableError,
} from './errors.js';

export {
  BrowserTokenStorage,
  DEFAULT_TOKEN_STORAGE_KEY,
  MemoryTokenStorage,
  defaultTokenStorage,
  type VaultTokenStorage,
} from './storage.js';

export { JwksCache, decodeJwt, type JwksCacheOptions, type DecodedJwt } from './jwks-cache.js';
