import { describe, expect, it } from 'vitest';
import {
  collectLayoutNodes,
  escapeJsonPointerSegment,
  walkManifest,
} from '../src/internal/walk-layout.js';
import { baselineManifest } from './fixtures/manifest.js';
import type { LayoutNode } from '@cir/schemas';

describe('walk-layout helpers', () => {
  it('collectLayoutNodes flattens every node with its JSON Pointer', () => {
    const manifest = baselineManifest();
    const collected = collectLayoutNodes(manifest);
    // baseline route 1 layout: Stack + 3 children (DecisionQueue, TaskQueue, UndoBar) = 4 nodes
    expect(collected).toHaveLength(4);
    expect(collected[0]?.path).toBe('/routes/1/layout');
    expect(collected[1]?.path).toBe('/routes/1/layout/children/0');
    expect(collected[3]?.node.component).toBe('UndoBar');
  });

  it('walkManifest skips routes without a layout (e.g. redirects)', () => {
    const manifest = baselineManifest();
    const visited: string[] = [];
    walkManifest(manifest, (_node, path) => {
      visited.push(path);
    });
    expect(visited.every((p) => p.startsWith('/routes/1/layout'))).toBe(true);
  });

  it('escapeJsonPointerSegment encodes ~ and / per RFC 6901', () => {
    expect(escapeJsonPointerSegment('a/b')).toBe('a~1b');
    expect(escapeJsonPointerSegment('a~b')).toBe('a~0b');
    expect(escapeJsonPointerSegment('a~/b')).toBe('a~0~1b');
    expect(escapeJsonPointerSegment(7)).toBe('7');
  });

  it('walks nested children recursively with correct paths', () => {
    const node: LayoutNode = {
      component: 'Root',
      children: [
        {
          component: 'Inner',
          children: [{ component: 'Leaf' }],
        },
      ],
    };
    // Use the manifest path so the visitor sees deep nesting.
    const manifest = baselineManifest();
    manifest.routes[1]!.layout = node;
    const visited: Array<{ component: string; path: string }> = [];
    walkManifest(manifest, (n, p) => visited.push({ component: n.component, path: p }));
    expect(visited).toEqual([
      { component: 'Root', path: '/routes/1/layout' },
      { component: 'Inner', path: '/routes/1/layout/children/0' },
      { component: 'Leaf', path: '/routes/1/layout/children/0/children/0' },
    ]);
  });
});
