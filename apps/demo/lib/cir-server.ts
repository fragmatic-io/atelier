// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
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
  CompositeCompiler,
  GenericFallbackCompiler,
  GeminiCompiler,
  MemoryManifestStore,
  ServerManifestResolver,
  type CompilerService,
  type ManifestStore,
} from '@cir/compiler';
import { SequenceDetector } from '@cir/policies';
import { BehavioralTap, StreamingAuditSink } from '@cir/runtime';
import type { Capability, ComponentDefinition } from '@cir/schemas';
import { DEMO_BRAND_KIT } from './brand-kit';
import { CAPABILITIES } from './fake-capabilities';
import { manifestForRoute } from './fake-manifests';

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

  // Phase 3 polish — `fake-manifests.ts` retained ONLY as the source of
  // `fewShotExample` (host-supplied grounding for Gemini) and as fixture
  // for tests. The compile chain now uses the framework's
  // `GenericFallbackCompiler` for last-resort behavior, not a hand-written
  // per-route lookup.
  const compilers: CompilerService[] = [];
  if (geminiAvailable) {
    compilers.push(
      new GeminiCompiler({
        apiKey: apiKey!,
        coldModel: process.env['GEMINI_COLD_MODEL'] ?? 'gemini-2.5-pro',
        diffModel: process.env['GEMINI_DIFF_MODEL'] ?? 'gemini-2.5-flash',
      }),
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

  // Components catalog summary — what the compiler is allowed to reference.
  // We list both the @cir/components baseline + the demo's domain components.
  const components: ComponentDefinition[] = [
    // Baseline (from @cir/components)
    ...([
      'Stack',
      'Card',
      'Container',
      'Grid',
      'Markdown',
      'Table',
      'EmptyState',
      'Button',
      'TextInput',
      'Select',
      'Alert',
      'Spinner',
      'ConfirmDialog',
      // DX-A polish: surfaced in the today fallback manifest. The compiler
      // is allowed to compose these in any route it generates.
      'NavBar',
      'KPIRow',
      'StatusBar',
      'List',
      'BulkActionBar',
      'HoverCard',
      'Skeleton',
      'Toast',
    ].map((id) => ({
      id,
      props_schema: `${id}Props`,
      data_sources: [],
      actions_supported: [],
      responsive_targets: ['web'],
      design_tokens: '@cir/demo/brand@0.1.0',
      examples: [],
      text_render: true,
    })) as ComponentDefinition[]),
    // Domain extensions
    ...(['DecisionQueue', 'TaskQueue', 'ThreadView', 'UndoBar'].map((id) => ({
      id,
      props_schema: `${id}Props`,
      data_sources:
        id === 'DecisionQueue'
          ? ['thread.list']
          : id === 'TaskQueue'
            ? ['task.list']
            : id === 'ThreadView'
              ? ['thread.get']
              : [],
      actions_supported:
        id === 'DecisionQueue'
          ? ['thread.archive', 'task.create_from_thread']
          : id === 'TaskQueue'
            ? ['task.complete', 'task.snooze']
            : id === 'ThreadView'
              ? ['thread.archive', 'task.create_from_thread']
              : [],
      responsive_targets: ['web'],
      design_tokens: '@cir/demo/brand@0.1.0',
      examples: [],
      text_render: true,
    })) as ComponentDefinition[]),
  ];

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
