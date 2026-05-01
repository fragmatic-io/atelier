// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
import { describe, expect, it } from 'vitest';
import {
  ComponentDefinitionSchema,
  ComponentRegistrySchema,
  CompositionRuleSchema,
  CompositionRulesSchema,
} from '../src/component.js';

describe('ComponentDefinitionSchema', () => {
  it('parses the docs/artifacts.md §Component catalog example (TaskQueue)', () => {
    const def = {
      props_schema: 'TaskQueueProps',
      data_sources: ['task.list', 'thread.list'],
      actions_supported: ['task.complete', 'task.snooze', 'task.assign'],
      responsive_targets: ['web', 'mobile', 'tablet'],
      design_tokens: '@app/tokens/v3',
      examples: ['/examples/task-queue-basic.json'],
    };

    const parsed = ComponentDefinitionSchema.parse(def);
    expect(parsed.text_render).toBe(true); // default
    expect(parsed.props_schema).toBe('TaskQueueProps');
  });

  it('accepts a registry with multiple components', () => {
    const registry = {
      Stack: {
        props_schema: 'StackProps',
        data_sources: [],
        actions_supported: [],
        responsive_targets: ['web'],
        design_tokens: '@app/tokens',
        examples: [],
      },
      TaskQueue: {
        props_schema: 'TaskQueueProps',
        data_sources: ['task.list'],
        actions_supported: ['task.complete'],
        responsive_targets: ['web', 'mobile'],
        design_tokens: '@app/tokens',
        examples: [],
      },
    };
    expect(() => ComponentRegistrySchema.parse(registry)).not.toThrow();
  });

  it('rejects a definition without required fields', () => {
    const bad = { props_schema: 'X' };
    const result = ComponentDefinitionSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});

describe('CompositionRuleSchema', () => {
  it('accepts wildcard can_contain (Stack)', () => {
    const rule = {
      can_contain: '*',
      min_children: 1,
      max_children: 50,
      props: { direction: ['vertical', 'horizontal'] },
    };
    const parsed = CompositionRuleSchema.parse(rule);
    expect(parsed.can_contain).toBe('*');
    expect(parsed.props?.['direction']).toEqual(['vertical', 'horizontal']);
  });

  it('accepts an explicit child list (Form)', () => {
    const rule = {
      can_contain: ['TextInput', 'NumberInput', 'DateInput', 'Select', 'MultiSelect'],
    };
    expect(() => CompositionRuleSchema.parse(rule)).not.toThrow();
  });

  it('rejects unknown can_contain shape', () => {
    expect(() => CompositionRuleSchema.parse({ can_contain: 'Stack' })).toThrow();
  });

  it("accepts the 'leaf' sentinel for components with no children", () => {
    // Regression: the schema previously only accepted '*' or an array, but
    // the `@cir/components` `COMPOSITION_RULES` use 'leaf' to mean "no
    // children at all" (Markdown, Spinner, every input, …). The catalog
    // sync would have been blocked from emitting these rules without this
    // case. See `packages/schemas/src/component.ts` JSDoc on
    // `CompositionRuleSchema.can_contain`.
    expect(() => CompositionRuleSchema.parse({ can_contain: 'leaf' })).not.toThrow();
    const parsed = CompositionRuleSchema.parse({ can_contain: 'leaf' });
    expect(parsed.can_contain).toBe('leaf');
  });
});

describe('CompositionRulesSchema', () => {
  it('accepts a leaf-heavy bare-record map (Stack/Markdown/Card)', () => {
    // Round-trip a representative slice of the @cir/components rules through
    // the schema. The full-registry round-trip lives in
    // `packages/components/test/registry.test.ts` to avoid a circular
    // package dependency (`@cir/schemas` cannot depend on
    // `@cir/components` since `@cir/components` depends on `@cir/schemas`).
    const map = {
      Stack: { can_contain: '*' as const, min_children: 1, max_children: 50 },
      Markdown: { can_contain: 'leaf' as const },
      Card: { can_contain: ['Stack', 'Grid', 'Markdown'] },
    };
    expect(() => CompositionRulesSchema.parse(map)).not.toThrow();
    const parsed = CompositionRulesSchema.parse(map);
    expect(parsed['Stack']?.can_contain).toBe('*');
    expect(parsed['Markdown']?.can_contain).toBe('leaf');
    expect(Array.isArray(parsed['Card']?.can_contain)).toBe(true);
  });
});
