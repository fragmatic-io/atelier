// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Tests for the demo's hand-written fallback manifests. The DX-A polish
 * pass enriched `/today` with NavBar + KPIRow + the existing decision /
 * task queues. These tests pin the layout shape so a refactor doesn't
 * accidentally drop the showcase components.
 */

import { describe, expect, it } from 'vitest';
import type { LayoutNode } from '@cir/schemas';
import { manifestForRoute, todayManifest, threadManifest } from '../lib/fake-manifests';

function findFirst(node: LayoutNode, id: string): LayoutNode | null {
  if (node.component === id) return node;
  for (const child of node.children ?? []) {
    const f = findFirst(child, id);
    if (f) return f;
  }
  return null;
}

function collect(node: LayoutNode): string[] {
  const out: string[] = [node.component];
  for (const child of node.children ?? []) {
    out.push(...collect(child));
  }
  return out;
}

describe('todayManifest', () => {
  it('includes NavBar, KPIRow, DecisionQueue, TaskQueue, UndoBar', () => {
    const m = todayManifest();
    const route = m.routes[0];
    expect(route).toBeDefined();
    expect(route!.layout).toBeDefined();
    const components = collect(route!.layout!);
    for (const c of ['NavBar', 'KPIRow', 'DecisionQueue', 'TaskQueue', 'UndoBar']) {
      expect(components, `expected ${c} in /today layout`).toContain(c);
    }
  });

  it('emits exactly 3 KPI stats with stable ids', () => {
    const m = todayManifest();
    const kpi = findFirst(m.routes[0]!.layout!, 'KPIRow');
    expect(kpi).not.toBeNull();
    const props = kpi!.props as Record<string, unknown> | undefined;
    const stats = props?.['stats'] as { id: string }[] | undefined;
    expect(stats).toBeDefined();
    expect(stats!.map((s) => s.id)).toEqual(['open', 'due', 'mentions']);
  });

  it('preserves the reversibility surface (UndoBar is in the layout)', () => {
    const m = todayManifest();
    const undo = findFirst(m.routes[0]!.layout!, 'UndoBar');
    expect(undo).not.toBeNull();
  });
});

describe('threadManifest', () => {
  it('routes /thread/:id with ThreadView + UndoBar', () => {
    const m = threadManifest('t_001');
    const components = collect(m.routes[0]!.layout!);
    expect(components).toContain('ThreadView');
    expect(components).toContain('UndoBar');
  });
});

describe('manifestForRoute', () => {
  it('returns null for unknown routes', () => {
    expect(manifestForRoute('/nope')).toBeNull();
  });

  it('returns the today manifest for /today', () => {
    expect(manifestForRoute('/today')?.routes[0]?.path).toBe('/today');
  });

  it('extracts the thread id from the route', () => {
    expect(manifestForRoute('/thread/t_42')?.routes[0]?.path).toBe('/thread/t_42');
  });
});
