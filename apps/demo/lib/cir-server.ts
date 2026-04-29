// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
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
  FallbackCompiler,
  GeminiCompiler,
  MemoryManifestStore,
  ServerManifestResolver,
  type CompilerService,
  type ManifestStore,
} from '@cir/compiler';
import { StreamingAuditSink } from '@cir/runtime';
import type { Capability, ComponentDefinition } from '@cir/schemas';
import { DEMO_BRAND_KIT } from './brand-kit';
import { CAPABILITIES } from './fake-capabilities';
import { manifestForRoute } from './fake-manifests';

interface CirServer {
  compiler: CompilerService;
  store: ManifestStore;
  audit: StreamingAuditSink;
  resolver: ServerManifestResolver;
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
