// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `runMarketplaceEval` — orchestrates the V-6.e nightly eval gate.
 *
 * Pipeline per persona:
 *   1. List approved addresses (`opts.approved.list()`).
 *   2. Rank + bound to top-N (default: alphabetical on the canonical
 *      address string, top 10 — see `EvalOpts.rank` / `EvalOpts.top`).
 *   3. Fetch the bundle (`opts.fetcher.fetch(address)`).
 *   4. Verify the ed25519 signature (`opts.verify`, default node:crypto-
 *      backed; tests pass `null` to skip).
 *   5. Parse the payload as a `Manifest` (recipes ARE manifests on the
 *      wire — `recipes/dummyjson-shopper.json` matches `ManifestSchema`
 *      one-to-one).
 *   6. For every layout-bearing route in the recipe, call `opts.compile`
 *      (default: a deterministic synthesizer that simply re-emits the
 *      route's manifest with a refreshed `compiled_from`).
 *   7. Re-validate each compiled manifest against `ManifestSchema` AND
 *      `validateManifest` from `@atelier/policies`.
 *   8. Aggregate per-persona pass / fail / skip into `EvalReport`.
 *
 * The result is a stable wire shape (`EvalReport`) the CLI shim writes to
 * `eval-results/<date>.json` and the GitHub Action uploads as a 90-day
 * artifact + opens an issue against on regression.
 */

import { createPublicKey, createHash, verify as nodeVerify } from 'node:crypto';

import {
  ManifestSchema,
  SignedBundleSchema,
  canonicalJsonStringify,
  formatMarketplaceAddress,
  signingInputForBundle,
  type Capability,
  type Manifest,
  type MarketplaceAddress,
  type SignedBundle,
} from '@atelier/schemas';
import { validateManifest, type PolicyContext, type PolicyViolation } from '@atelier/policies';

import { REFERENCE_CAPABILITIES, REFERENCE_COMPONENTS } from './fixtures/index.js';
import { PRICING_REVISION, costUsdFor } from './pricing.js';
import type {
  CompileFn,
  EvalOpts,
  EvalReport,
  EvalViolation,
  LlmEvalCompileResult,
  PersonaEvalResult,
  ReferenceFixtures,
  ReferenceVersions,
} from './types.js';

/** Hard cap on personas walked per run. See `EvalOpts.top`. */
const DEFAULT_TOP = 10;

/**
 * Default ranking: lexicographic on the canonical
 * `atelier://author/persona@version` string. Documented in
 * `apps/docs/src/content/docs/marketplace/eval-gate.mdx` as the v0
 * ordering — once V-6.d ships download counts the default flips.
 */
function defaultRank(a: MarketplaceAddress, b: MarketplaceAddress): number {
  return formatMarketplaceAddress(a).localeCompare(formatMarketplaceAddress(b));
}

/**
 * Default deterministic compile: round-trip the recipe's own route layout
 * through `ManifestSchema`. The output is a minimum-fidelity manifest the
 * gate validates as if a real compiler had produced it.
 *
 * No LLM dep — the gate runs in plain CI with no Gemini key, every time.
 * Hosts that want a real-LLM gate inject `opts.compile` directly.
 */
const defaultCompile: CompileFn = ({ recipe, route }) => {
  const target = recipe.routes.find((r) => r.path === route);
  if (target === undefined) {
    throw new Error(`route '${route}' not present in recipe`);
  }
  const compiled: Manifest = {
    ...recipe,
    routes: [target],
    compiled_from: {
      ...recipe.compiled_from,
      compiler_model: 'eval-marketplace-fallback',
      compiled_at: recipe.compiled_from.compiled_at,
    },
  };
  return Promise.resolve({ manifest: compiled, model: 'eval-marketplace-fallback' });
};

/** SHA-256 hex of the canonical JSON of `value`. Stable across key order. */
function digest(value: unknown): string {
  return createHash('sha256').update(canonicalJsonStringify(value), 'utf8').digest('hex');
}

/**
 * S2.1 — manifest shape hash. SHA-256 hex of the canonical JSON of the
 * manifest with `manifest_id` removed. Server-stamped ids rotate per
 * compile and would falsely flag every run as "shape-changed"; stripping
 * them gives a stable hash that the workflow's WoW gate can diff.
 */
function manifestShapeHash(manifest: Manifest): string {
  // Avoid mutating the caller's object — clone shallowly + drop the id.
  const { manifest_id: _ignored, ...rest } = manifest;
  void _ignored;
  return digest(rest);
}

/**
 * Build a `CompileFn` backed by a real `GeminiCompiler` from
 * `@atelier/compiler`. Lazy-imported so the deterministic mode keeps a
 * thin runtime dep graph (no `@google/genai` pull-in unless the host
 * actually opted in). `geminiApiKey` is required; the model id defaults
 * to `gemini-2.5-flash` (cost-conscious tier).
 *
 * The wrapped impl invokes the real compiler with the recipe's own route
 * as the seed manifest, captures the response's `token_cost` +
 * `duration_ms`, and threads them through `CompileFnResult`. Without
 * `usageMetadata` Gemini bills get reported as 0 cost — which we accept
 * rather than failing the run; the dashboard surfaces the mismatch.
 */
async function buildRealLlmCompile(opts: { apiKey: string; model: string }): Promise<CompileFn> {
  // Inline import keeps the deterministic gate free of `@google/genai`.
  const compilerMod = await import('@atelier/compiler');
  const compiler = new compilerMod.GeminiCompiler({
    apiKey: opts.apiKey,
    coldModel: opts.model,
    diffModel: opts.model,
  });
  const fn: CompileFn = async ({ recipe, route, capabilities, components }) => {
    const result = await compiler.compile({
      user_id: recipe.user_id,
      app_id: recipe.app_id,
      route,
      capabilities,
      components,
    });
    // `token_cost` from `CompileResult` is the prompt+candidate sum.
    // We don't get the split back from `GeminiCompiler` today — assume
    // a 50/50 split as a stand-in. Hosts that want true split metrics
    // wire their own `compile` impl that consumes Gemini's
    // `usageMetadata` directly.
    const total = result.token_cost;
    const half = Math.floor(total / 2);
    return {
      manifest: result.manifest,
      model: result.model,
      tokens_input: half,
      tokens_output: total - half,
      duration_ms: result.duration_ms,
    };
  };
  return fn;
}

/** Re-export of the Phase-2-#5 expected SPKI prefix for an Ed25519 public key. */
const ED25519_SPKI_PREFIX = Buffer.from([
  0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
]);

/**
 * Default node:crypto-backed signature verifier. Mirrors
 * `verifyBundleSignature` from `@atelier/vault-server` but stays
 * inline so this package keeps a thin runtime dep graph.
 */
function defaultVerify(raw: unknown): { ok: true } | { ok: false; reason: string } {
  const parsed = SignedBundleSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, reason: `malformed bundle: ${parsed.error.message}` };
  }
  const bundle = parsed.data;
  let publicKeyBytes: Buffer;
  try {
    publicKeyBytes = Buffer.from(bundle.public_key, 'base64');
  } catch {
    return { ok: false, reason: 'public_key is not valid base64' };
  }
  if (publicKeyBytes.length !== 32) {
    return { ok: false, reason: 'public_key must be 32 raw ed25519 bytes' };
  }
  const expectedKid = createHash('sha256').update(publicKeyBytes).digest('hex').slice(0, 16);
  if (expectedKid !== bundle.key_id) {
    return {
      ok: false,
      reason: `key_id ${bundle.key_id} does not match public_key (${expectedKid})`,
    };
  }
  const spki = Buffer.concat([ED25519_SPKI_PREFIX, publicKeyBytes]);
  let publicKey;
  try {
    publicKey = createPublicKey({ key: spki, format: 'der', type: 'spki' });
  } catch (err) {
    return { ok: false, reason: `public_key import failed: ${(err as Error).message}` };
  }
  const signingInput = signingInputForBundle({
    address: bundle.address,
    payload: bundle.payload,
    timestamp: bundle.timestamp,
  });
  const signatureBytes = Buffer.from(bundle.signature, 'base64');
  const ok = nodeVerify(null, Buffer.from(signingInput, 'utf8'), publicKey, signatureBytes);
  if (!ok) return { ok: false, reason: 'bad signature' };
  return { ok: true };
}

