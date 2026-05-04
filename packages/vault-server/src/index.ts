// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `@atelier/vault-server` — public surface.
 *
 * The intent vault: user-owned profile store, ed25519-signed scoped tokens,
 * scope-based read/write filtering, revocation with trigger emission. See
 * `/Users/vid/cir/docs/vault-protocol.md` for the wire spec.
 */

export {
  VaultService,
  handleVaultRequest,
  startVaultServer,
  type RunningVaultServer,
  type TriggerEmitter,
  type VaultRequest,
  type VaultResponse,
  type VaultRevocationTrigger,
  type VaultServerOptions,
} from './server.js';

export {
  JsonFileVaultStorage,
  MemoryVaultStorage,
  type GrantRecord,
  type VaultStorage,
  type VaultStorageState,
} from './storage.js';

export {
  authorizeWrite,
  filterProfileForRead,
  parseScope,
  parseScopeClaim,
  type ParsedScope,
  type WriteCheck,
} from './scopes.js';

export {
  CONSENT_NONCE_COOKIE,
  deriveCsrfSecret,
  escapeHtml,
  handleConsentRequest,
  mintNonce,
  parseConsentParams,
  parseFormBody,
  readCookie,
  renderConsentPage,
  verifyNonce,
  type ConsentRequestParams,
} from './consent.js';

export {
  b64uDecode,
  b64uEncode,
  buildJwks,
  deriveKid,
  exportPrivatePem,
  loadOrGenerateKeyPair,
  signJwt,
  verifyJwt,
  type JwksDocument,
  type JwksKey,
  type JwtClaims,
  type JwtHeader,
  type VaultKeyPair,
  type VerifiedJwt,
} from './signing.js';

export {
  JsonFileMarketplaceStorage,
  MemoryMarketplaceStorage,
  computeKeyId,
  handleMarketplaceRequest,
  parseFetchPath,
  verifyBundleSignature,
  type MarketplaceStorage,
} from './marketplace.js';

// V-6.a / V-6.b — persona marketplace endpoints + key directory + store.
// V-6.d additions: review store + reviewer directory + curated index/review routes.
export {
  FilesystemMarketplaceStore,
  FilesystemReviewStore,
  InMemoryKeyDirectory,
  InMemoryMarketplaceStore,
  InMemoryReviewStore,
  InMemoryReviewerKeyDirectory,
  MARKETPLACE_INDEX_PATH,
  MARKETPLACE_PREFIX,
  MARKETPLACE_REVIEW_PREFIX,
  StaticKeyDirectory,
  compareSemver,
  computeAuthorKeyId,
  handleMarketplaceIndexRequest,
  handleMarketplacePersonaRequest,
  handleMarketplaceReviewRequest,
  makePendingReviewRecord,
  signingInputForReview,
  verifyAuthorSignature,
  verifyReviewerSignature,
  type KeyDirectory,
  type MarketplaceListingWire,
  type MarketplaceStore,
  type ReviewStore,
  type ReviewerKeyDirectory,
} from './marketplace/index.js';
