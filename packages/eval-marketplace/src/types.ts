// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Public types for `@atelier/eval-marketplace` — V-6.e marketplace eval gate.
 *
 * The gate runs once a night against a marketplace vault: for each approved
 * persona it consumes the bundle (V-6.b), verifies the ed25519 signature,
 * compiles every route the recipe declares against a frozen capability +
 * component reference set, and validates each compiled manifest against
 * `ManifestSchema` AND the baseline policies in `@atelier/policies`. The
 * resulting `EvalReport` is uploaded as a CI artifact and surfaces a per-
 * persona pass / fail / skipped breakdown.
 *
 * Skipped vs. failed:
 *   - `skipped` — we couldn't even get to the validation stage (signature
 *     verify failed, fetch failed, malformed bundle, payload didn't parse
 *     as a recipe). The persona is not a regression — it's a publish-side
 *     bug we record but don't gate the build on.
 *   - `failed`  — the persona compiled into a manifest, but the manifest
 *     either didn't satisfy `ManifestSchema` or hit one or more error-
 *     severity policy violations. THIS is the regression bucket — it means
 *     the framework's contract drifted under a published persona.
 *   - `passed`  — every route compiled, every manifest typechecked, and no
 *     error-severity policy violations fired.
 *
 * The report shape is stable because dashboards and the GitHub-Actions
 * issue-opener consume it directly. `generated_at` and durations are the
 * only fields downstream tooling MUST strip before snapshotting.
 */

import type { PolicySeverity } from '@atelier/policies';
import type {
  Capability,
  ComponentDefinition,
  Manifest,
  MarketplaceAddress,
} from '@atelier/schemas';

/**
 * One violation in the report. Mirrors `PolicyViolation` minus the
 * implementation-specific `policy_id` / `path` fields — those become `rule`
 * and the optional `route` so the eval surface is stable across compiler
 * implementations (a future Gemini-backed gate can produce the same shape
 * even if the underlying policy names rotate).
 */
export interface EvalViolation {
  /**
   * Route path the violation was found on, when the gate could attribute
   * it. Manifest-level violations (e.g. schema parse failure on the
   * manifest envelope) leave this unset.
   */
  route?: string;
  /**
   * Stable rule identifier — the `policy_id` from `@atelier/policies` for
   * baseline policies, or `'manifest_schema'` / `'compile_failed'` for
   * the framework-shaped failures the gate manufactures.
   */
  rule: string;
  /**
   * `'error'` blocks the persona (counts toward `failed`); `'warning'`
   * (rendered as `warn` in policy output but normalised here) is recorded
   * but does not fail the persona on its own. Mirrors `PolicySeverity` minus
   * `'info'` — info-severity advisories are dropped from the eval report.
   */
  severity: 'error' | 'warning';
  /** Human-readable message — surfaced verbatim in the issue body. */
  message: string;
}

/** Per-persona slot in the report. */
export interface PersonaEvalResult {
  /**
   * Canonical `atelier://author/persona@version` string — the same form
   * `formatMarketplaceAddress` produces, so report consumers can deep-link
   * back into the marketplace browser without re-parsing.
   */
  address: string;
  status: 'passed' | 'failed' | 'skipped';
  /** Wall-clock for this persona alone — fetch + verify + compile + validate. */
  duration_ms: number;
  /**
   * Number of routes the gate compiled for this persona. Only set when
   * status is `passed` or `failed` (skipped personas never reached compile).
   */
  routes_compiled?: number;
  /**
   * The set of policy / schema violations that fired against the persona's
   * compiled manifests. Always present on `failed`, always omitted on
   * `passed`, sometimes present on `skipped` if the schema parse already
   * surfaced something machine-readable before the gate gave up.
   */
  violations?: EvalViolation[];
  /**
   * Free-form failure reason — set ONLY on `skipped` (the persona never
   * reached the validation stage). Examples: `'signature verification
   * failed: bad signature'`, `'fetch failed: HTTP 404'`, `'payload is not
   * a Manifest'`.
   */
  error?: string;
}

/**
 * Reference-version block. Pinned per gate run so a regression report can
 * be reproduced exactly later. The hashes cover the JSON-stringified
 * frozen sets — same fixture = same hash, modulo key order (the strings
 * are produced via canonical JSON).
 */
export interface ReferenceVersions {
  /** SHA-256 hex of the canonical JSON of the capability fixture set. */
  capabilities_hash: string;
  /** SHA-256 hex of the canonical JSON of the component fixture set. */
  components_hash: string;
  /**
   * Identifier of the compiler the gate runs against — typically
   * `'fallback-generic'` for the deterministic gate, or a model id when
   * the gate lifts to a real LLM compile. Mirrored from
   * `CompileResult.model` so it can be diffed across runs.
   */
  compiler_version: string;
}

/** Aggregate counts. Written even when `personas` is empty so the dashboard always has a row. */
export interface EvalSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration_ms: number;
}

/**
 * The wire shape an eval gate run produces. Persisted as JSON under
 * `eval-results/<date>.json` (see the CLI shim) and uploaded as a CI
 * artifact with 90-day retention.
 */
