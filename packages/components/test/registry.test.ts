import { resolve } from 'node:path';
import fg from 'fast-glob';
import { describe, expect, it } from 'vitest';
import { CompositionRulesSchema } from '@atelier/schemas';
import {
  ALL_COMPONENTS,
  COMPONENT_BINDINGS,
  COMPONENT_METADATA,
  COMPOSITION_RULES,
} from '../src/registry.js';

const EXPECTED = [
  'Accordion',
  'ActionMenu',
  'ActivityFeed',
  'Alert',
  'BlockEditor',
  'BlockMenu',
  'Breadcrumb',
  'BulkActionBar',
  'Button',
  'ButtonGroup',
  'Calendar',
  'Card',
  'Chart',
  'ChatThread',
  'CodeBlock',
  'CodeEditor',
  'CodeView',
  'CommandPalette',
  'Confetti',
  'ConfirmDialog',
  'Container',
  'DateInput',
  'DetailView',
  'DiffView',
  'Drawer',
  'DropZone',
  'EmptyState',
  'FileUpload',
  'FilterBar',
  'FilterQueryBar',
  'Form',
  'Gallery',
  'GenerativeLayout',
  'Grid',
  'HoverCard',
  'Icon',
  'Image',
  'KPIRow',
  'Kanban',
  'Lightbox',
  'List',
  'Logo',
  'Map',
  'Markdown',
  'MarketplaceBrowser',
  'MarketplaceScorecardPanel',
  'MetaBadge',
  'Modal',
  'MultiPane',
  'MultiSelect',
  'NavBar',
  'NumberInput',
  'Pagination',
  'Progress',
  'Queue',
  'RichText',
  'ScopeSwitcher',
  'Search',
  'Select',
  'SelectionActionBar',
  'SettingsSearch',
  'Sidebar',
  'Skeleton',
  'Slider',
  'Spinner',
  'Split',
  'Stack',
  'StatCard',
  'StatusBar',
  'Stepper',
  'Table',
  'Tabs',
  'TextInput',
  'TimeInput',
  'Timeline',
  'Toast',
  'Toggle',
  'Tooltip',
  // Wave 11 / Int-5 — `<TourProgress>` / `<TourStep>` ship alongside
  // `<Confetti>` (sorted in above between `CommandPalette` + `ConfirmDialog`).
  'TourProgress',
  'TourStep',
  'Tree',
  'VirtualList',
  'VirtualTable',
  'Wizard',
] as const;

describe('COMPONENT_BINDINGS', () => {
  it('contains exactly the 84 baseline components', () => {
    expect(Object.keys(COMPONENT_BINDINGS).sort()).toEqual([...EXPECTED]);
  });

  it('every binding has a matching id and a non-undefined factory', () => {
    for (const [key, binding] of Object.entries(COMPONENT_BINDINGS)) {
      expect(binding.id).toBe(key);
      expect(binding.factory).toBeDefined();
    }
  });
});

describe('ALL_COMPONENTS registry', () => {
  it('reports has() === true for every baseline component', () => {
    for (const id of EXPECTED) {
      expect(ALL_COMPONENTS.has(id)).toBe(true);
    }
  });

  it('list() reports all 84 ids', () => {
    expect(ALL_COMPONENTS.list().slice().sort()).toEqual([...EXPECTED]);
  });

  it('returns the same ComponentBinding object via get()', () => {
    for (const id of EXPECTED) {
      expect(ALL_COMPONENTS.get(id)).toBe(COMPONENT_BINDINGS[id]);
    }
  });

  it('returns undefined for an unknown id', () => {
    expect(ALL_COMPONENTS.get('NotARealComponent')).toBeUndefined();
    expect(ALL_COMPONENTS.has('NotARealComponent')).toBe(false);
  });
});

