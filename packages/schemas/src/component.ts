// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Component catalog schema.
 *
 * Mirrors `/Users/vid/cir/docs/artifacts.md` §Component catalog and the
 * composition rules described in `/Users/vid/cir/docs/component-catalog.md`.
 *
 * Two parallel structures live here:
 *  - `ComponentRegistrySchema`: ComponentId -> ComponentDefinition map (what
 *    the catalog GET endpoint returns)
 *  - `CompositionRuleSchema`: a per-component declaration of what it can
 *    contain (used by the compiler during layout generation and by the
 *    runtime for validation on render)
 */

import { z } from 'zod';
import { CapabilityId, ComponentId } from './common.js';

/**
 * One component definition in the catalog.
 *
 * `text_render` defaults to `true` because a text fallback is REQUIRED for
 * accessibility, voice, terminal UI, and graceful degradation per
 * `/Users/vid/cir/docs/chat/multi-modal.md`. Setting it false is an explicit
 * opt-out and should be rare (e.g. a pure visualization without semantic
 * content).
 */
export const ComponentDefinitionSchema = z.object({
  /** Name of the TypeScript prop type — e.g. `TaskQueueProps`. */
  props_schema: z.string().min(1),
  /** Capabilities that can supply data to this component. */
  data_sources: z.array(CapabilityId),
  /** Capabilities the component can dispatch as actions. */
  actions_supported: z.array(CapabilityId),
  /** Render targets supported (e.g. `web`, `mobile`, `tablet`, `voice`, `chat`). */
  responsive_targets: z.array(z.string().min(1)),
  /** Design token bundle reference, e.g. `@app/tokens/v3`. */
  design_tokens: z.string().min(1),
  /** Paths to example JSON files the compiler can use as few-shot fodder. */
  examples: z.array(z.string().min(1)),
  /** Whether this component has a text fallback. Defaults true. */
  text_render: z.boolean().default(true),
  /**
   * Short prose description for the LLM compiler — what is this component,
   * when should you pick it, when should you avoid it. This is the load-
   * bearing field that lets a compiler choose `<IssueQueue>` over `<List>`
   * when the route is a decision queue. Optional for backwards compat: a
   * catalog without descriptions still renders, but the compiler relies
   * heavily on this signal in its picking decisions.
   *
   * Phase 1.5 (Dynamic UI Activation) requires every shipped demo to
   * populate this for every binding it exposes, especially custom ones.
   * See `docs/ethos.md` principle #2 (composition, not invention).
   */
  description: z.string().optional(),
});

export type ComponentDefinition = z.infer<typeof ComponentDefinitionSchema>;

/**
 * The full registry: a record from ComponentId -> ComponentDefinition.
 *
 * Note: Zod's `z.record` does not enforce the key regex at validation time
 * by default. We accept that trade-off here — the registry is generated and
 * signed by the app, so unknown keys are a publish-time error, not a parse-
 * time concern.
 */
export const ComponentRegistrySchema = z.record(ComponentId, ComponentDefinitionSchema);
export type ComponentRegistry = z.infer<typeof ComponentRegistrySchema>;

/**
 * Composition rule for a single component.
 *
 * `can_contain`:
 *   - `'*'` means "any component" (e.g. `Stack`)
 *   - `'leaf'` means "no children at all" — the component owns its own internal
 *     markup or consumes its data via props (e.g. `Markdown`, `Spinner`,
 *     `Table`, every input). Distinct from `'*'`: `'leaf'` is a hard "no
 *     manifest children allowed" sentinel that mirrors
 *     `@atelier/components/src/registry.ts` `COMPOSITION_RULES`.
 *   - an array means "only these components" (e.g. `Form` only contains inputs)
 *
 * `props` describes ALLOWED VALUES for prop names — not types. e.g.
 * `{ direction: ['vertical', 'horizontal'] }`. The catalog's `props_schema`
 * (a TS type name) is the type-level contract; this is the compile-time
 * enumeration the compiler picks from.
 */
export const CompositionRuleSchema = z.object({
  can_contain: z.union([z.literal('*'), z.literal('leaf'), z.array(ComponentId)]),
  min_children: z.number().int().nonnegative().optional(),
  max_children: z.number().int().nonnegative().optional(),
  props: z.record(z.string(), z.array(z.string())).optional(),
});

export type CompositionRule = z.infer<typeof CompositionRuleSchema>;

/** Map of ComponentId -> CompositionRule, used as a sibling structure to the registry. */
export const CompositionRulesSchema = z.record(ComponentId, CompositionRuleSchema);
export type CompositionRules = z.infer<typeof CompositionRulesSchema>;
