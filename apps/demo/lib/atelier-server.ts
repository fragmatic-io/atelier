// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Server-side singleton: real compiler + Tier-3 cache + audit.
 *
 * Wires Gemini (when GEMINI_API_KEY is set) with a fallback to hand-written
 * manifests. Survives hot reload via `globalThis` so the cache keeps its
 * entries across dev iterations.
 *
 * Used by:
 *   - app/api/manifest/[...slug]/route.ts (the manifest endpoint)
 *   - app/api/cir/cache-stats/route.ts (the dashboard endpoint)
 *   - app/api/cir/audit-events/route.ts (the audit stream endpoint)
 */

import {
  BudgetMeteredCompiler,
  CompositeCompiler,
  GeminiAgentClient,
  GenericFallbackCompiler,
  GeminiCompiler,
  InMemoryBudgetCounter,
  MemoryManifestStore,
  ServerManifestResolver,
  ToolUsingCompiler,
  type CompileCapabilityResolver,
  type CompilerService,
  type ManifestStore,
  type RecipeResolverLike,
} from '@atelier/compiler';
import { SubstringCapabilityResolver } from '@atelier/capability-resolver';
import { LocalRecipeStore, SubstringRecipeResolver } from '@atelier/recipe-resolver';
import { join } from 'node:path';
import type { CompileBudget } from '@atelier/schemas';
import {
  BASELINE_POLICIES,
  SequenceDetector,
  UNDO_TOAST_AMBIENT_SATISFIER,
  composesAccordingTo,
  validateManifest,
} from '@atelier/policies';
import { BehavioralTap, StreamingAuditSink } from '@atelier/runtime';
import { COMPOSITION_RULES } from '@atelier/components/composition-rules';
import type { Capability, ComponentDefinition, Manifest } from '@atelier/schemas';
import { DEMO_BRAND_KIT } from './brand-kit';
import { CAPABILITIES } from './fake-capabilities';

interface CirServer {
  compiler: CompilerService;
  store: ManifestStore;
  audit: StreamingAuditSink;
  resolver: ServerManifestResolver;
  /**
   * Behavioural detector seeded from REAL audit events via `BehavioralTap`.
   * Distinct from the synthetic detector in `admin-patterns.ts`, which is
   * the seed source for the `/admin/patterns` page on first load. This
   * detector accumulates patterns from live `action.executed` events as
   * the user clicks through the demo. See `docs/triggers.md`
   * §"Behavioral triggers" for the role of the tap.
   */
  detector: SequenceDetector;
  /** The tap that pipes audit events into the live detector. */
  behavioralTap: BehavioralTap;
  capabilities: Record<string, Capability>;
  components: ComponentDefinition[];
  brandKit: typeof DEMO_BRAND_KIT;
  geminiAvailable: boolean;
  /**
   * Wave C / Phase C-3 — capability scoping resolver. Default-on
   * (TODO P1.1, 2026-05-04) with `SubstringCapabilityResolver` as the
   * baseline; opt out via `ATELIER_CAPABILITY_RESOLVER=off`. Legacy
   * `CIR_CAPABILITY_RESOLVER_ENABLED=0` honoured for one release cycle.
   * Threaded onto every `CompileInput` via the manifest endpoint so the
   * compile pipeline narrows the registry to the top-N most relevant
   * capabilities for the route + intent before prompt assembly. The
   * agent's `lookupCapability` / `listCapabilities` tools still see the
   * full registry; only `findCapability` and the prompt-stuffed set
   * shrink.
   */
  capabilityResolver: CompileCapabilityResolver | undefined;
}

const KEY = '__cir_demo_server';
type GlobalWithServer = typeof globalThis & { [KEY]?: CirServer };
const g = globalThis as GlobalWithServer;

