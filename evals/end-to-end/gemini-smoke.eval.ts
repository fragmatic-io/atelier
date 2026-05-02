// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * End-to-end smoke eval: real Gemini → real manifest → real policies → real walk.
 *
 * Skips gracefully when `GEMINI_API_KEY` is unset or obviously a placeholder,
 * so CI without the secret stays green. When the key is set, this is the one
 * eval that actually wires `CompositeCompiler` + `GeminiCompiler` + the
 * baseline policy bundle + `MapComponentRegistry` end-to-end and asserts the
 * round-trip produces a Manifest the runtime can render.
 *
 * Wave 1 covered the compiler unit-by-unit with an inline GoogleGenAI fake;
 * this wave hits the network. Witness, not framework — see
 * `/Users/vid/cir/docs/production-concerns.md` §"Evals" for the role of an
 * end-to-end smoke in the eval taxonomy.
 *
 * Sibling unit test (`gemini-smoke.test.ts`) pins the gating predicate.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineEval } from '@atelier/evals';
import {
  CompositeCompiler,
  FallbackCompiler,
  GeminiCompiler,
  type CompilerService,
} from '@atelier/compiler';
import {
  BASELINE_POLICIES,
  validateManifest,
  type PolicyContext,
  type PolicyViolation,
} from '@atelier/policies';
import { buildRenderPlan, MapComponentRegistry, type ComponentBinding } from '@atelier/runtime';
import {
  CapabilitySchema,
  ManifestSchema,
  type Capability,
  type ComponentDefinition,
  type Manifest,
} from '@atelier/schemas';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CAPABILITIES_DIR = path.join(REPO_ROOT, 'capabilities', 'github');

interface SmokeOutcome {
  skipped: boolean;
  reason?: string;
  /**
   * True when `compiler.compile(...)` failed with an auth-shaped error
   * (status 401/403 or a message matching the api-key / unauthenticated
   * patterns). Distinct from `skipped: true`, which means "no key was
   * configured at all". `auth_failed: true` means "a key was configured
   * but the provider rejected it" — which the nightly job MUST treat as
   * a hard failure rather than a silent no-op.
   *
   * Always `null` on the happy path so the field is present in JSON
   * output (a regression check the unit tests pin).
   */
  auth_failed?: boolean | null;
  /** Sanitized error message; the API key is replaced with `[REDACTED]`. */
  error_message?: string;
  manifest_id?: string;
  compiler_model?: string;
  compiler_model_is_gemini?: boolean;
  policy_pass?: boolean;
  policy_violations?: string[];
  route_count?: number;
  walked_route?: string;
  walked_node_count?: number;
}

/**
 * Recognize an auth-shaped error from `@google/genai`. The SDK throws
 * heterogeneous shapes — sometimes a thin wrapper around the HTTP response
 * with a `status` field, sometimes a plain `Error` whose `message` echoes
 * the upstream "API key not valid" / "Unauthorized" string. We accept any
 * of the shapes below as "yes, this is auth, fail loudly".
 *
 * Deliberately conservative: timeouts, network blips, schema validation
 * failures, and policy violations should NOT be mis-classified — those
 * have their own loud paths.
 */
export function isAuthShapedError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { status?: unknown; code?: unknown; message?: unknown };
  if (e.status === 401 || e.status === 403) return true;
  if (e.code === 401 || e.code === 403) return true;
  const msg = typeof e.message === 'string' ? e.message : '';
  if (msg.length === 0) return false;
  // Match the common Gemini / Google API auth-failure phrasings without
  // over-fitting to one wording. The two regexes together cover both
  // "API key" / "API_KEY_INVALID" callouts and the generic auth verbs.
  if (/api[\s_-]*key/i.test(msg)) return true;
  if (/unauthen|unauthor|forbidden|invalid.*credential|permission.*denied/i.test(msg)) return true;
  return false;
}

/**
 * Strip an API key from any string before logging it. Gemini occasionally
 * echoes the supplied key inside its error messages — never let that hit
 * stdout, the audit log, the eval JSON output, or anywhere downstream.
 */
export function redactApiKey(text: string, apiKey: string | undefined): string {
  if (!text) return text;
  if (!apiKey || apiKey.length < 8) return text;
  // Replace exact occurrences. We don't try to match partial / encoded
  // forms — the SDK echoes the literal key when it does echo at all.
  return text.split(apiKey).join('[REDACTED]');
}

/**
 * Dependency-injection seam for `runSmoke`. Production code passes nothing
 * and gets the real Gemini-backed `CompositeCompiler`. Tests pass a stub
 * compiler whose `compile()` throws the error shape under test, so we can
 * pin the auth-classification + redaction behavior without ever touching
 * the network.
 */
