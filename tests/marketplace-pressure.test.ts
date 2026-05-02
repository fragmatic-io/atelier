// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Marketplace pressure gate.
 *
 * Per `docs/ethos.md` principle #11 — "the marketplace is the product;
 * custom bindings are a last resort." This test asserts each demo's custom
 * binding count stays at or below a hard ceiling, ratcheting down over
 * time. A custom binding is something registered in the demo's
 * `DEMO_*_BINDINGS` record on top of `@atelier/components`'s
 * `COMPONENT_BINDINGS`. Headers / chrome / domain queues should compose
 * baseline primitives instead of authoring per-host React.
 *
 * Failure mode: if a contributor adds a new entry to one of the
 * `DEMO_*_BINDINGS` maps without first promoting the shape to baseline,
 * this test fails. The fix is one of:
 *
 *   1. Promote the shape to `@atelier/components` (preferred — see how `Queue`
 *      and `Logo` collapsed `DecisionQueue` / `TaskQueue` / `Wordmark` /
 *      `OctantHeader` / `MarigoldHeader` in the marketplace pivot).
 *   2. Express the shape as composition of existing primitives (`Stack` +
 *      `Card` + `Markdown`, etc.).
 *   3. If the binding is genuinely a host-specific invariant the LLM
 *      cannot hold (rare), update the `MAX_CUSTOM_BINDINGS` ceiling for
 *      that demo *and* add an entry to the
 *      `KNOWN_DOMAIN_CUSTOMS_FOLLOW_UP` block below explaining why
 *      AND when it'll collapse onto baseline.
 *
 * Numbers ratchet down — the ceiling for a given demo never grows. To
 * lower a ceiling once you've collapsed a binding, edit the constant
 * below in the same commit that deletes the binding.
 *
 * Implementation note: each demo's `DEMO_*_BINDINGS` source uses
 * Next.js's `@/` path alias, which Vitest does not resolve from this
 * root-level test. We therefore parse the binding ids statically from
 * each demo's source file. Brittle in theory; cheap and dependency-free
 * in practice — the `Object.freeze({...})` literal is the contract this
 * gate enforces.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Per-demo custom-binding ceilings. **Ratcheting only goes down.** When a
 * contributor lowers a number here in the same commit that deletes a
 * binding, the gate stays green. Adding a new binding without lowering
 * something else fails the gate.
 */
const MAX_CUSTOM_BINDINGS: Readonly<Record<string, number>> = Object.freeze({
  'apps/demo': 0,
  'apps/demo-github': 0,
  'apps/demo-dummyjson': 0,
});

/**
 * Domain-shape customs that remain after the marketplace pivot. Empty
 * across all three demos — the closing chapter retired the last
 * commerce primitives (`<ProductDetail>` / `<CartItemList>` /
 * `<CheckoutWizard>`) onto baseline composition. Future host-specific
 * invariants land here with a planned-migration entry.
 */
const KNOWN_DOMAIN_CUSTOMS_FOLLOW_UP: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'apps/demo': [],
  'apps/demo-github': [],
  'apps/demo-dummyjson': [],
});

interface DemoSource {
  name: string;
  /** Path (repo-rooted) to the file that exports the demo's bindings record. */
  source: string;
  /** The exported identifier carrying the bindings (used to scope the parse). */
  exportName: string;
}

const DEMOS: readonly DemoSource[] = [
  // Aurora exports `DEMO_BINDINGS` from a different file; same parser shape.
  {
    name: 'apps/demo',
    source: 'apps/demo/components/index.ts',
    exportName: 'DEMO_BINDINGS',
  },
  {
    name: 'apps/demo-github',
    source: 'apps/demo-github/lib/component-bindings.ts',
    exportName: 'DEMO_GITHUB_BINDINGS',
  },
  {
    name: 'apps/demo-dummyjson',
    source: 'apps/demo-dummyjson/lib/component-bindings.ts',
    exportName: 'DEMO_DUMMYJSON_BINDINGS',
  },
];

const REPO_ROOT = resolve(__dirname, '..');

/**
 * Static-parse the binding ids from a `DEMO_*_BINDINGS` export. We look
 * for the export, then for `Object.freeze({` (or just `{`), and collect
 * top-level `Identifier:` keys. Stops at the matching closing brace.
 */