export interface EvalReport {
  /** ISO-8601 UTC timestamp at the moment the runner started. */
  generated_at: string;
  reference_versions: ReferenceVersions;
  /** Per-persona results, in the same order the runner walked through them. */
  personas: PersonaEvalResult[];
  summary: EvalSummary;
}

/**
 * Source the runner pulls "currently-approved persona" addresses from.
 * V-6.d (review/curation) hasn't shipped yet, so the default impl just
 * lists every bundle in a `MarketplaceStore` — every published persona is
 * implicitly approved. Once V-6.d lands, hosts swap in a curated impl that
 * reads the review-store's approved set.
 */
export interface ApprovedPersonaList {
  /**
   * Return the set of marketplace addresses considered "approved" right
   * now. Order does not matter — the runner ranks them itself (see
   * `EvalOpts.rank`).
   */
  list(): Promise<MarketplaceAddress[]> | MarketplaceAddress[];
}

/**
 * Bundle fetcher — given an address, return the signed bundle. The default
 * impl is HTTP-backed against the V-6.b consume endpoint; tests inject an
 * in-memory store directly to avoid the wire hop.
 */
export interface BundleFetcher {
  /**
   * Fetch the bundle at `address`. Returns `null` on a 404 / fetch failure
   * that the runner should treat as a `skipped`. Other fatal errors
   * (network down, malformed JSON) should throw — the runner records
   * them as a `skipped` with the error message.
   */
  fetch(address: MarketplaceAddress): Promise<unknown>;
}

/**
 * Frozen fixture set the gate compiles against. The hashes live in the
 * report so a regression run is reproducible even if `apps/demo` evolves.
 */
export interface ReferenceFixtures {
  capabilities: Record<string, Capability>;
  components: ComponentDefinition[];
}

/**
 * Options driving a single `runMarketplaceEval` invocation.
 *
 * `top` (default 10) bounds the runtime — see `docs/marketplace/eval-gate`.
 * The default ranking is alphabetical on the canonical address string;
 * hosts that want a different ranking (download count, manual curation,
 * etc.) supply `rank` directly.
 */
export interface EvalOpts {
  /** Where to fetch approved persona addresses from. */
  approved: ApprovedPersonaList;
  /** Where to fetch the actual bundles from. */
  fetcher: BundleFetcher;
  /** Reference capability + component fixtures. */
  fixtures: ReferenceFixtures;
  /**
   * Hard upper bound on how many personas to run. Defaults to 10 — sized
   * to keep the nightly job under ~15 minutes. Setting to 0 disables the
   * cap (NOT recommended in CI).
   */
  top?: number;
  /**
   * Optional ranking. The runner sorts the approved set with this
   * comparator and takes the first `top`. Default: alphabetical on
   * the canonical `atelier://...` address string — deterministic, and
   * a sensible "top 10" until V-6.d ships download-count signals.
   */
  rank?: (a: MarketplaceAddress, b: MarketplaceAddress) => number;
  /**
   * If `true`, treat warn-severity policy violations as failures (matches
   * `validateManifest({ strict: true })`). Default: false — the nightly
   * gate is intentionally lenient on warns; only error-severity drift
   * regresses a persona.
   */
  strict?: boolean;
  /**
   * Optional clock injection — tests pin `() => 0` so durations are
   * deterministic. Defaults to `Date.now`.
   */
  now?: () => number;
  /**
   * Verifier hook — `null` skips signature verification (used by the
   * in-memory test harness so we don't need to mint a real ed25519 key
   * for every fixture). Default: a node:crypto-backed verifier.
   *
   * Returning `{ ok: false, reason }` causes the runner to record the
   * persona as `skipped` with that reason; throwing surfaces the error
   * the same way.
   */
  verify?:
    | ((
        bundle: unknown,
      ) =>
        | Promise<{ ok: true } | { ok: false; reason: string }>
        | { ok: true }
        | { ok: false; reason: string })
    | null;
  /**
   * Compiler hook the runner uses to convert each route declaration into a
   * compiled manifest. Defaults to a deterministic `genericFallbackManifest`-
   * style synthesizer (no LLM dep, no Gemini key required) so the gate
   * runs in plain CI with no secrets. Hosts that want a real-Gemini
   * compile gate inject their own.
   */
  compile?: CompileFn;
}

/**
 * The compile contract the gate uses. Pulled out as a standalone shape
 * so we don't need a hard dep on `@atelier/compiler` (the gate can run
 * with any deterministic synthesizer, and the default impl lives inside
 * this package).
 */
export type CompileFn = (input: CompileFnInput) => Promise<CompileFnResult>;

export interface CompileFnInput {
  recipe: Manifest;
  route: string;
  capabilities: Record<string, Capability>;
  components: ComponentDefinition[];
}

export interface CompileFnResult {
  manifest: Manifest;
  /** Identifier of the compiler model — recorded in `reference_versions.compiler_version`. */
  model: string;
}

/** Re-exported so consumers don't need to also depend on `@atelier/policies` for this. */
export type { PolicySeverity };
