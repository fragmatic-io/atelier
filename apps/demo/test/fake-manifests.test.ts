// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Tests for the demo's reference manifests. Marketplace pivot: the layout is
 * now baseline-only — `<Queue>` for decisions and tasks (replaces the
 * `DecisionQueue` / `TaskQueue` customs), `<ChatThread>` for thread messages
 * (replaces `ThreadView`), `<Stack(Logo, NavBar)>` for the brand chrome
 * (replaces the bespoke header). Reversibility is covered ambiently via
 * `UNDO_TOAST_AMBIENT_SATISFIER` declared on the policy context, so `UndoBar`
 * is no longer a manifest node.
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

const RETIRED_CUSTOMS = ['DecisionQueue', 'TaskQueue', 'ThreadView', 'UndoBar'];

describe('todayManifest', () => {
  it('uses baseline composition only (Queue, NavBar, Logo, KPIRow)', () => {
    const m = todayManifest();
    const route = m.routes[0];
    expect(route).toBeDefined();
    expect(route!.layout).toBeDefined();
    const components = collect(route!.layout!);
    for (const c of ['Logo', 'NavBar', 'KPIRow', 'Queue']) {
      expect(components, `expected ${c} in /today layout`).toContain(c);
    }
  });

  it('renders TWO Queue instances (decisions + tasks)', () => {
    const m = todayManifest();
    const components = collect(m.routes[0]!.layout!);
    expect(components.filter((c) => c === 'Queue').length).toBe(2);
  });

  it('decisions Queue is bound to thread.list with the right action ids', () => {
    const m = todayManifest();
    const stack = findFirst(m.routes[0]!.layout!, 'Stack')!;
    // First Queue in the layout corresponds to decisions.
    const queues = (stack.children ?? []).filter((c) => c.component === 'Queue');
    expect(queues.length).toBeGreaterThanOrEqual(2);
    const decisions = queues[0]!;
    expect((decisions.data as { source: string }).source).toBe('thread.list');
    expect(decisions.actions).toEqual(['task.create_from_thread', 'thread.archive']);
    const props = decisions.props as { actions: { id: string }[] };
    const ids = props.actions.map((a) => a.id);
    expect(ids).toContain('thread.archive');
    expect(ids).toContain('task.create_from_thread');
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

  it('does not reference any retired Aurora custom binding (zero customs)', () => {
    const m = todayManifest();
    const components = collect(m.routes[0]!.layout!);
    for (const retired of RETIRED_CUSTOMS) {
      expect(components, `retired custom ${retired} should not appear`).not.toContain(retired);
    }
  });

  it('decisions Queue declares all three P-8 state slots on its data binding', () => {
    // Wave 7 / P-8 — the demo's flagship Queue showcases the new
    // `loading_state` / `empty_state` / `error_state` slots end to end. The
    // render walker substitutes these LayoutNodes in place of the Queue when
    // the resolver reports loading / empty / error; without them the
    // framework's `BASELINE_RESOLVER_DEFAULTS` fire instead.
    const m = todayManifest();
    const stack = findFirst(m.routes[0]!.layout!, 'Stack')!;
    const decisions = (stack.children ?? []).find((c) => c.component === 'Queue')!;
    const data = decisions.data as Record<string, unknown> | undefined;
    expect(data).toBeDefined();
    const loading = data?.['loading_state'] as { component?: string } | undefined;
    const empty = data?.['empty_state'] as { component?: string } | undefined;
    const errored = data?.['error_state'] as { component?: string } | undefined;
    expect(loading?.component).toBe('Skeleton');
    expect(empty?.component).toBe('EmptyState');
    expect(errored?.component).toBe('Alert');
  });
});

describe('threadManifest', () => {
  it('routes /thread/:id with NavBar+Logo header, ButtonGroup actions, and ChatThread', () => {
    const m = threadManifest('t_001');
    const components = collect(m.routes[0]!.layout!);
    expect(components).toContain('Logo');
    expect(components).toContain('NavBar');
    expect(components).toContain('ButtonGroup');
    expect(components).toContain('ChatThread');
  });

  it('does not reference any retired Aurora custom binding', () => {
    const m = threadManifest('t_001');
    const components = collect(m.routes[0]!.layout!);
    for (const retired of RETIRED_CUSTOMS) {
      expect(components).not.toContain(retired);
    }
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