describe('COMPOSITION_RULES', () => {
  it('declares a rule for every component in the registry', () => {
    for (const id of EXPECTED) {
      expect(COMPOSITION_RULES[id]).toBeDefined();
    }
    expect(Object.keys(COMPOSITION_RULES).sort()).toEqual([...EXPECTED]);
  });

  it('Stack can_contain wildcard and bounded children', () => {
    const r = COMPOSITION_RULES['Stack']!;
    expect(r.can_contain).toBe('*');
    expect(r.min_children).toBe(1);
    expect(r.max_children).toBe(50);
  });

  it('Card accepts wildcard children (legacy panel + tile-mode dual usage)', () => {
    // Marketplace pivot — `<Card>` is dual-mode now. Legacy panel mode
    // wraps a body composed of layout/display children; tile mode is
    // rendered as a child of `<Grid data={...}>` with NO manifest
    // children (image/title/subtitle/price/badge/actions come from props
    // and `data` defaults). The composition rule was widened to '*' and
    // the min_children floor was dropped accordingly.
    const r = COMPOSITION_RULES['Card']!;
    expect(r.can_contain).toBe('*');
    expect(r.min_children).toBeUndefined();
  });

  it('layout containers Tabs/Accordion/Modal/Drawer/List/ButtonGroup/Form accept wildcard children', () => {
    for (const id of [
      'Tabs',
      'Accordion',
      'Modal',
      'Drawer',
      'List',
      'ButtonGroup',
      'Form',
    ] as const) {
      expect(COMPOSITION_RULES[id]?.can_contain).toBe('*');
    }
  });

  it('leaves declare can_contain="leaf"', () => {
    for (const leaf of [
      'Markdown',
      'Spinner',
      'Button',
      'TextInput',
      'Select',
      'Alert',
      'EmptyState',
      'ConfirmDialog',
      'Table',
      'DetailView',
      'StatCard',
      'Toast',
      'Progress',
      'Skeleton',
      'ActionMenu',
      'Search',
      'SettingsSearch',
      // Wave 11 / Nav-5 — chrome scope switcher (workspace / team / project).
      'ScopeSwitcher',
      'Wizard',
      'FilterBar',
      'KPIRow',
      'Gallery',
      // Wave 11 / AI-3 — generative layout panel; content driven by
      // host-supplied `generate(req)` + props (no manifest children).
      'GenerativeLayout',
      'CommandPalette',
      'BlockMenu',
      'BlockEditor',
      'Stepper',
      'NumberInput',
      'DateInput',
      'TimeInput',
      'MultiSelect',
      'Toggle',
      'Slider',
      'FileUpload',
      'NavBar',
      'Breadcrumb',
      'Pagination',
      // Phase 5c batch 3 — Display leaves added by the parallel agent.
      'Chart',
      'Timeline',
      'Tree',
      'CodeView',
      'DiffView',
      'Map',
      // Phase 5c batch 4 — Input + Navigation + Specialized leaves.
      'RichText',
      'CodeEditor',
      'Sidebar',
      'Kanban',
      'Calendar',
      'ChatThread',
      // Wave 7b / Vis-3 — Icon is a leaf; SVG sourced from IconResolver.
      'Icon',
      // Wave 10 / S-2 — virtualized variants render rows from a data
      // binding; manifest authors do not embed children.
      'VirtualList',
      'VirtualTable',
      // Wave 11 / Cnt-9 — ActivityFeed renders typed events from props.
      'ActivityFeed',
      // Wave 8 / V-6.c — vault-marketplace browse UI; content driven by
      // host-supplied `MarketplaceClient` (no manifest children).
      'MarketplaceBrowser',
      // Sprint 2.4 (P3.2) — compile-quality scorecard panel; content
      // driven by host-supplied `CompileQualityScorecard` prop.
      'MarketplaceScorecardPanel',
      // Wave 11 / Int-5 — onboarding microinteractions. All three are leaves.
      'TourStep',
      'TourProgress',
      'Confetti',
    ] as const) {
      expect(COMPOSITION_RULES[leaf]?.can_contain).toBe('leaf');
    }
  });

  it('Split is a 2-pane layout container', () => {
    const r = COMPOSITION_RULES['Split']!;
    expect(r.can_contain).toBe('*');
    expect(r.min_children).toBe(2);
    expect(r.max_children).toBe(2);
  });

  it('MultiPane is an N+-pane layout container with min_children=2 and no upper bound', () => {
    const r = COMPOSITION_RULES['MultiPane']!;
    expect(r.can_contain).toBe('*');
    expect(r.min_children).toBe(2);
    expect(r.max_children).toBeUndefined();
  });

  it('round-trips through @atelier/schemas CompositionRulesSchema', () => {
    // Wave 4 P-Reg-1: the schema previously rejected the 'leaf' sentinel,
    // which blocked composition rules from shipping as JSON. This test
    // gates against a regression — the entire `COMPOSITION_RULES` export
    // must parse through `CompositionRulesSchema`.
    const map: Record<string, unknown> = {};
    for (const [id, rule] of Object.entries(COMPOSITION_RULES)) {
      const raw = rule.can_contain;
      const canContain: string[] | '*' | 'leaf' = typeof raw === 'string' ? raw : [...raw];
      map[id] = {
        can_contain: canContain,
        ...(rule.min_children !== undefined ? { min_children: rule.min_children } : {}),
        ...(rule.max_children !== undefined ? { max_children: rule.max_children } : {}),
      };
    }
    expect(() => CompositionRulesSchema.parse(map)).not.toThrow();
    const parsed = CompositionRulesSchema.parse(map);
    expect(Object.keys(parsed).sort()).toEqual([...EXPECTED]);
  });
});