export interface SmokeDeps {
  /** Override for the env-keyed `hasRealGeminiKey` check. Tests use this to force the run-vs-skip branch. */
  envKeyResolver?: () => string | undefined;
  /** Override for the compiler. Tests inject a stub; production builds the real one. */
  compilerFactory?: (apiKey: string) => CompilerService;
}

/**
 * Gating predicate. Treats unset / placeholder values as "no key" so CI
 * (which never has a real key) skips cleanly. We accept any non-empty value
 * that isn't an obvious placeholder — Gemini keys begin with `AIza` in
 * practice but third-party gateways might mint different shapes, so we keep
 * this permissive rather than rejecting on prefix.
 */
export function hasRealGeminiKey(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const v = env['GEMINI_API_KEY'];
  if (!v) return false;
  const trimmed = v.trim();
  if (trimmed.length < 20) return false;
  const placeholders = new Set(['test', 'placeholder', 'fake', 'dummy', 'changeme', 'xxx']);
  if (placeholders.has(trimmed.toLowerCase())) return false;
  return true;
}

async function loadGitHubCapabilities(): Promise<Record<string, Capability>> {
  const entries = await fs.readdir(CAPABILITIES_DIR);
  const out: Record<string, Capability> = {};
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const raw = await fs.readFile(path.join(CAPABILITIES_DIR, entry), 'utf8');
    const parsed: Capability = CapabilitySchema.parse(JSON.parse(raw));
    out[parsed.id] = parsed;
  }
  return out;
}

/**
 * Minimal in-eval component catalog summary. We list ids the prompt builder
 * casts back via `(c as { id?: string }).id`. Keep small — token budget is
 * the LLM's, not ours.
 */
function smokeComponents(): ComponentDefinition[] {
  const ids = ['Stack', 'Container', 'Card', 'Markdown', 'Table', 'EmptyState', 'Button'];
  return ids.map(
    (id) =>
      ({
        id,
        props_schema: `${id}Props`,
        data_sources: [],
        actions_supported: [],
        responsive_targets: ['web'],
        design_tokens: '@atelier/components/baseline@0.1.0',
        examples: [],
        text_render: true,
      }) as unknown as ComponentDefinition,
  );
}

