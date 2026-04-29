import { describe, expect, it } from 'vitest';
import { ALL_COMPONENTS, COMPONENT_BINDINGS, COMPOSITION_RULES } from '../src/registry.js';

const EXPECTED = [
  'Accordion',
  'ActionMenu',
  'Alert',
  'Breadcrumb',
  'Button',
  'ButtonGroup',
  'Calendar',
  'Card',
  'Chart',
  'ChatThread',
  'CodeEditor',
  'CodeView',
  'CommandPalette',
  'ConfirmDialog',
  'Container',
  'DateInput',
  'DetailView',
  'DiffView',
  'Drawer',
  'EmptyState',
  'FileUpload',
  'FilterBar',
  'Form',
  'Gallery',
  'Grid',
  'KPIRow',
  'Kanban',
  'List',
  'Map',
  'Markdown',
  'Modal',
  'MultiSelect',
  'NavBar',
  'NumberInput',
  'Pagination',
  'Progress',
  'RichText',
  'Search',
  'Select',
  'Sidebar',
  'Skeleton',
  'Slider',
  'Spinner',
  'Split',
  'Stack',
  'StatCard',
  'Stepper',
  'Table',
  'Tabs',
  'TextInput',
  'TimeInput',
  'Timeline',
  'Toast',
  'Toggle',
  'Tree',
  'Wizard',
] as const;

describe('COMPONENT_BINDINGS', () => {
  it('contains exactly the 56 baseline components', () => {
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

  it('list() reports all 56 ids', () => {
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

  it('Card restricts to known display children', () => {
    const r = COMPOSITION_RULES['Card']!;
    expect(Array.isArray(r.can_contain)).toBe(true);
    expect(r.can_contain).toEqual(['Stack', 'Grid', 'Markdown', 'Table', 'EmptyState']);
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
      'Wizard',
      'FilterBar',
      'KPIRow',
      'Gallery',
      'CommandPalette',
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
});