/**
 * Map `PolicyViolation` (from the policy engine) to the gate's stable
 * `EvalViolation` shape. Drops `'info'` advisories — they're per-binding
 * defaults the runtime papers over and not eval-grade signal.
 */
function toEvalViolation(v: PolicyViolation, route?: string): EvalViolation | null {
  if (v.severity === 'info') return null;
  const out: EvalViolation = {
    rule: v.policy_id,
    severity: v.severity === 'error' ? 'error' : 'warning',
    message: v.message,
  };
  if (route !== undefined) out.route = route;
  return out;
}

/**
 * Build a permissive `PolicyContext` against the frozen capability set.
 *
 * The gate doesn't model per-user grants; every capability is granted
 * unconditionally so the validator only flags genuine contract violations
 * (missing state slots, bad composition, unsigned destructive actions,
 * etc.). PII / rate-limit sets are empty for the same reason — those are
 * host-policy concerns, not framework ones.
 */
function buildContext(manifest: Manifest, capabilities: Record<string, Capability>): PolicyContext {
  return {
    manifest,
    capabilities,
    intent: {
      user_id: manifest.user_id,
      global_preferences: {},
      // `'*'` matches every field in `data_access_within_grant`.
      granted_fields: Object.keys(capabilities).map((id) => `${id}.*`),
    },
    rate_limited_capability_ids: new Set(),
    pii_fields: new Set(),
  };
}