/** Race a promise against a timer. No new deps — `Promise.race` + setTimeout. */
async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${String(ms)}ms`)), ms);
    timer.unref?.();
  });
  try {
    const result: T = await Promise.race<T>([p, timeoutPromise]);
    return result;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

interface SmokeInput {
  route: string;
  user_id: string;
  app_id: string;
  intent_summary: string;
}

function defaultCompilerFactory(apiKey: string): CompilerService {
  const compilers: CompilerService[] = [
    new GeminiCompiler({
      apiKey,
      coldModel: process.env['GEMINI_COLD_MODEL'] ?? 'gemini-2.5-pro',
      diffModel: process.env['GEMINI_DIFF_MODEL'] ?? 'gemini-2.5-flash',
    }),
    // Fallback never fires here because we want a real Gemini result; if it
    // does we surface that loudly via the compiler_model assertion below.
    new FallbackCompiler({
      lookup: () => null,
      id: 'fallback-noop',
    }),
  ];
  return new CompositeCompiler(compilers);
}

export async function runSmoke(input: SmokeInput, deps: SmokeDeps = {}): Promise<SmokeOutcome> {
  const envKey = deps.envKeyResolver ? deps.envKeyResolver() : process.env['GEMINI_API_KEY'];
  if (!hasRealGeminiKey({ GEMINI_API_KEY: envKey })) {
    // eslint-disable-next-line no-console
    console.log('smoke skipped: no GEMINI_API_KEY');
    return { skipped: true, reason: 'no GEMINI_API_KEY' };
  }

  const apiKey = envKey ?? '';
  const capabilities = await loadGitHubCapabilities();
  const compiler = deps.compilerFactory
    ? deps.compilerFactory(apiKey)
    : defaultCompilerFactory(apiKey);

  const components = smokeComponents();

  // Cap network exposure: cold gemini-2.5-pro can run 20–60s; we give it 90s
  // before failing loudly. CI without a key skips before reaching this branch.
  // Auth-shaped failures (revoked / expired key) are caught and surfaced as
  // `auth_failed: true` so the nightly workflow fails loudly rather than
  // silently treating the run as "skipped".
  let compileResult;
  try {
    compileResult = await withTimeout(
      compiler.compile({
        user_id: input.user_id,
        app_id: input.app_id,
        route: input.route,
        capabilities,
        components,
        intent: {
          user_id: input.user_id,
          profile_version: 1,
          updated_at: '2026-04-30T00:00:00Z',
          global_preferences: { density: 'compact', summary: input.intent_summary },
          lenses: { github: 'maintainer' },
          rules: [],
          vocabulary: {},
        },
      }),
      90_000,
      'compiler.compile',
    );
  } catch (err: unknown) {
    if (isAuthShapedError(err)) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      const sanitized = redactApiKey(rawMsg, apiKey);
      console.error(`smoke auth_failed: ${sanitized}`);
      return {
        skipped: false,
        auth_failed: true,
        error_message: sanitized,
      };
    }
    // Non-auth failures (timeout, schema, policy, network) bubble up to the
    // eval runner, which records the eval as errored and exits non-zero —
    // already loud enough; no need for a special branch.
    throw err;
  }

  // Step 3: validate the manifest shape (compiler already does this internally,
  // but we redo it to make the contract explicit at the eval boundary).
  const manifest: Manifest = ManifestSchema.parse(compileResult.manifest);

  // Step 4: run the baseline policies. The grants list is permissive — the
  // smoke is for the path, not for grant-shape coverage.
  const policyCtx: PolicyContext = {
    manifest,
    capabilities,
    intent: {
      user_id: input.user_id,
      global_preferences: {},
      // Permissive grant: the policies' `data_access_within_grant` matches
      // wildcard segments per source. Capability ids we expose:
      //   github.repo.list, github.issue.create, github.issue.close
      granted_fields: ['github.repo.list.*', 'github.issue.create.*', 'github.issue.close.*'],
    },
    rate_limited_capability_ids: new Set(Object.keys(capabilities)),
    pii_fields: new Set<string>(),
  };
  const policyResult = validateManifest(policyCtx, { policies: BASELINE_POLICIES });
  const policyMessages = policyResult.violations.map(
    (v: PolicyViolation) => `${v.severity}:${v.policy_id}@${v.path}: ${v.message}`,
  );

  // Step 5: build a registry, walk the first renderable route, count nodes.
  const registry = new MapComponentRegistry();
  for (const c of components) {
    const id = (c as { id?: string }).id;
    if (!id) continue;
    const binding: ComponentBinding = { id, factory: { kind: 'smoke-stub' } };
    registry.register(binding);
  }

  const renderable = manifest.routes.find((r) => r.layout !== undefined);
  let walkedRoute: string | undefined;
  let walkedNodeCount = 0;
  if (renderable) {
    const plan = buildRenderPlan(manifest, renderable.path, registry);
    walkedRoute = plan.routePath;
    walkedNodeCount = countRenderNodes(plan.root);
  }

  // Step 6: assert the compiler model id contains "gemini" (substring match).
  const compilerModelIsGemini = compileResult.model.toLowerCase().includes('gemini');

  const outcome: SmokeOutcome = {
    skipped: false,
    auth_failed: null,
    manifest_id: manifest.manifest_id,
    compiler_model: compileResult.model,
    compiler_model_is_gemini: compilerModelIsGemini,
    policy_pass: policyResult.ok,
    policy_violations: policyMessages,
    route_count: manifest.routes.length,
    walked_node_count: walkedNodeCount,
  };
  if (walkedRoute !== undefined) outcome.walked_route = walkedRoute;
  return outcome;
}

interface RenderTreeNode {
  children: readonly RenderTreeNode[];
}
function countRenderNodes(node: RenderTreeNode): number {
  return 1 + node.children.reduce<number>((acc, c) => acc + countRenderNodes(c), 0);
}

export default defineEval({
  id: 'end-to-end/gemini-smoke',
  description:
    'Real Gemini compile against capabilities/github/* — manifest validates, policies pass, runtime walks one route.',
  kind: 'end-to-end',
  tags: ['smoke', 'gemini', 'live'],
  // Per-eval timeout: gemini-2.5-pro cold compiles can run 20–60s. The
  // internal compile.compile() wraps in a 90s timeout; allow margin for
  // setup + policy + walk on top.
  timeoutMs: 120_000,
  input: {
    route: '/repos',
    user_id: 'smoke-user',
    app_id: 'cir.smoke',
    intent_summary:
      'Show me the GitHub repos I maintain with stale open issues; let me create or close issues from the list.',
  } satisfies SmokeInput,
  run: runSmoke,
  expected: (output: unknown): boolean => {
    const o = output as SmokeOutcome;
    if (o.skipped) return o.reason === 'no GEMINI_API_KEY';
    // Auth-failed is a hard fail: the key was configured but the provider
    // rejected it (revoked / expired / wrong project). The nightly job MUST
    // exit non-zero on this branch — that's the whole point of the run.
    if (o.auth_failed === true) return false;
    return (
      o.skipped === false &&
      typeof o.manifest_id === 'string' &&
      o.compiler_model_is_gemini === true &&
      o.policy_pass === true &&
      typeof o.route_count === 'number' &&
      o.route_count >= 1 &&
      typeof o.walked_node_count === 'number' &&
      o.walked_node_count >= 1
    );
  },
});
