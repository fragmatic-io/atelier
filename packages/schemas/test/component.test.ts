// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
import { describe, expect, it } from 'vitest';
import {
  ComponentDefinitionSchema,
  ComponentRegistrySchema,
  CompositionRuleSchema,
} from '../src/component.ts';

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
});
