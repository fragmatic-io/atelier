// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Server-side singleton for `apps/demo-github`. Identical shape to
 * `apps/demo/lib/atelier-server.ts` — composite compiler with a hand-written
 * fallback, manifest store, streaming audit sink, behavioural detector
 * tap, capability registry, component catalog summary, and brand kit.
 *
 * Survives Next.js dev hot reloads via `globalThis` so compile-cache
 * stats survive iterations.
 */

import {
  CompositeCompiler,
  GeminiAgentClient,
  GenericFallbackCompiler,
  GeminiCompiler,
  MemoryManifestStore,
  ServerManifestResolver,
  ToolUsingCompiler,
  ValidationFeedbackCompiler,
  type CompilerService,
  type ManifestStore,
} from '@atelier/compiler';
import {
  SubstringCapabilityResolver,
  TwoStageCapabilityResolver,
  semanticSearchFromResolver,
  type CapabilityResolver,
  type ScopingLlmClient,
  type ScopingLlmRequest,
  type ScopingLlmResponse,
} from '@atelier/capability-resolver';
import {
  SequenceDetector,
  composesAccordingTo,
  emptyLoadingErrorHandled,
  manifestComponentContractSatisfied,
} from '@atelier/policies';
import { BehavioralTap, StreamingAuditSink, manifestContractsFromBindings } from '@atelier/runtime';
import { COMPOSITION_RULES } from '@atelier/components/composition-rules';
// COMPONENT_BINDINGS comes from a deep import path in the React adapter
// (`@atelier/components` index pulls IconBrandContext which uses createContext
// — Next.js forbids that on the server). For the manifest-contract policy
// we only need the metadata, not the React factories; importing nothing
// here keeps the policy degrading gracefully (skips bindings without a
// declared contract — additive behavior).
import type { Capability, ComponentDefinition, Manifest } from '@atelier/schemas';
import { DEMO_GITHUB_BRAND_KIT } from './brand-kit.js';
import { CAPABILITIES } from './capabilities.js';
import { DEMO_GITHUB_BINDINGS } from './component-bindings.js';
import { manifestForRoute } from './manifests.js';

/**
 * Build the per-binding manifest contract map for the policy. Merges the
 * baseline `COMPONENT_BINDINGS` with the demo's custom `DEMO_GITHUB_BINDINGS`
 * so contracts declared on either side are enforced. Bindings without a
 * `manifestContract` are silently skipped (the policy is strictly
 * additive).
 */
// Per-binding contracts the manifest policy validates against. We can't
// pull `COMPONENT_BINDINGS` (the React factories) into this server-side
// module without dragging client-only React contexts into the Next route
// bundle. The demo's own bindings (server-safe by construction) are
// enough — the policy is additive, so baseline bindings without contracts
// here are silently skipped. Phase 3 will move contracts to a server-safe
// catalog so the baseline is enforceable too.
const MANIFEST_CONTRACTS = manifestContractsFromBindings({
  ...DEMO_GITHUB_BINDINGS,
});

/**
 * Compile-time validate hook. Runs the renderer's policies on the LLM
 * output before the manifest reaches the runtime — so a malformed
 * `<NavBar links={...}>` (or any other manifest contract drift) cascades
 * to the FallbackCompiler instead of crashing inside React.
 *
 * Phase 2 #1: adds `manifest_component_contract_satisfied` — the
 * schema-validated per-binding contract policy that replaces the
 * defensive defaults band-aided in commits 9ae2122 / 0c6cc26.
 *
 * Wave C / Phase C-1: returns the `{ ok, reasons }` shape consumed by
 * `ValidationFeedbackCompiler`. The wrapper threads `reasons` back into
 * the next compile attempt so the LLM sees its own draft alongside the
 * exact violation list.
 *
 * See ETHOS principles 4, 5, 7.
 */