function validateManifestSemantics(manifest: Manifest): {
  ok: boolean;
  reasons?: readonly string[];
} {
  const result = validateManifest(
    {
      manifest,
      capabilities: CAPABILITIES,
      intent: {
        user_id: 'demo-user',
        global_preferences: {},
        granted_fields: [
          'thread.list.*',
          'task.list.*',
          'thread.id',
          'thread.sender',
          'thread.subject',
          'thread.snippet',
          'thread.received_at',
          'thread.requires_decision',
        ],
      },
      rate_limited_capability_ids: new Set(),
      pii_fields: new Set(['email']),
      brand_kit: DEMO_BRAND_KIT,
      ambient_policy_satisfiers: [UNDO_TOAST_AMBIENT_SATISFIER],
    },
    {
      policies: [...BASELINE_POLICIES, composesAccordingTo(COMPOSITION_RULES)],
    },
  );
  const reasons = result.violations.map((v) => v.message);
  return result.ok ? { ok: true, reasons } : { ok: false, reasons };
}

function buildServer(): CirServer {
  const audit = new StreamingAuditSink({ bufferSize: 200, echoToConsole: false });

  // Live behavioural detector. Subscribes to `audit` via a `BehavioralTap`
  // so every real `action.executed` event lands in the sequence-detection
  // window. This makes the engagement → graduation feedback loop the
  // personalisation chain eval (track DD) witnesses end-to-end real,
  // rather than synthetic.
  const detector = new SequenceDetector({ sequenceLengths: [2, 3], threshold: 3 });
  const behavioralTap = new BehavioralTap({ sink: audit, detector });
  behavioralTap.start();

  const apiKey = process.env['GEMINI_API_KEY'];
  const geminiAvailable = !!apiKey && apiKey.length > 10;

  // Marketplace pivot — Aurora ships zero manifest-referenced customs.
  // The compile chain is `[Gemini, GenericFallbackCompiler]`; the host's
  // `lib/fake-manifests.ts` is a baseline-only reference exercised by
  // tests, not served at runtime.
  // Wave 10 S-6 — compile-cost budget enforcement. Default-on
  // (TODO P1.1, 2026-05-04) because every production host needs cost
  // limits. Opt out via `ATELIER_COMPILE_BUDGET=off`. Legacy
  // `CIR_COMPILE_BUDGET_ENABLED=0` honoured for one release cycle.
  // The threshold knobs (`CIR_COMPILE_BUDGET_TOKENS_PER_DAY`,
  // `CIR_COMPILE_BUDGET_CALLS_PER_HOUR`, etc.) stay as `CIR_*` for one
  // release, then rename to `ATELIER_*` with the same legacy-tolerant
  // pattern.
  //
  // When the budget wraps the LLM-backed compiler and the user blows
  // past it, the CompositeCompiler cascades to `GenericFallbackCompiler`
  // and the audit event records `compiler_model: 'fallback-generic'` —
  // no separate budget-blocked event is emitted.
  //
  // The budget shape below is illustrative — real deployments source it
  // from `intent.compile_budget` and/or `brandKit.compile_budget` per
  // request and merge with `mergeCompileBudgets`. The demo's seed (here)
  // is a process-wide cap because the demo doesn't yet model per-user
  // intent profiles at the server level.
  const budgetEnv = process.env['ATELIER_COMPILE_BUDGET'];
  const legacyBudgetDisabled = process.env['CIR_COMPILE_BUDGET_ENABLED'] === '0';
  const budgetEnabled = !legacyBudgetDisabled && budgetEnv !== 'off';
  const demoBudget: CompileBudget | undefined = budgetEnabled
    ? {
        max_tokens_per_day: Number(process.env['CIR_COMPILE_BUDGET_TOKENS_PER_DAY'] ?? 50_000),
        max_calls_per_hour: Number(process.env['CIR_COMPILE_BUDGET_CALLS_PER_HOUR'] ?? 30),
        on_exhausted: 'fall_through',
      }
    : undefined;
  const budgetCounter = budgetEnabled ? new InMemoryBudgetCounter() : undefined;

  // Components catalog summary — what the compiler is allowed to reference.
  //
  // Marketplace pivot: Aurora's catalog is **baseline-only**. Every previous
  // domain extension (`DecisionQueue`, `TaskQueue`, `ThreadView`, `UndoBar`)
  // is gone — the LLM composes baseline `<Queue>` / `<ChatThread>` /
  // `<Stack>` + `<Logo>` + `<NavBar>` instead. The `marketplace-pressure`
  // eval gate enforces zero customs here going forward.
  //
  // Defined BEFORE the compilers block (rather than after the resolver,
  // as it lived previously) so the C-2 `ToolUsingCompiler` path can read
  // it as part of its `ToolEnvironment`. The downstream return statement
  // re-exports the same array unchanged.
  const baselineIds = [
    // Layout
    'Stack',
    'Container',
    'Grid',
    'Card',
    'Split',
    // Display
    'Markdown',
    'Table',
    'List',
    'Queue',
    'EmptyState',
    'KPIRow',
    'StatCard',
    'StatusBar',
    'Skeleton',
    // Brand chrome (compose as Stack(Logo, NavBar) — no per-host header)
    'Logo',
    'NavBar',
    'Breadcrumb',
    // Action / forms
    'Button',
    'ButtonGroup',
    'ActionMenu',
    'TextInput',
    'Select',
    'ConfirmDialog',
    'BulkActionBar',
    // Feedback / overlays
    'Alert',
    'Spinner',
    'Toast',
    'HoverCard',
    'Tooltip',
    // Conversation
    'ChatThread',
    // Icons
    'Icon',
  ];
  const components: ComponentDefinition[] = baselineIds.map((id) => ({
    id,
    props_schema: `${id}Props`,
    data_sources:
      id === 'Queue' ? ['thread.list', 'task.list'] : id === 'ChatThread' ? ['thread.get'] : [],
    actions_supported:
      id === 'Queue'
        ? ['thread.archive', 'task.create_from_thread', 'task.complete', 'task.snooze']
        : [],
    responsive_targets: ['web'],
    design_tokens: '@atelier/demo/brand@0.1.0',
    examples: [],
    text_render: true,
  })) as ComponentDefinition[];

  // Wave C / Phase C-2 — opt-in tool-using agent path. When the env flag
  // is set the cold/diff `GeminiCompiler` is replaced with
  // `ToolUsingCompiler`: the system prompt shrinks; the LLM discovers
  // capabilities + components via tool calls; `validateDraft` /
  // `inspectExistingManifest` / `listSiblingRoutes` are surfaced for
  // self-correction and cross-route consistency. Default boot is
  // unchanged (single-shot path) so the showcase is additive.
  //
  // The wrapper is composable: this branch can be wrapped further by
  // `ValidationFeedbackCompiler` or `BudgetMeteredCompiler` exactly as
  // today's `GeminiCompiler` is. We keep the budget wrap on for parity.
  // Wave C / Phase C-2 — tool-using compiler is the default production path
  // (TODO P1.1, 2026-05-04). Opt-out via `ATELIER_COMPILER_TOOLS=off` for
  // hosts that need the deterministic single-shot path. Legacy
  // `CIR_COMPILER_TOOLS_ENABLED=0` still understood for one release cycle.
  const compilerToolsEnv = process.env['ATELIER_COMPILER_TOOLS'];
  const legacyDisabled = process.env['CIR_COMPILER_TOOLS_ENABLED'] === '0';
  const useTools = !legacyDisabled && compilerToolsEnv !== 'off';

  // Wave C / Phase C-5 — recipe RAG. Default-on (TODO P1.1, 2026-05-04)
  // with `LocalRecipeStore` seeding a `SubstringRecipeResolver` over the
  // in-tree `recipes/` directory. The agent's `findRecipe` tool routes
  // through this resolver. The substring baseline is enough for the
  // demo corpus (~2 recipes); production hosts swap in
  // `EmbeddingRecipeResolver` over a real embedding client.
  // Opt out via `ATELIER_RECIPE_RAG=off`. Legacy
  // `CIR_RECIPE_RAG_ENABLED=0` honoured for one release cycle. When
  // disabled, the tool returns `{ recipes: [] }`.
  const recipeRagEnv = process.env['ATELIER_RECIPE_RAG'];
  const legacyRecipeRagDisabled = process.env['CIR_RECIPE_RAG_ENABLED'] === '0';
  const useRecipeRag = !legacyRecipeRagDisabled && recipeRagEnv !== 'off';
  let recipeResolver: RecipeResolverLike | undefined;
  if (useRecipeRag) {
    const recipesDir = join(process.cwd(), 'recipes');
    const store = new LocalRecipeStore({ directory: recipesDir });
    const resolver = new SubstringRecipeResolver();
    // Fire-and-forget seed — the agent's first `findRecipe` call may
    // race the seed; the substring resolver simply returns `[]` until
    // the index is populated (acceptable for a dev/demo wiring).
    void store
      .list()
      .then((recipes) => resolver.index(recipes))
      .catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.warn('[cir] recipe-rag: failed to seed LocalRecipeStore', err);
      });
    recipeResolver = resolver;
  }

  const compilers: CompilerService[] = [];
  if (geminiAvailable) {
    const llmCompiler: CompilerService = useTools
      ? new ToolUsingCompiler({
          inner: new GeminiAgentClient({
            apiKey: apiKey!,
            coldModel: process.env['GEMINI_COLD_MODEL'] ?? 'gemini-2.5-pro',
            diffModel: process.env['GEMINI_DIFF_MODEL'] ?? 'gemini-2.5-flash',
          }),
          // The env binds the tools to this host's data. Drafts and final
          // output use the same app policy guard as the resolver cache edge.
          env: {
            capabilities: CAPABILITIES,
            components,
            validate: validateManifestSemantics,
            ...(recipeResolver !== undefined ? { recipeResolver } : {}),
          },
          onToolCall: (call) => {
            // eslint-disable-next-line no-console
            console.log(
              `[cir] agent tool: ${call.name}(${JSON.stringify(call.args).slice(0, 80)})`,
            );
          },
        })
      : new GeminiCompiler({
          apiKey: apiKey!,
          coldModel: process.env['GEMINI_COLD_MODEL'] ?? 'gemini-2.5-pro',
          diffModel: process.env['GEMINI_DIFF_MODEL'] ?? 'gemini-2.5-flash',
        });
    compilers.push(
      demoBudget && budgetCounter
        ? new BudgetMeteredCompiler({
            inner: llmCompiler,
            counter: budgetCounter,
            budget: demoBudget,
            onExceeded: (reason) => {
              // eslint-disable-next-line no-console
              console.warn(`[cir] compile budget breached (${reason.code}): ${reason.message}`);
            },
          })
        : llmCompiler,
    );
  }
  compilers.push(new GenericFallbackCompiler());

  const compiler = new CompositeCompiler(compilers, {
    onCascade: (from, err) => {
      // eslint-disable-next-line no-console
      console.warn(`[cir] compiler ${from} failed; cascading. err:`, err);
    },
  });

  const store = new MemoryManifestStore({ maxEntries: 200 });

  const resolver = new ServerManifestResolver({
    compiler,
    store,
    audit: (e) => audit.emit(e),
    validate: validateManifestSemantics,
  });

  // Wave C / Phase C-3 — capability scoping resolver. Default-on
  // (TODO P1.1, 2026-05-04) with the cheap-and-deterministic
  // `SubstringCapabilityResolver` baseline (no embedding setup, no
  // external dependencies). Opt out via
  // `ATELIER_CAPABILITY_RESOLVER=off`. Legacy
  // `CIR_CAPABILITY_RESOLVER_ENABLED=0` honoured for one release cycle.
  // Production hosts swap in `EmbeddingCapabilityResolver` (S-7) or
  // `TwoStageCapabilityResolver` (S-1) — the
  // `CompileInput.capabilityResolver` seam is identical.
  const capabilityResolverEnv = process.env['ATELIER_CAPABILITY_RESOLVER'];
  const legacyResolverDisabled = process.env['CIR_CAPABILITY_RESOLVER_ENABLED'] === '0';
  const resolverEnabled = !legacyResolverDisabled && capabilityResolverEnv !== 'off';
  const capabilityResolver: CompileCapabilityResolver | undefined = resolverEnabled
    ? new SubstringCapabilityResolver()
    : undefined;

  return {
    compiler,
    store,
    audit,
    resolver,
    detector,
    behavioralTap,
    capabilities: CAPABILITIES,
    components,
    brandKit: DEMO_BRAND_KIT,
    geminiAvailable,
    capabilityResolver,
  };
}

export function getCirServer(): CirServer {
  if (!g[KEY]) g[KEY] = buildServer();
  return g[KEY];
}