function parseBindingIds(src: string, exportName: string): string[] {
  const exportRe = new RegExp(`export\\s+const\\s+${exportName}[^=]*=\\s*`);
  const headMatch = exportRe.exec(src);
  if (!headMatch) return [];
  let cursor = headMatch.index + headMatch[0].length;
  // Skip an optional `Object.freeze(` prefix.
  if (src.startsWith('Object.freeze(', cursor)) {
    cursor += 'Object.freeze('.length;
  }
  if (src[cursor] !== '{') return [];
  cursor += 1;
  // Walk until the matching closing brace, tracking nested braces.
  let depth = 1;
  let body = '';
  while (cursor < src.length && depth > 0) {
    const ch = src[cursor]!;
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
    body += ch;
    cursor += 1;
  }
  // Top-level keys: anything matching `^\s*Identifier\s*:` after splitting
  // on commas while respecting brace depth. We do a cheap rewalk.
  const ids: string[] = [];
  let bdepth = 0;
  let segment = '';
  const segments: string[] = [];
  for (const ch of body) {
    if (ch === '{' || ch === '[' || ch === '(') bdepth += 1;
    else if (ch === '}' || ch === ']' || ch === ')') bdepth -= 1;
    if (ch === ',' && bdepth === 0) {
      segments.push(segment);
      segment = '';
    } else {
      segment += ch;
    }
  }
  if (segment.trim().length > 0) segments.push(segment);
  for (const seg of segments) {
    const m = /^\s*([A-Z][A-Za-z0-9_]*)\s*:/.exec(seg);
    if (m) ids.push(m[1]!);
  }
  return ids.sort();
}

describe('marketplace pressure', () => {
  for (const demo of DEMOS) {
    const sourcePath = resolve(REPO_ROOT, demo.source);
    const text = readFileSync(sourcePath, 'utf8');
    const ids = parseBindingIds(text, demo.exportName);
    const ceiling = MAX_CUSTOM_BINDINGS[demo.name] ?? 0;
    const followUp = KNOWN_DOMAIN_CUSTOMS_FOLLOW_UP[demo.name] ?? [];

    it(`${demo.name} custom-binding count <= ceiling (${String(ceiling)})`, () => {
      if (ids.length > ceiling) {
        throw new Error(
          `${demo.name} ships ${String(ids.length)} custom bindings; ceiling is ${String(ceiling)}.\n` +
            `  Bindings: ${ids.join(', ')}\n` +
            'Per docs/ethos.md principle #11, custom bindings are a last resort.\n' +
            'Either: (a) promote the shape to @atelier/components baseline, ' +
            '(b) compose existing primitives, or ' +
            '(c) lower MAX_CUSTOM_BINDINGS and document the new follow-up entry.',
        );
      }
      expect(ids.length).toBeLessThanOrEqual(ceiling);
    });

    it(`${demo.name} every custom binding is documented as a known follow-up`, () => {
      const undocumented = ids.filter((id) => !followUp.includes(id));
      if (undocumented.length > 0) {
        throw new Error(
          `${demo.name} ships custom bindings without a follow-up entry:\n` +
            `  Undocumented: ${undocumented.join(', ')}\n` +
            'Add these to KNOWN_DOMAIN_CUSTOMS_FOLLOW_UP or remove the binding.',
        );
      }
      expect(undocumented).toEqual([]);
    });
  }

  it('all three demos ship zero custom bindings (marketplace-pivot proof complete)', () => {
    // Closing chapter of the marketplace pivot. Aurora led the
    // migration; Octant followed by collapsing `<IssueQueue>` onto
    // baseline `<Queue>`; Marigold finished by retiring the three
    // remaining commerce customs (`<ProductDetail>` /
    // `<CartItemList>` / `<CheckoutWizard>`) onto pure baseline
    // composition (`<Stack(Gallery, Card, DetailView)>` for product
    // detail, `<Queue data={cart}>` for the cart, `<Stack>` of
    // `<Form>`s for the checkout flow). Per `docs/ethos.md` principle
    // #11, the marketplace IS the product — every demo now proves it
    // ships zero per-host React.
    for (const demoName of ['apps/demo', 'apps/demo-github', 'apps/demo-dummyjson']) {
      const demo = DEMOS.find((d) => d.name === demoName)!;
      const text = readFileSync(resolve(REPO_ROOT, demo.source), 'utf8');
      const ids = parseBindingIds(text, demo.exportName);
      expect(ids, `${demoName} ships zero custom bindings`).toEqual([]);
    }
  });
});