/**
 * The orchestrator. Walk approved → rank → top-N → fetch → verify →
 * parse → compile → validate → aggregate.
 *
 * Throws ONLY on internal bugs (e.g. a fixture file missing). Every
 * per-persona failure is captured in the report; the runner never
 * surfaces a thrown error to the caller for a single bad persona.
 */
export async function runMarketplaceEval(opts: EvalOpts): Promise<EvalReport> {
  const now = opts.now ?? Date.now;
  const top = opts.top ?? DEFAULT_TOP;
  const rank = opts.rank ?? defaultRank;
  const mode = opts.mode ?? 'deterministic';
  const llmModel = opts.llmModel ?? 'gemini-2.5-flash';
  // Resolve the compile function:
  //   1. explicit `opts.compile` always wins (test-injection seam).
  //   2. else when `mode === 'real-llm'`, lazy-build the GeminiCompiler-
  //      backed impl (requires `geminiApiKey`).
  //   3. else fall through to the deterministic round-trip compile.
  let compile: CompileFn;
  if (opts.compile !== undefined) {
    compile = opts.compile;
  } else if (mode === 'real-llm') {
    if (!opts.geminiApiKey) {
      throw new Error(
        "runMarketplaceEval: mode='real-llm' requires `geminiApiKey` (or pass `compile` to inject your own).",
      );
    }
    compile = await buildRealLlmCompile({ apiKey: opts.geminiApiKey, model: llmModel });
  } else {
    compile = defaultCompile;
  }
  // Local-fixtures mode forces `verify: null` (files are unsigned) AND
  // stamps `signature_verified: false` on every persona — even when the
  // caller explicitly passed a verifier, because the source is
  // unverifiable by definition. An explicit `verify: null` from the
  // caller has the same effect on the verification step BUT does not
  // set the signature_verified flag, so a test harness using `null` to
  // skip verify on a vault-shaped fixture isn't accidentally relabelled.
  const localFixturesMode = opts.localFixtures !== undefined;
  const verify = localFixturesMode ? null : opts.verify === undefined ? defaultVerify : opts.verify;
  const fixtures: ReferenceFixtures = {
    capabilities: opts.fixtures.capabilities,
    components: opts.fixtures.components,
  };

  const startedAt = now();
  const generated_at = new Date(startedAt).toISOString();

  // Snapshot the reference versions BEFORE any work — the digests are over
  // the fixtures we received, not whatever defaults we'd substitute later.
  const reference_versions: ReferenceVersions = {
    capabilities_hash: digest(fixtures.capabilities),
    components_hash: digest(fixtures.components),
    compiler_version: 'pending',
  };

  const approved = await Promise.resolve(opts.approved.list());
  const ranked = [...approved].sort(rank);
  const limited = top > 0 ? ranked.slice(0, top) : ranked;

  const personas: PersonaEvalResult[] = [];
  let observedCompilerModel: string | undefined;

  for (const address of limited) {
    const personaStart = now();
    const result = await runOne({ address, opts, fixtures, verify, compile, mode });
    result.persona.duration_ms = now() - personaStart;
    if (localFixturesMode) {
      // Local-fixtures recipes are unsigned. Stamp every persona — the
      // `skipped` ones too — so the report is unambiguous about which
      // path actually ran the V-1 verifier.
      result.persona.signature_verified = false;
    }
    personas.push(result.persona);
    if (observedCompilerModel === undefined && result.model !== undefined) {
      observedCompilerModel = result.model;
    }
  }

  reference_versions.compiler_version =
    observedCompilerModel ?? (mode === 'real-llm' ? llmModel : 'eval-marketplace-fallback');

  const summary: EvalReport['summary'] = {
    total: personas.length,
    passed: personas.filter((p) => p.status === 'passed').length,
    failed: personas.filter((p) => p.status === 'failed').length,
    skipped: personas.filter((p) => p.status === 'skipped').length,
    duration_ms: now() - startedAt,
  };

  // S2.1 — fold per-persona cost rows into the summary. Only emit the
  // cost columns when at least one persona produced an `llm` block;
  // deterministic-mode reports stay back-compat.
  const llmRows = personas
    .map((p) => p.llm)
    .filter((row): row is LlmEvalCompileResult => row !== undefined);
  if (llmRows.length > 0) {
    const costs = llmRows.map((r) => r.cost_usd);
    const totalCost = costs.reduce((acc, c) => acc + c, 0);
    summary.total_cost_usd = totalCost;
    summary.cost_per_persona_avg_usd = totalCost / costs.length;
    summary.cost_per_persona_p95_usd = percentile(costs, 0.95);
    summary.total_tokens_input = llmRows.reduce((acc, r) => acc + r.tokens_input, 0);
    summary.total_tokens_output = llmRows.reduce((acc, r) => acc + r.tokens_output, 0);
    summary.pricing_revision = PRICING_REVISION;
  }

  return { generated_at, reference_versions, personas, summary };
}

