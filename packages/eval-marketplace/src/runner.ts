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
import type {
  CompileFn,
  EvalOpts,
  EvalReport,
  EvalViolation,
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
  const compile = opts.compile ?? defaultCompile;
  const verify = opts.verify === undefined ? defaultVerify : opts.verify;
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
    const result = await runOne({ address, opts, fixtures, verify, compile });
    result.persona.duration_ms = now() - personaStart;
    personas.push(result.persona);
    if (observedCompilerModel === undefined && result.model !== undefined) {
      observedCompilerModel = result.model;
    }
  }

  reference_versions.compiler_version = observedCompilerModel ?? 'eval-marketplace-fallback';

  const summary = {
    total: personas.length,
    passed: personas.filter((p) => p.status === 'passed').length,
    failed: personas.filter((p) => p.status === 'failed').length,
    skipped: personas.filter((p) => p.status === 'skipped').length,
    duration_ms: now() - startedAt,
  };

  return { generated_at, reference_versions, personas, summary };
}

interface RunOneInput {
  address: MarketplaceAddress;
  opts: EvalOpts;
  fixtures: ReferenceFixtures;
  verify: EvalOpts['verify'];
  compile: CompileFn;
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
  const { address, opts, fixtures, verify, compile } = input;
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
