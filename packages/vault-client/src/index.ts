// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `@atelier/vault-client` — public surface.
 *
 * Typed wire client for the Atelier intent vault. Pairs with `@atelier/vault-server`.
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

// -----------------------------------------------------------------------------
// Marketplace — Wave 8 / V-6
// `atelier://author/persona@version` addressing + ed25519 signing + TOFU trust.
// See `/Users/vid/cir/docs/vault-protocol.md` §"Marketplace endpoints".
// -----------------------------------------------------------------------------
export {
  InMemoryTrustedKeyStore,
  LocalStorageTrustedKeyStore,
  MarketplaceClient,
  MarketplaceError,
  MarketplaceTrustError,
  SignatureMismatchError,
  computeKeyId as computeMarketplaceKeyId,
  defaultTrustedKeyStore,
  fetchReview,
  listMarketplace,
  publishPersona,
  signingInputForReview,
  submitReview,
  type BundlePayload,
  type MarketplaceAuthor,
  type MarketplaceClientOptions,
  type MarketplaceKeyMaterial,
  type MarketplaceListQuery,
  type MarketplaceListing,
  type PublishResult,
  type SubmitReviewOptions,
  type TrustedKeyStore,
} from './marketplace.js';
