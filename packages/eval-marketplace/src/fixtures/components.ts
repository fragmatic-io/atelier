// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Frozen reference component definitions the V-6.e gate compiles against.
 *
 * Mirrors `apps/demo`'s catalog at the level of granularity the policy
 * validator cares about (composition rules + can_contain). Component
 * descriptions are intentionally short here — the gate doesn't run an
 * LLM compile by default, so the rich prose fields aren't load-bearing.
 *
 * As with `capabilities.ts`, this is a SUPERSET — recipes that reference
 * a component outside the set will see the policy validator's "unknown
 * component" surface fire, which is what we want: a fixed contract.
 */

import type { ComponentDefinition } from '@atelier/schemas';

const def = (overrides: Partial<ComponentDefinition>): ComponentDefinition => ({
  props_schema: 'GenericProps',
  data_sources: [],
  actions_supported: [],
  responsive_targets: ['web'],
  design_tokens: '@atelier/tokens/v0',
  examples: [],
  text_render: true,
  ...overrides,
});

/**
 * The set of components the gate considers "in the catalog". A persona
 * referencing a component outside this list will compile against an
 * empty registry slot for it; the runtime would still render via the
 * generic fallback, but the gate flags the unknown component as a
 * `composition` violation.
 */
export const REFERENCE_COMPONENTS: ComponentDefinition[] = [
  def({ props_schema: 'StackProps' }),
  def({ props_schema: 'ContainerProps' }),
  def({ props_schema: 'GridProps' }),
  def({ props_schema: 'ListProps' }),
  def({ props_schema: 'TableProps' }),
  def({ props_schema: 'NavBarProps' }),
  def({ props_schema: 'StatusBarProps' }),
  def({ props_schema: 'FilterBarProps' }),
  def({ props_schema: 'SearchProps' }),
  def({ props_schema: 'PaginationProps' }),
  def({ props_schema: 'ButtonProps' }),
  def({ props_schema: 'AlertProps' }),
  def({ props_schema: 'MarkdownProps' }),
  def({ props_schema: 'EmptyStateProps' }),
  def({ props_schema: 'SkeletonProps' }),
  def({ props_schema: 'WizardProps' }),
  def({ props_schema: 'FormProps' }),
  def({ props_schema: 'KPIRowProps' }),
  def({ props_schema: 'GalleryProps' }),
  def({ props_schema: 'DetailViewProps' }),
  def({ props_schema: 'DecisionQueueProps' }),
  def({ props_schema: 'TaskQueueProps' }),
  def({ props_schema: 'UndoBarProps' }),
];
