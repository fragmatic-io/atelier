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
import { SequenceDetector, composesAccordingTo, emptyLoadingErrorHandled } from '@cir/policies';
import { BehavioralTap, StreamingAuditSink } from '@cir/runtime';
import { COMPOSITION_RULES } from '@cir/components/composition-rules';
import type { Capability, ComponentDefinition, Manifest } from '@cir/schemas';
import { DEMO_GITHUB_BRAND_KIT } from './brand-kit.js';
import { CAPABILITIES } from './capabilities.js';
import { manifestForRoute } from './manifests.js';

/**
 * Run COMPOSITION_RULES against every route's layout in a manifest. Returns
 * the violation messages so the caller can decide whether to retry / cascade.
 * Used as the `validate` hook on `GeminiCompiler` — empty containers,
 * over-stuffed slots, leaf-with-children mistakes get caught here and the
 * composite falls through to the hand-written fallback.
 */
function validateManifestComposition(manifest: Manifest): { errors: readonly string[] } {
  // Run the policies the runtime renderer enforces post-render — but at
  // compile time, so the LLM gets a chance to retry before its output
  // reaches the renderer. See ETHOS principles 1 & 5.
  const policies = [composesAccordingTo(COMPOSITION_RULES), emptyLoadingErrorHandled];
  const ctx = {
    manifest,
    capabilities: CAPABILITIES,
    components: {},
    rate_limited_capability_ids: new Set<string>(),
    pii_fields: new Set<string>(),
  };
  const errors: string[] = [];
  for (const policy of policies) {
    const result = policy.evaluate(ctx);
    for (const v of result.violations) errors.push(v.message);
  }
  return { errors };
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
        // Composition validation — see ETHOS principle #4. The LLM may
        // emit a Zod-valid manifest with empty containers (`<Stack />`
        // with no children). Composition rules catch that here so the
        // composite cascades to the FallbackCompiler instead of letting
        // a broken manifest reach the renderer.
        validate: validateManifestComposition,
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
  //
  // Per `docs/ethos.md` principle #2 (composition, not invention), every
  // entry carries a `description` so the LLM can pick the right component.
  // Custom bindings (`IssueQueue`, `RepoTable`, `OctantHeader`,
  // `RateLimitStatusBar`, `Wordmark`) describe their specific UX so the
  // compiler picks them over the generic baseline alternatives when the
  // route's intent matches.
  //
  // Catalog descriptions are the difference between "the LLM picks `<List>`"
  // and "the LLM picks `<IssueQueue>` because the route is a decision
  // queue with optimistic archive and salience hierarchy."
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
      description:
        'Generic responsive grid for cards or tiles. Prefer custom bindings (e.g. RepoTable) when the description matches better.',
    },
    {
      id: 'Markdown',
      description: 'Rich-text body. Use for headings, descriptions, and prose copy.',
    },
    {
      id: 'Table',
      description:
        'Generic dense rows with columns. For repo browsing in this demo, prefer `RepoTable` which adds hover-card previews and inline create-issue links.',
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
        'Generic semantic <ul>. For decision queues / mention queues in this demo, prefer `IssueQueue` which carries the rich row UX (hover-card mentions, salience emphasis, optimistic archive, multi-select).',
    },
    {
      id: 'DetailView',
      description: 'Single-record detail surface (header + body). Used by `/issue/[id]`.',
    },
    {
      id: 'StatusBar',
      description:
        'Status pill with operational/degraded/down. For ambient system status. Octant uses a custom `RateLimitStatusBar` for GitHub API rate-limit state.',
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
        'Top nav with brand + items. In this demo, the chrome NavBar is wrapped by `OctantHeader` which adds the rate-limit chip.',
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
    // Custom demo bindings — described so the LLM picks them over baseline.
    {
      id: 'IssueQueue',
      description:
        'Rich decision queue for `/today`-style routes. Renders fixture-bound issues as cards with: bold title, mono `repo#NNN` reference, green `you`/`team` assignee chip, body with inline link-blue mono `#NNN` mention refs (hover-card on each), ghost Archive button, multi-select checkboxes. Top three rows get green left-border salience emphasis. Pair with `<UndoToast>` so optimistic archive is reversible. PREFER this over `<List>` when the route is a decision queue.',
    },
    {
      id: 'RepoTable',
      description:
        'Rich repository browser for `/repos`. Hover-card previews on each row showing recent activity, inline `Create issue` deep-link per row, mono on owner/repo. PREFER this over `<Table>` when the route is repo-browsing.',
    },
    {
      id: 'OctantHeader',
      description:
        'Single-row chrome (octagon Wordmark + nav + small rate-limit chip). USE THIS as the first child of every route. Replaces the static layout chrome — there should be exactly one OctantHeader per manifest.',
    },
    {
      id: 'RateLimitStatusBar',
      description:
        'GitHub API rate-limit chip (used inside OctantHeader). Surfaces `github.api.rate_limit` as `5000/5000 · 60s reset`. Satisfies `rate_limited_actions_show_state` policy when the route exposes a rate-limited action.',
    },
    {
      id: 'Wordmark',
      description:
        'Octagon SVG logo + lowercase mono "octant" lockup. Embedded inside `OctantHeader`; rarely referenced directly from a manifest.',
    },
  ];
  const components: ComponentDefinition[] = baseline.map((c) => ({
    id: c.id,
    props_schema: `${c.id}Props`,
    data_sources: [],
    actions_supported: [],
    responsive_targets: ['web'],
    design_tokens: '@cir/demo-github/brand@0.1.0',
    examples: [],
    text_render: true,
    ...(c.description !== undefined ? { description: c.description } : {}),
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
