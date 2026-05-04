// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Frozen reference fixtures for the V-6.e marketplace eval gate.
 *
 * The two files mirror the most-active demos in `apps/demo` at the
 * granularity the policy validator cares about. The gate hashes them
 * (canonical-JSON + SHA-256) and folds the digests into
 * `EvalReport.reference_versions`, so a regression report taken before
 * a fixture bump is reproducible against the same set later.
 */

export { REFERENCE_CAPABILITIES } from './capabilities.js';
export { REFERENCE_COMPONENTS } from './components.js';
