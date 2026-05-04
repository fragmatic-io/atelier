// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Barrel for the V-6 marketplace persona endpoints. Exports the route
 * handler, the storage interface + impls, and the key-directory contract.
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