describe('COMPONENT_METADATA', () => {
  it('every entry keys a real component in the registry', () => {
    for (const id of Object.keys(COMPONENT_METADATA)) {
      expect(COMPONENT_BINDINGS[id], `metadata for unknown component ${id}`).toBeDefined();
    }
  });

  it('every dataSources / actionsSupported entry references a shipped capability', async () => {
    // Sanity gate: a typo'd capability id in the metadata silently makes the
    // emitted `components/registry.json` claim a binding to a capability
    // that does not exist. We crawl `capabilities/**/*.json` once and check
    // every metadata id against the resulting set. Repo root is two levels
    // up from this test file (`packages/components/test/`).
    const repoRoot = resolve(import.meta.dirname, '../../..');
    const capabilityFiles = await fg('capabilities/**/*.json', {
      cwd: repoRoot,
      absolute: true,
    });
    const capabilityIds = new Set<string>();
    for (const path of capabilityFiles) {
      const { readFile } = await import('node:fs/promises');
      const raw = await readFile(path, 'utf8');
      const parsed = JSON.parse(raw) as { id?: unknown };
      if (typeof parsed.id === 'string') capabilityIds.add(parsed.id);
    }
    expect(capabilityIds.size).toBeGreaterThan(0);
    for (const [componentId, meta] of Object.entries(COMPONENT_METADATA)) {
      for (const id of meta.dataSources ?? []) {
        expect(
          capabilityIds.has(id),
          `${componentId}.dataSources references unknown capability "${id}"`,
        ).toBe(true);
      }
      for (const id of meta.actionsSupported ?? []) {
        expect(
          capabilityIds.has(id),
          `${componentId}.actionsSupported references unknown capability "${id}"`,
        ).toBe(true);
      }
    }
  });

  it('List declares the shipped data-list capabilities and example recipes', () => {
    // Acceptance criterion: `components/registry.json` $.List.examples is
    // non-empty (proves the metadata pipeline works end-to-end).
    const meta = COMPONENT_METADATA['List'];
    expect(meta?.dataSources).toContain('github.repo.list');
    expect(meta?.dataSources).toContain('dummyjson.product.list');
    expect(meta?.examples?.length ?? 0).toBeGreaterThan(0);
  });
});