function validateManifestSemantics(manifest: Manifest): {
  ok: boolean;
  reasons?: readonly string[];
} {
  const policies = [
    composesAccordingTo(COMPOSITION_RULES),
    emptyLoadingErrorHandled,
    manifestComponentContractSatisfied(MANIFEST_CONTRACTS),
  ];
  const ctx = {
    manifest,
    capabilities: CAPABILITIES,
    components: {},
    rate_limited_capability_ids: new Set<string>(),
    pii_fields: new Set<string>(),
    // Required by `PolicyContext`. The two policies below
    // (`composesAccordingTo`, `emptyLoadingErrorHandled`) do not read
    // from `intent`, so the empty grants list here is fine.
    intent: {
      user_id: 'demo-github-user',
      global_preferences: {},
      granted_fields: [] as string[],
    },
  };
  const reasons: string[] = [];
  for (const policy of policies) {
    const result = policy.evaluate(ctx);
    // Phase 2 #4 — only `error`/`warn` violations gate the LLM's retry loop.
    // `info` advisories (e.g. "the resolver will supply a default empty
    // state") are fine to leave on the table; the runtime fills them in.
    for (const v of result.violations) {
      if (v.severity === 'info') continue;
      reasons.push(v.message);
    }
  }
  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

interface CirServer {
  compiler: CompilerService;
  store: ManifestStore;
  audit: StreamingAuditSink;
  resolver: ServerManifestResolver;
  detector: SequenceDetector;
  behavioralTap: BehavioralTap;
  capabilities: Record<string, Capability>;
  components: ComponentDefinition[];
  brandKit: typeof DEMO_GITHUB_BRAND_KIT;
  geminiAvailable: boolean;
  /** Concrete few-shot manifest the API route forwards as `CompileInput.fewShotExample`. */
  fewShotExample: Manifest;
  /**
   * Wave 10 / S-1 — when capability scoping is enabled, the route
   * handler calls this once per compile with the user's intent so the
   * stage-1 tiny model picks 30 capability ids; the primary
   * `ToolUsingCompiler` then sees only that subset via its `search`
   * seam. Returns a no-op when scoping is disabled (default boot).
   */
  primeCapabilityScoping: (
    intent: string,
    request: { userId: string; appId: string; route: string },
  ) => Promise<void>;
}

const KEY = '__cir_demo_github_server';
type GlobalWithServer = typeof globalThis & { [KEY]?: CirServer };
const g = globalThis as GlobalWithServer;

function buildServer(): CirServer {
  const audit = new StreamingAuditSink({ bufferSize: 200, echoToConsole: false });

  const detector = new SequenceDetector({ sequenceLengths: [2, 3], threshold: 3 });
  const behavioralTap = new BehavioralTap({ sink: audit, detector });
  behavioralTap.start();

  const apiKey = process.env['GEMINI_API_KEY'];
  const geminiAvailable = !!apiKey && apiKey.length > 10;

  // Wave C / Phase C-2 — tool-using compiler is the default production path
  // (TODO P1.1, 2026-05-04). Opt-out via `ATELIER_COMPILER_TOOLS=off` for
  // hosts that need the deterministic single-shot path. Legacy
  // `CIR_COMPILER_TOOLS_ENABLED=0` still understood for one release cycle.
  // Capability scoping (S-1) layers on top via the same opt-out switch
  // because it is only meaningful when tools are enabled.
  const compilerToolsEnv = process.env['ATELIER_COMPILER_TOOLS'];
  const legacyToolsDisabled = process.env['CIR_COMPILER_TOOLS_ENABLED'] === '0';
  const useTools = !legacyToolsDisabled && compilerToolsEnv !== 'off';
  const scopingEnv = process.env['ATELIER_CAPABILITY_SCOPING'];
  const legacyScopingDisabled = process.env['CIR_CAPABILITY_SCOPING_ENABLED'] === '0';
  const useScoping = useTools && !legacyScopingDisabled && scopingEnv !== 'off';

  // Wave 10 / S-1 — capability scoping resolver. When enabled, this is
  // the production `TwoStageCapabilityResolver`: stage 1 calls
  // `gemini-2.5-flash` (the documented tiny model in this workspace —
  // `gemini-2.0-flash-lite` is not) over 1-line capability summaries
  // and returns the top-30 ids. The primary `ToolUsingCompiler` (Pro
  // model) only sees those 30 via its `search` seam.
  //
  // Stage-1 failures cascade automatically to a `SubstringCapabilityResolver`
  // baked into the `TwoStageCapabilityResolver`; the compile never
  // fails just because the tiny model hiccups.
  const primedScoping =
    useTools && useScoping && geminiAvailable ? buildScopingPrimer(apiKey!) : undefined;

  // Phase 3 polish — the demo relies on the framework's
  // `GenericFallbackCompiler` for last-resort behavior; `manifestForRoute`
  // is retained ONLY as the source of `fewShotExample` (host-supplied
  // grounding for Gemini) and as fixture for tests. The compile chain
  // no longer serves hand-written manifests at runtime.
  const compilers: CompilerService[] = [];
  if (geminiAvailable) {
    if (useTools) {
      // Wave C / Phase C-2 — tool-using agent path. Same shape Aurora
      // ships in `apps/demo/lib/atelier-server.ts`. Validation hook lives
      // on the wrapping `ValidationFeedbackCompiler` exactly as in the
      // single-shot path; the agent self-validates via `validateDraft`
      // inside the loop AND gets a second-chance refinement pass at
      // the wrapper layer.
      const toolUsing = new ToolUsingCompiler({
        inner: new GeminiAgentClient({
          apiKey: apiKey!,
          coldModel: process.env['GEMINI_COLD_MODEL'] ?? 'gemini-2.5-pro',
          diffModel: process.env['GEMINI_DIFF_MODEL'] ?? 'gemini-2.5-flash',
        }),
        env: {
          capabilities: CAPABILITIES,
          // The `components` array is built later in this function;
          // the env reference is created lazily via a getter so we
          // don't have to reorder the file. Captured by closure.
          get components(): ComponentDefinition[] {
            return components;
          },
          validate: validateManifestSemantics,
        },
        ...(primedScoping !== undefined ? { search: primedScoping.search } : {}),
        onToolCall: (call) => {
          // eslint-disable-next-line no-console
          console.log(
            `[cir-demo-github] agent tool: ${call.name}(${JSON.stringify(call.args).slice(0, 80)})`,
          );
        },
      });
      compilers.push(
        new ValidationFeedbackCompiler({
          inner: toolUsing,
          validate: validateManifestSemantics,
          maxRetries: 2,
          onRetry: (attempt, violations) => {
            // eslint-disable-next-line no-console
            console.warn(
              `[cir-demo-github] tool-using compile attempt ${String(attempt)} failed validation; retrying. Violations:`,
              violations,
            );
          },
        }),
      );
    } else {
      // Wave C / Phase C-1 — wrap the LLM compiler with the validation
      // feedback loop. Validation lives ON the wrapper (not on the inner
      // `GeminiCompiler.validate` option) so a rejected draft is threaded
      // back as `priorDraft + violations` and the LLM gets up to two
      // refinement attempts before the composite cascades to the
      // `GenericFallbackCompiler`. Empirically recovers ~70% of single-shot
      // validation failures; preserves the cascade story when retries are
      // exhausted (the wrapper throws `CompilerOutputError` and the
      // composite advances).
      compilers.push(
        new ValidationFeedbackCompiler({
          inner: new GeminiCompiler({
            apiKey: apiKey!,
            coldModel: process.env['GEMINI_COLD_MODEL'] ?? 'gemini-2.5-pro',
            diffModel: process.env['GEMINI_DIFF_MODEL'] ?? 'gemini-2.5-flash',
            // Validation is now owned by the wrapper. Leaving
            // `GeminiCompiler.validate` UNSET (back-compat shape, the
            // option is still accepted for callers that want the old
            // single-attempt path).
          }),
          // Semantic validation — see ETHOS principles 4, 5, 7. Catches
          // composition drift (empty containers), missing empty/loading/
          // error slots, AND per-binding manifest contract violations
          // (Phase 2 #1) before the LLM's output reaches the renderer.
          validate: validateManifestSemantics,
          maxRetries: 2,
          onRetry: (attempt, violations) => {
            // eslint-disable-next-line no-console
            console.warn(
              `[cir-demo-github] compile attempt ${String(attempt)} failed validation; retrying with refinement context. Violations:`,
              violations,
            );
          },
        }),
      );
    }
  }
  compilers.push(new GenericFallbackCompiler());

  const compiler = new CompositeCompiler(compilers, {
    onCascade: (from, err) => {
      // eslint-disable-next-line no-console
      console.warn(`[cir-demo-github] compiler ${from} failed; cascading. err:`, err);
    },
  });

  const store = new MemoryManifestStore({ maxEntries: 200 });

  const resolver = new ServerManifestResolver({
    compiler,
    store,
    audit: (e) => audit.emit(e),
  });

  // Components catalog summary — what the compiler is allowed to reference.
  //
  // Marketplace pivot complete: Octant ships **zero** custom bindings.
  // Five customs were retired across the migration:
  //   - `RepoTable` → baseline `<Table>` (manifest declares columns).
  //   - `RateLimitStatusBar` → baseline `<StatusBar>` bound to
  //     `github.api.rate_limit`.
  //   - `OctantHeader` → `<Stack>` of `<Logo>` + `<NavBar>` + `<StatusBar>`.
  //   - `Wordmark` → `<Logo>` baseline (glyph + wordmark lockup).
  //   - `IssueQueue` → baseline `<Queue>` (declarative `actions` + per-item
  //     `emphasis: 'high'` salience tagging via the data resolver). Plainer
  //     row rendering vs the bespoke hover-card / mono-ref / chip layout is
  //     the documented trade-off — see commit body.
  //
  // Per `docs/ethos.md` principle #11 (marketplace is the product;
  // custom bindings are a last resort), every entry carries a
  // `description` so the LLM picks the right component without needing a
  // host-shaped wrapper.
  const baseline: Array<Pick<ComponentDefinition, 'description'> & { id: string }> = [
    {
      id: 'Stack',
      description: 'Vertical or horizontal layout container with gap. Wrap any group of children.',
    },
    {
      id: 'Card',
      description:
        'Bordered or elevated content surface. Use for grouped content with a clear edge.',
    },
    {
      id: 'Container',
      description: 'Page-width container with maxWidth + padding. Top-level wrapper for routes.',
    },
    {
      id: 'Grid',
      description: 'Generic responsive grid for cards or tiles.',
    },
    {
      id: 'Markdown',
      description: 'Rich-text body. Use for headings, descriptions, and prose copy.',
    },
    {
      id: 'Table',
      description:
        "Dense rows with columns. USE THIS for repo browsing (`/repos`) — declare columns explicitly in `props`. Hover-card row previews live in the host's row template; the manifest contributes structure + capability binding only.",
    },
    {
      id: 'EmptyState',
      description:
        'Standalone empty-state with title + body. Used as `empty_state` slot or as a sibling to a data-bound component.',
    },
    {
      id: 'Button',
      description: 'Primary action affordance. Carries one capability id in `actions`.',
    },
    { id: 'TextInput', description: 'Single-line text input. Pair with `<Form>` for submission.' },
    { id: 'Select', description: 'Dropdown selection. For filters and form fields.' },
    {
      id: 'Alert',
      description:
        'Inline severity-flagged message. Use for `error_state` slots or persistent notices.',
    },
    { id: 'Spinner', description: 'Indeterminate loading affordance.' },
    {
      id: 'ConfirmDialog',
      description:
        'Modal confirmation for destructive actions (close, delete). Required by `confirmation_required_for_destructive` policy.',
    },
    {
      id: 'List',
      description:
        'Generic semantic <ul>. For decision queues / mention queues, prefer `<Queue>` which carries declarative per-row actions, optimistic-hide on dispatch, salience emphasis (per-item `emphasis: "high"`), and first-class empty/loading/error states.',
    },
    {
      id: 'DetailView',
      description: 'Single-record detail surface (header + body). Used by `/issue/[id]`.',
    },
    { id: 'StatCard', description: 'Single KPI card with label, value, optional delta.' },
    { id: 'KPIRow', description: 'Horizontal row of `StatCard`s. For dashboard summaries.' },
    { id: 'Form', description: 'Form root with submit semantics. Wraps inputs.' },
    {
      id: 'Toast',
      description: 'Transient notification. Prefer `UndoToast` for reversible actions.',
    },
    {
      id: 'UndoToast',
      description:
        'Slide-up toast with countdown progress + Undo button. Ambient affordance that satisfies `reversibility_surfaced` for any reversible action that fires while it is mounted.',
    },
    {
      id: 'BulkActionBar',
      description:
        'Bottom-center action bar that auto-mounts when a `selectable` List has rows selected. Carries the bulk capability ids.',
    },
    {
      id: 'HoverCard',
      description: 'Hoverable popover. Use for inline reference previews (e.g. #NNN issue refs).',
    },
    {
      id: 'NavBar',
      description:
        'Top nav with `items` and an optional `brand` slot. Compose with `<Logo>` and `<StatusBar>` inside a horizontal `<Stack>` to build the Octant chrome — there is no per-host header binding any more.',
    },
    {
      id: 'Logo',
      description:
        'Brand mark + wordmark primitive. For Octant pass `glyph: "\\u2B22"` (black medium octagon) and `wordmark: "octant"`. Compose as a sibling of `<NavBar>` inside a `<Stack>` to build the chrome.',
    },
    {
      id: 'StatusBar',
      description:
        'Status pill with operational / degraded / down. Bind to `github.api.rate_limit` in the chrome to surface API quota live; ambient `RATE_LIMIT_CHIP_AMBIENT_SATISFIER` clears the `rate_limited_actions_show_state` policy.',
    },
    {
      id: 'Skeleton',
      description:
        'Loading-state placeholder shapes (card, row, line). Use as `loading_state` slot.',
    },
    { id: 'Pagination', description: 'Pagination controls (Prev / page numbers / Next).' },
    {
      id: 'FilterBar',
      description: 'Filter chips / dropdowns above a list. variant=chip for selectable categories.',
    },
    {
      id: 'Timeline',
      description: 'Vertical chronological events. Use for issue comment threads.',
    },
    {
      id: 'ButtonGroup',
      description: 'Cluster of related buttons (toggle group or action set).',
    },
    {
      id: 'Queue',
      description:
        'Generic "items requiring action" baseline. PREFER for issue / decision / mention queues bound to `github.issue.list` (or any "list of items needing a per-row capability"). Carries declarative per-row `actions: [{id, label, variant, confirmInline?}]`, optimistic-hide on success, optional grouping, first-class empty/loading/error, and per-item `emphasis: "<tag>"` that surfaces as `data-emphasis` for salience styling. Replaces the retired `<IssueQueue>` host binding — Octant now ships zero customs.',
    },
  ];
  const components: ComponentDefinition[] = baseline.map((c) => ({
    id: c.id,
    props_schema: `${c.id}Props`,
    data_sources: [],
    actions_supported: [],
    responsive_targets: ['web'],
    design_tokens: '@atelier/demo-github/brand@0.1.0',
    examples: [],
    text_render: true,
    ...(c.description !== undefined ? { description: c.description } : {}),
  }));

  // The fallback manifest for `/today` is the canonical hand-written
  // example for this app — it uses every binding the catalog declares
  // and satisfies every policy. Using it as the LLM's few-shot grounding
  // teaches Gemini the right composition pattern for THIS app.
  const fewShotExample = manifestForRoute('/today') ?? manifestForRoute('/repos');
  if (!fewShotExample) {
    throw new Error('demo-github: no manifest available to use as few-shot example');
  }

  return {
    compiler,
    store,
    audit,
    resolver,
    detector,
    behavioralTap,
    capabilities: CAPABILITIES,
    components,
    brandKit: DEMO_GITHUB_BRAND_KIT,
    geminiAvailable,
    fewShotExample,
    // No-op when scoping is disabled. When enabled, the route handler
    // calls this once per compile so the C-2 `ToolUsingCompiler`'s
    // `search.capabilities(...)` reads the stage-1 result for the
    // user's intent.
    primeCapabilityScoping: primedScoping
      ? async (intent, request) => {
          await primedScoping.primer.prime(intent);
          // Re-key the bound request so cache keys reflect the actual
          // user/app/route for this compile. The primer was constructed
          // with a placeholder request bound at boot.
          primedScoping.setRequest({ ...request, intent });
        }
      : async () => {
          /* scoping disabled */
        },
  };
}

/**
 * Build the stage-1 scoping infrastructure. Returns a primed
 * `SemanticSearch` plus a per-compile request setter so the route
 * handler can rebind `(userId, appId, route)` before each `prime()`.
 */
function buildScopingPrimer(apiKey: string): {
  primer: ReturnType<typeof semanticSearchFromResolver>;
  search: ReturnType<typeof semanticSearchFromResolver>['search'];
  setRequest: (req: { userId: string; appId: string; route: string; intent: string }) => void;
} {
  const fallback: CapabilityResolver = new SubstringCapabilityResolver();
  const client: ScopingLlmClient = buildGeminiFlashScopingClient(apiKey);
  const resolver = new TwoStageCapabilityResolver({
    client,
    fallback,
    onScope: (e) => {
      // eslint-disable-next-line no-console
      console.log(
        `[cir-demo-github] scoping: route=${e.route} registry=${String(e.registrySize)} picked=${String(e.pickedCount)} cache=${e.cacheHit ? 'hit' : 'miss'} stage1ok=${e.stageOneOk ? 'y' : 'n'} ${String(e.tokenCost)}t/${String(e.durationMs)}ms`,
      );
    },
    onStageOneFailure: (e) => {
      // eslint-disable-next-line no-console
      console.warn(
        `[cir-demo-github] scoping stage-1 failed for route=${e.route}; cascading.`,
        e.error,
      );
    },
  });
  // Boot-time placeholder request; the route handler re-binds it via
  // `setRequest` before each compile.
  let bound = {
    userId: 'unknown',
    appId: 'cir.demo-github',
    route: '/',
    intent: '',
  };
  const primer = semanticSearchFromResolver(resolver, {
    registry: CAPABILITIES,
    request: bound,
  });
  return {
    primer,
    search: primer.search,
    setRequest: (next) => {
      bound = next;
    },
  };
}

/**
 * Tiny `ScopingLlmClient` that talks to `gemini-2.5-flash` for stage-1
 * id selection. Kept inline (vs a dedicated client class) because the
 * surface is small and the demo benefits from one self-contained file
 * for the showcase. Production hosts should pull this into its own
 * module + write a real test harness.
 */
function buildGeminiFlashScopingClient(apiKey: string): ScopingLlmClient {
  const model = process.env['CIR_SCOPING_MODEL'] ?? 'gemini-2.5-flash';
  // Lazy import — the @google/genai SDK is already a transitive dep of
  // `@atelier/compiler`. Inline `require` keeps the import out of the cold
  // path when scoping is disabled.
  return {
    id: `gemini-scoping[${model}]`,
    pickCapabilityIds: async (req: ScopingLlmRequest): Promise<ScopingLlmResponse> => {
      const { GoogleGenAI } = await import('@google/genai');
      const client = new GoogleGenAI({ apiKey });
      const summaryLines = req.summaries
        .map((s) => `- ${s.id}: ${s.summary || '(no description)'}`)
        .join('\n');
      const systemInstruction = [
        'You are a capability scoping pre-pass for a UI compiler.',
        `Given the user intent and route, pick at most ${String(req.k)} capability ids most likely to be needed to render the route.`,
        'Return ONLY a JSON array of capability id strings. No prose, no fences.',
      ].join(' ');
      const userPrompt = [
        `Intent: ${req.intent}`,
        `Route: ${req.route}`,
        '',
        'Capabilities:',
        summaryLines,
        '',
        `Reply with a JSON array of up to ${String(req.k)} ids.`,
      ].join('\n');
      const config: { systemInstruction: string; temperature: number; abortSignal?: AbortSignal } =
        {
          systemInstruction,
          temperature: 0,
        };
      if (req.signal !== undefined) config.abortSignal = req.signal;
      const response = await client.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        config,
      });
      const text = response.text ?? '';
      let ids: string[] = [];
      try {
        const stripped = text.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(stripped);
        if (Array.isArray(parsed)) {
          ids = parsed.filter((v): v is string => typeof v === 'string');
        }
      } catch {
        // Throw — `TwoStageCapabilityResolver` will cascade to fallback.
        throw new Error(`scoping client: non-JSON reply: ${text.slice(0, 120)}`);
      }
      const tokenCost =
        (response.usageMetadata?.promptTokenCount ?? 0) +
        (response.usageMetadata?.candidatesTokenCount ?? 0);
      return { ids, tokenCost, model };
    },
  };
}

export function getCirServer(): CirServer {
  if (!g[KEY]) g[KEY] = buildServer();
  return g[KEY];
}
