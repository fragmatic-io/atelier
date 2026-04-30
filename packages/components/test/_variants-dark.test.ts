// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Vis-2 — every variant table entry in `_variants.ts` must include at
 * least one `dark:`-prefixed Tailwind utility, so a host that configures
 * `darkMode: ['class', '[data-color-mode="dark"]']` (or the older `'class'`
 * strategy) gets a working pair-tested dark theme out of the box.
 *
 * This is a regression gate, not a visual snapshot — happy-dom does not
 * paint Tailwind. If a future variant lands in any table without a dark
 * sibling, this test fails loudly. Sizes-only tables (`actionSizeClass`,
 * `statSizeClass`) are intentionally skipped — sizes are pure layout
 * (padding / font-size) and have no colour concerns.
 */
import { describe, expect, it } from 'vitest';
import {
  actionVariantClass,
  bulkActionBarVariantClass,
  codeBlockVariantClass,
  displayVariantClass,
  hoverCardVariantClass,
  layoutVariantClass,
  pinnedSeparatorClass,
  searchVariantClass,
  statusBarColorClass,
  statusBarVariantClass,
  statVariantClass,
  tooltipVariantClass,
} from '../src/components/_variants.js';

const containsDarkPrefix = (cls: string): boolean => / dark:|^dark:/.test(cls);

describe('_variants.ts — dark-mode pairing (Vis-2)', () => {
  it('actionVariantClass — every variant carries a dark: prefix', () => {
    for (const [k, v] of Object.entries(actionVariantClass)) {
      expect(containsDarkPrefix(v), `actionVariantClass.${k}`).toBe(true);
    }
  });

  it('layoutVariantClass — non-ghost variants carry a dark: prefix', () => {
    // `ghost` is intentionally bg-transparent — it inherits the host surface.
    for (const [k, v] of Object.entries(layoutVariantClass)) {
      if (k === 'ghost') continue;
      expect(containsDarkPrefix(v), `layoutVariantClass.${k}`).toBe(true);
    }
  });

  it('displayVariantClass — every severity carries a dark: prefix', () => {
    for (const [k, v] of Object.entries(displayVariantClass)) {
      expect(containsDarkPrefix(v), `displayVariantClass.${k}`).toBe(true);
    }
  });

  it('statVariantClass — every variant carries a dark: prefix', () => {
    for (const [k, v] of Object.entries(statVariantClass)) {
      expect(containsDarkPrefix(v), `statVariantClass.${k}`).toBe(true);
    }
  });

  it('searchVariantClass — every variant carries a dark: prefix', () => {
    for (const [k, v] of Object.entries(searchVariantClass)) {
      expect(containsDarkPrefix(v), `searchVariantClass.${k}`).toBe(true);
    }
  });

  it('codeBlockVariantClass — every variant carries a dark: prefix', () => {
    for (const [k, v] of Object.entries(codeBlockVariantClass)) {
      expect(containsDarkPrefix(v), `codeBlockVariantClass.${k}`).toBe(true);
    }
  });

  it('tooltipVariantClass — every variant carries a dark: prefix', () => {
    for (const [k, v] of Object.entries(tooltipVariantClass)) {
      expect(containsDarkPrefix(v), `tooltipVariantClass.${k}`).toBe(true);
    }
  });

  it('hoverCardVariantClass — every variant carries a dark: prefix', () => {
    for (const [k, v] of Object.entries(hoverCardVariantClass)) {
      expect(containsDarkPrefix(v), `hoverCardVariantClass.${k}`).toBe(true);
    }
  });

  it('statusBarColorClass — every status carries a dark: prefix', () => {
    for (const [k, v] of Object.entries(statusBarColorClass)) {
      expect(containsDarkPrefix(v), `statusBarColorClass.${k}`).toBe(true);
    }
  });

  it('statusBarVariantClass — every variant carries a dark: prefix', () => {
    for (const [k, v] of Object.entries(statusBarVariantClass)) {
      expect(containsDarkPrefix(v), `statusBarVariantClass.${k}`).toBe(true);
    }
  });

  it('bulkActionBarVariantClass — every variant carries a dark: prefix', () => {
    for (const [k, v] of Object.entries(bulkActionBarVariantClass)) {
      expect(containsDarkPrefix(v), `bulkActionBarVariantClass.${k}`).toBe(true);
    }
  });

  it('pinnedSeparatorClass — every variant carries a dark: prefix', () => {
    for (const [k, v] of Object.entries(pinnedSeparatorClass)) {
      expect(containsDarkPrefix(v), `pinnedSeparatorClass.${k}`).toBe(true);
    }
  });

  // Cross-cutting sanity check — count enrichment as a proxy for "did Vis-2
  // really land?". If someone reverts the table the totals collapse.
  it('total entries with dark: across all colour-bearing tables ≥ 30', () => {
    const tables: Readonly<Record<string, string>>[] = [
      actionVariantClass,
      layoutVariantClass,
      displayVariantClass,
      statVariantClass,
      searchVariantClass,
      codeBlockVariantClass,
      tooltipVariantClass,
      hoverCardVariantClass,
      statusBarColorClass,
      statusBarVariantClass,
      bulkActionBarVariantClass,
      pinnedSeparatorClass,
    ];
    let n = 0;
    for (const t of tables) {
      for (const v of Object.values(t)) {
        if (containsDarkPrefix(v)) n += 1;
      }
    }
    expect(n).toBeGreaterThanOrEqual(30);
  });

  it('actionVariantClass.primary — sample shape', () => {
    expect(actionVariantClass.primary).toContain('bg-blue-600');
    expect(actionVariantClass.primary).toContain('dark:bg-blue-500');
  });

  it('displayVariantClass.error — sample shape', () => {
    expect(displayVariantClass.error).toContain('bg-red-50');
    expect(displayVariantClass.error).toContain('dark:bg-red-950');
  });

  it('layoutVariantClass.ghost — intentionally has no dark: prefix (transparent surface)', () => {
    expect(containsDarkPrefix(layoutVariantClass.ghost)).toBe(false);
  });
});
