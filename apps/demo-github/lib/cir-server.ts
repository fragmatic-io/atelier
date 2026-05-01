// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Server-side singleton for `apps/demo-github`. Identical shape to
 * `apps/demo/lib/cir-server.ts` — composite compiler with a hand-written
 * fallback, manifest store, streaming audit sink, behavioural detector
 * tap, capability registry, component catalog summary, and brand kit.
 *
 * Survives Next.js dev hot reloads via `globalThis` so compile-cache
 * stats survive iterations.
 */

import {
  CompositeCompiler,
  FallbackCompiler,
  GeminiCompiler,
  MemoryManifestStore,
  ServerManifestResolver,
  type CompilerService,
  type ManifestStore,
} from '@cir/compiler';
import { SequenceDetector } from '@cir/policies';
import { BehavioralTap, StreamingAuditSink } from '@cir/runtime';
import type { Capability, ComponentDefinition } from '@cir/schemas';
import { DEMO_GITHUB_BRAND_KIT } from './brand-kit.js';
import { CAPABILITIES } from './capabilities.js';
import { manifestForRoute } from './manifests.js';

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

  const fallback = new FallbackCompiler({
    id: 'fallback-hand-written',
    lookup: (route) => manifestForRoute(route),
  });

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
  compilers.push(fallback);

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
  // Includes the baseline catalog plus the demo's three custom bindings
  // (IssueQueue, RateLimitStatusBar, Wordmark) so the compiler can
  // legitimately produce manifests that reference them by name.
  const baseline = [
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
    'List',
    'DetailView',
    'StatusBar',
    'StatCard',
    'KPIRow',
    'Form',
    'Toast',
    'UndoToast',
    'BulkActionBar',
    'HoverCard',
    'NavBar',
    'Skeleton',
    'Pagination',
    'FilterBar',
    'Timeline',
    'ButtonGroup',
    // Custom demo bindings.
    'IssueQueue',
    'RepoTable',
    'OctantHeader',
    'RateLimitStatusBar',
    'Wordmark',
  ];
  const components: ComponentDefinition[] = baseline.map((id) => ({
    id,
    props_schema: `${id}Props`,
    data_sources: [],
    actions_supported: [],
    responsive_targets: ['web'],
    design_tokens: '@cir/demo-github/brand@0.1.0',
    examples: [],
    text_render: true,
  }));

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
  };
}

export function getCirServer(): CirServer {
  if (!g[KEY]) g[KEY] = buildServer();
  return g[KEY];
}