/**
 * Plain-arithmetic percentile. Uses the linear-interpolation method:
 * for a sorted array of length n, target index = (n - 1) * p. Returns
 * the value at that fractional index, interpolating between neighbours.
 *
 * Keeps an external dep out of the eval package — the gate is small
 * enough that hand-rolling beats pulling in a stats library.
 */
function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo] ?? 0;
  const frac = idx - lo;
  return (sorted[lo] ?? 0) * (1 - frac) + (sorted[hi] ?? 0) * frac;
}

interface RunOneInput {
  address: MarketplaceAddress;
  opts: EvalOpts;
  fixtures: ReferenceFixtures;
  verify: EvalOpts['verify'];
  compile: CompileFn;
  mode: 'deterministic' | 'real-llm';
}

interface RunOneOutput {
  persona: PersonaEvalResult;
  /** First non-default model id observed across this persona's compiles. */
  model?: string | undefined;
}

/**
 * Inner per-persona pipeline. Returns a partially-populated `persona` —
 * the caller fills in `duration_ms` after the surrounding `now()` call.
 */
async function runOne(input: RunOneInput): Promise<RunOneOutput> {
  const { address, opts, fixtures, verify, compile, mode } = input;
  const canonical = formatMarketplaceAddress({
    scheme: 'atelier',
    author: address.author,
    persona: address.persona,
    version: address.version,
  });

  // ---- 1. Fetch -------------------------------------------------------
  let raw: unknown;
  try {
    raw = await Promise.resolve(opts.fetcher.fetch(address));
  } catch (err) {
    return skipped(canonical, `fetch failed: ${(err as Error).message}`);
  }
  if (raw === null || raw === undefined) {
    return skipped(canonical, 'fetch returned no bundle (404)');
  }

  // ---- 2. Verify ------------------------------------------------------
  if (verify !== null) {
    const fn = verify ?? defaultVerify;
    let result: { ok: true } | { ok: false; reason: string };
    try {
      result = await Promise.resolve(fn(raw));
    } catch (err) {
      return skipped(canonical, `signature verification threw: ${(err as Error).message}`);
    }
    if (!result.ok) {
      return skipped(canonical, `signature verification failed: ${result.reason}`);
    }
  }

  // ---- 3. Parse -------------------------------------------------------
  // The bundle wraps an unknown payload; recipes ARE manifests on the
  // wire. If `raw` already looks like a SignedBundle (has `payload`)
  // unwrap it; otherwise treat the value itself as the recipe.
  const candidate = unwrapPayload(raw);
  const recipeParsed = ManifestSchema.safeParse(candidate);
  if (!recipeParsed.success) {
    return skipped(
      canonical,
      `payload is not a Manifest: ${shortenZodMessage(recipeParsed.error.message)}`,
    );
  }
  const recipe = recipeParsed.data;

  // ---- 4. Compile + validate every route -----------------------------
  const violations: EvalViolation[] = [];
  let routesCompiled = 0;
  let observedModel: string | undefined;
  // S2.1 — per-persona LLM telemetry accumulators. Set only when at
  // least one route compile reports token / duration data; the runner
  // doesn't manufacture zero-cost rows for deterministic compiles.
  let llmTokensInput = 0;
  let llmTokensOutput = 0;
  let llmDurationMs = 0;
  let firstCompiledManifest: Manifest | undefined;
  let observedLlmTelemetry = false;
  for (const route of recipe.routes) {
    if (route.layout === undefined) {
      // Redirect-only routes don't compile to a manifest layout.
      routesCompiled += 1;
      continue;
    }
    let compiled: Awaited<ReturnType<CompileFn>>;
    try {
      compiled = await compile({
        recipe,
        route: route.path,
        capabilities: fixtures.capabilities,
        components: fixtures.components,
      });
    } catch (err) {
      violations.push({
        route: route.path,
        rule: 'compile_failed',
        severity: 'error',
        message: `compile threw: ${(err as Error).message}`,
      });
      continue;
    }
    routesCompiled += 1;
    if (observedModel === undefined) observedModel = compiled.model;
    if (
      compiled.tokens_input !== undefined ||
      compiled.tokens_output !== undefined ||
      compiled.duration_ms !== undefined
    ) {
      observedLlmTelemetry = true;
      llmTokensInput += compiled.tokens_input ?? 0;
      llmTokensOutput += compiled.tokens_output ?? 0;
      llmDurationMs += compiled.duration_ms ?? 0;
    }

    // Re-validate the compiled manifest envelope.
    const envelope = ManifestSchema.safeParse(compiled.manifest);
    if (!envelope.success) {
      violations.push({
        route: route.path,
        rule: 'manifest_schema',
        severity: 'error',
        message: `compiled manifest fails ManifestSchema: ${shortenZodMessage(envelope.error.message)}`,
      });
      continue;
    }

    // Capture the first successfully-validated compiled manifest for
    // the shape hash. We hash the parsed (post-Zod) envelope so optional
    // fields the compiler omitted don't perturb the hash arbitrarily.
    if (firstCompiledManifest === undefined) {
      firstCompiledManifest = envelope.data;
    }

    // Run the policy stack.
    const ctx = buildContext(envelope.data, fixtures.capabilities);
    const policyResult = validateManifest(ctx, opts.strict ? { strict: true } : undefined);
    for (const v of policyResult.violations) {
      const ev = toEvalViolation(v, route.path);
      if (ev !== null) violations.push(ev);
    }
  }

  const errorCount = violations.filter((v) => v.severity === 'error').length;
  const status: PersonaEvalResult['status'] =
    errorCount > 0 || (opts.strict === true && violations.length > 0) ? 'failed' : 'passed';

  const persona: PersonaEvalResult = {
    address: canonical,
    status,
    duration_ms: 0,
    routes_compiled: routesCompiled,
  };
  if (status === 'failed') persona.violations = violations;

  // S2.1 — emit the `llm` block when:
  //   - the runner is in real-llm mode AND we observed telemetry from
  //     at least one compile, OR
  //   - the test injected a `compile` impl that opted-in by returning
  //     token/duration fields (test seam — keeps the runner-llm tests
  //     deterministic without a real Gemini key).
  // We always need at least one validated manifest for the shape hash;
  // when none compiled successfully (e.g. every route threw), we skip
  // the LLM block — there's nothing to hash.
  if ((mode === 'real-llm' || observedLlmTelemetry) && firstCompiledManifest !== undefined) {
    const modelId = observedModel ?? 'eval-marketplace-fallback';
    persona.llm = {
      mode: 'real-llm',
      model: modelId,
      tokens_input: llmTokensInput,
      tokens_output: llmTokensOutput,
      cost_usd: costUsdFor(modelId, llmTokensInput, llmTokensOutput),
      compile_duration_ms: llmDurationMs,
      manifest_shape_hash: manifestShapeHash(firstCompiledManifest),
    };
  }

  return observedModel === undefined ? { persona } : { persona, model: observedModel };
}

