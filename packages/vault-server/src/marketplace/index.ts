// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Barrel for the V-6 marketplace persona endpoints. Exports the route
 * handler, the storage interface + impls, and the key-directory contract.
 *
 * V-6.d additions: review store + reviewer key directory + the curated
 * `/marketplace/index` and `/marketplace/review` route handlers.
 */

export {
  InMemoryKeyDirectory,
  StaticKeyDirectory,
  computeKeyId as computeAuthorKeyId,
  type KeyDirectory,
} from './key-directory.js';

export {
  FilesystemMarketplaceStore,
  InMemoryMarketplaceStore,
  compareSemver,
  type MarketplaceStore,
} from './store.js';

export {
  MARKETPLACE_PREFIX,
  handleMarketplacePersonaRequest,
  verifyAuthorSignature,
} from './routes.js';

// V-6.d — review / curation flow.
export {
  FilesystemReviewStore,
  InMemoryReviewStore,
  InMemoryReviewerKeyDirectory,
  makePendingReviewRecord,
  type ReviewStore,
  type ReviewerKeyDirectory,
} from './review-store.js';

export {
  MARKETPLACE_REVIEW_PREFIX,
  handleMarketplaceReviewRequest,
  signingInputForReview,
  verifyReviewerSignature,
} from './review-routes.js';

export {
  MARKETPLACE_INDEX_PATH,
  handleMarketplaceIndexRequest,
  type MarketplaceListingWire,
} from './index-routes.js';
