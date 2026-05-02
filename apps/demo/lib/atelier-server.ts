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
  type CompilerService,
  type ManifestStore,
} from '@atelier/compiler';
import type { CompileBudget } from '@atelier/schemas';
import { SequenceDetector } from '@atelier/policies';
import { BehavioralTap, StreamingAuditSink } from '@atelier/runtime';
import type { Capability, ComponentDefinition } from '@atelier/schemas';
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
}

const KEY = '__cir_demo_server';
type GlobalWithServer = typeof globalThis & { [KEY]?: CirServer };
const g = globalThis as GlobalWithServer;

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
  // Wave 10 S-6 — optional compile-cost budget enforcement. Off by default
  // so the existing default boot is unchanged. When `CIR_COMPILE_BUDGET_ENABLED`
  // is set, the LLM-backed Gemini compiler is wrapped in a
  // `BudgetMeteredCompiler`. If a user blows past their budget the
  // CompositeCompiler cascades to `GenericFallbackCompiler` and the audit
  // event records `compiler_model: 'fallback-generic'` — no separate
  // budget-blocked event is emitted.
  //
  // The budget shape below is illustrative — real deployments would source
  // it from `intent.compile_budget` and/or `brandKit.compile_budget` per
  // request and merge with `mergeCompileBudgets`. The demo's seed (here)
  // is a process-wide cap because the demo doesn't yet model per-user
  // intent profiles at the server level.
  const budgetEnabled = process.env['CIR_COMPILE_BUDGET_ENABLED'] === '1';
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
  const useTools = process.env['CIR_COMPILER_TOOLS_ENABLED'] === '1';

  const compilers: CompilerService[] = [];
  if (geminiAvailable) {
    const llmCompiler: CompilerService = useTools
      ? new ToolUsingCompiler({
          inner: new GeminiAgentClient({
            apiKey: apiKey!,
            coldModel: process.env['GEMINI_COLD_MODEL'] ?? 'gemini-2.5-pro',
            diffModel: process.env['GEMINI_DIFF_MODEL'] ?? 'gemini-2.5-flash',
          }),
          // The env binds the tools to this host's data. Aurora's demo
          // ships zero customs and no per-route policy validator at the
          // server level, so `validate` is omitted; the agent will see
          // `validateDraft → { ok: true }` from the default seam.
          env: {
            capabilities: CAPABILITIES,
            components,
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
  });

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
  };
}

export function getCirServer(): CirServer {
  if (!g[KEY]) g[KEY] = buildServer();
  return g[KEY];
}