/** Helper: shaped result for the "couldn't even validate" case. */
function skipped(address: string, reason: string): RunOneOutput {
  return {
    persona: { address, status: 'skipped', duration_ms: 0, error: reason },
  };
}

/**
 * If `raw` looks like a `SignedBundle` (wrapper with `payload`), unwrap to
 * the payload. Otherwise return as-is — this lets the in-memory test
 * harness pass either a bundle or a raw recipe.
 */
function unwrapPayload(raw: unknown): unknown {
  if (
    raw !== null &&
    typeof raw === 'object' &&
    'payload' in raw &&
    'signature' in raw &&
    'address' in raw
  ) {
    return (raw as SignedBundle).payload;
  }
  return raw;
}

/** Strip Zod's noisy verbose message tail down to the first issue line. */
function shortenZodMessage(msg: string): string {
  const trimmed = msg.trim();
  if (trimmed.length <= 240) return trimmed;
  return `${trimmed.slice(0, 240)}…`;
}

/** Default fixture pair — sugar for hosts that want the frozen reference set as-is. */
export const DEFAULT_FIXTURES: ReferenceFixtures = {
  capabilities: REFERENCE_CAPABILITIES,
  components: REFERENCE_COMPONENTS,
};

/**
 * Sugar for the V-6.b consume endpoint. Returns a `BundleFetcher` that
 * GETs `/marketplace/persona/<author>/<persona>@<version>` against the
 * given vault URL and returns the parsed JSON.
 *
 * The fetcher does NOT verify the signature itself — `runMarketplaceEval`
 * does that in the next step. Returning `null` on 404 lets the runner
 * record the persona as `skipped` rather than crashing the whole run.
 */
export function httpBundleFetcher(opts: {
  vaultUrl: string;
  fetcher?: (url: string) => Promise<{ status: number; json: () => Promise<unknown> }>;
}): { fetch: (address: MarketplaceAddress) => Promise<unknown> } {
  const f = opts.fetcher ?? defaultHttpFetcher;
  return {
    async fetch(address) {
      const url =
        `${opts.vaultUrl.replace(/\/$/, '')}/marketplace/persona/` +
        `${encodeURIComponent(address.author)}/` +
        `${encodeURIComponent(address.persona)}@${encodeURIComponent(address.version)}`;
      const res = await f(url);
      if (res.status === 404) return null;
      if (res.status < 200 || res.status >= 300) {
        throw new Error(`HTTP ${String(res.status)}`);
      }
      return res.json();
    },
  };
}

/** Default fetch-shaped HTTP client built on the global `fetch`. */
async function defaultHttpFetcher(
  url: string,
): Promise<{ status: number; json: () => Promise<unknown> }> {
  const res = await fetch(url);
  return { status: res.status, json: () => res.json() };
}
