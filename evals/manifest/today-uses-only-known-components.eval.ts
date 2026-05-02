// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The Atelier Authors
/**
 * Manifest eval: every component referenced in the `/today` layout is
 * registered (either in the @atelier/components baseline or the demo's
 * extension bindings).
 *
 * The runtime falls back to a placeholder when a component id is unknown,
 * which is safe but silently degrades the demo. This eval surfaces the
 * drift rather than letting the placeholder ship.
 *
 * NOTE: We hard-code the set of registered component ids rather than
 * importing `@atelier/components`/`apps/demo/components`. Both modules pull
 * in `'use client'` React TSX files that fail to load under plain Node +
 * tsx (no JSX runtime resolution at module load). Phase 5c can split a
 * pure-JS `IDS` export out of the registry to remove the duplication.
 */

import { defineEval } from '@atelier/evals';
import type { LayoutNode } from '@atelier/schemas';
import { todayManifest } from '../../apps/demo/lib/fake-manifests';

// Mirrors the keys of @atelier/components/src/registry.ts COMPONENT_BINDINGS
// (Phase 4b baseline, after the catalog expansion in registry.ts).
const BASELINE_COMPONENT_IDS = [
  'Accordion',
  'Alert',
  'Button',
  'Card',
  'ConfirmDialog',
  'Container',
  'DetailView',
  'Drawer',
  'EmptyState',
  'Grid',
  'List',
  'Markdown',
  'Modal',
  'Progress',
  'Select',
  'Skeleton',
  'Spinner',
  'Stack',
  'StatCard',
  'Table',
  'Tabs',
  'TextInput',
  'Toast',
];

// Mirrors the keys of apps/demo/components/index.ts DEMO_BINDINGS.
const DEMO_BINDING_IDS = ['DecisionQueue', 'TaskQueue', 'ThreadView', 'UndoBar'];

function* walk(node: LayoutNode | undefined): Iterable<LayoutNode> {
  if (!node) return;
  yield node;
  for (const child of node.children ?? []) {
    yield* walk(child);
  }
}

export default defineEval({
  id: 'manifest/today/uses-only-known-components',
  description: 'Every component id in /today maps to a registered binding.',
  kind: 'manifest',
  tags: ['today', 'registry'],
  input: null,
  run: () => {
    const known = new Set([...BASELINE_COMPONENT_IDS, ...DEMO_BINDING_IDS]);
    const manifest = todayManifest();
    const used = new Set<string>();
    for (const route of manifest.routes) {
      for (const node of walk(route.layout)) {
        used.add(node.component);
      }
    }
    const unknown = [...used].filter((id) => !known.has(id)).sort();
    return { unknown_components: unknown, used_count: used.size };
  },
  expected: (output: unknown): boolean => {
    const o = output as { unknown_components: string[]; used_count: number };
    return o.unknown_components.length === 0 && o.used_count > 0;
  },
});
