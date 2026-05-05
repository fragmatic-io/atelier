// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `@atelier/eval-marketplace` — public surface for the V-6.e nightly
 * marketplace eval gate.
 *
 * The gate proves the top-N currently-approved personas still compile
 * cleanly against the framework's CURRENT contract — schema + baseline
 * policies. If they don't, the breakage shows up in CI before users hit
 * it. See `apps/docs/src/content/docs/marketplace/eval-gate.mdx` for the
 * end-to-end story.
 *
 * Quick wire-up (see `scripts/marketplace-eval.ts` for the CLI shim):
 *
 *     import {
 *       runMarketplaceEval,
 *       httpBundleFetcher,
 *       DEFAULT_FIXTURES,
 *     } from '@atelier/eval-marketplace';
 *
 *     const report = await runMarketplaceEval({
 *       approved,             // V-6.d / fallback list
 *       fetcher: httpBundleFetcher({ vaultUrl }),
 *       fixtures: DEFAULT_FIXTURES,
 *       top: 10,
 *     });
 */

export { runMarketplaceEval, httpBundleFetcher, DEFAULT_FIXTURES } from './runner.js';

export {
  loadLocalFixtures,
  LOCAL_FIXTURES_AUTHOR,
  LOCAL_FIXTURES_VERSION,
  type LocalFixturesOptions,
  type LocalFixturesSource,
  type LocalFixtureEntry,
} from './local-fixtures.js';

export type {
  ApprovedPersonaList,
  BundleFetcher,
  CompileFn,
  CompileFnInput,
  CompileFnResult,
  EvalOpts,
  EvalReport,
  EvalSummary,
  EvalViolation,
  LlmEvalCompileResult,
  PersonaEvalResult,
  ReferenceFixtures,
  ReferenceVersions,
} from './types.js';

export { REFERENCE_CAPABILITIES, REFERENCE_COMPONENTS } from './fixtures/index.js';

// S2.1 — pricing tables for the real-LLM cost column.
export { GEMINI_PRICING, PRICING_REVISION, costUsdFor, pricingFor } from './pricing.js';
export type { ModelPricing } from './pricing.js';

// S2.2 — cost dashboard aggregator.
export {
  summariseLastNRuns,
  type CostSummary,
  type CostSummaryPersona,
  type CostTrend,
} from './dashboard.js';
