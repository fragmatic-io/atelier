// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Wave 7 / P-9 — high-salience auto-emphasis.
 *
 * Wraps a `DataResolver` so that, for any binding whose source capability
 * resolves to `salience_level: 'high'` (per
 * `@atelier/policies/baseline/salience#resolveSalience`), every returned row
 * gets a `emphasis: 'high'` field stamped on it before the data reaches
 * the renderer. The salience-aware containers (`<Queue>` / `<List>` /
 * `<Grid>` / `<Table>`) read the field and surface
 * `data-emphasis="high"` on the row element.
 *
 * This is the load-bearing change for P-9: without it, the schema
 * additions are metadata. With it, intent.priority_overrides →
 * capability.salience_level → row.emphasis → host stylesheet.
 *
 * Hosts can override on a per-row basis: a row that already carries an
 * `emphasis` field is left unchanged. The wrapper only fills the gap.
 */
import type { Capability, IntentProfile } from '@atelier/schemas';
import type { CapabilityLookup, DataBinding, DataResolver } from './types.js';
import { lookupCapability } from './types.js';

/**
 * Categorical salience levels, matching `Capability.salience_level`.
 *
 * Re-declared locally so this package does not take a dependency on
 * `@atelier/policies` (which would create a cycle: compiler depends on
 * policies depends on data-resolvers depends on policies). The resolver
 * helper lives here as a tiny duplicate; `@atelier/policies` exposes its
 * fully-typed `resolveSalience` for non-resolver consumers.
 */
type SalienceLevel = 'high' | 'normal' | 'low';

/** Default level when neither capability nor intent specifies one. */
const DEFAULT_LEVEL: SalienceLevel = 'normal';

/**
 * Glob matcher mirroring `@atelier/policies/baseline/salience#matchCapabilityGlob`.
 *
 * Kept tiny and duplicated here on purpose — the data-resolvers package
 * must not depend on `@atelier/policies`. The two implementations share an
 * eval test in the policy test file.
 */
function matchGlob(pattern: string, capabilityId: string): boolean {
  const DOUBLE = '';
  const SINGLE = '';
  const sentinelised = pattern.replaceAll('**', DOUBLE).replaceAll('*', SINGLE);
  const escaped = sentinelised.replaceAll(/[.+?^${}()|[\]\\]/g, '\\$&');
  const expanded = escaped.replaceAll(DOUBLE, '.*').replaceAll(SINGLE, '[A-Za-z0-9_-]+');
  try {
    return new RegExp(`^${expanded}$`).test(capabilityId);
  } catch {
    return false;
  }
}

/** Resolve the effective salience for a capability under an intent slice. */
function resolveLevel(
  capability: Pick<Capability, 'id' | 'salience_level'>,
  overrides: IntentProfile['priority_overrides'] | undefined,
): SalienceLevel {
  if (overrides) {
    for (const rule of overrides) {
      if (matchGlob(rule.capability_pattern, capability.id)) return rule.salience;
    }
  }
  return capability.salience_level ?? DEFAULT_LEVEL;
}

export interface WithHighSalienceEmphasisOptions {
  /** Capability registry the wrapper looks bindings up in. */
  capabilities: CapabilityLookup;
  /**
   * The user's `priority_overrides` (or `undefined` to honour
   * capability-declared levels). Pass a thin slice rather than the full
   * intent profile to avoid leaking unrelated user state into the
   * resolver pipeline.
   */
  priorityOverrides?: IntentProfile['priority_overrides'];
  /**
   * Override the level the wrapper treats as "auto-emphasise". Defaults to
   * `'high'`. Lower this to `'normal'` for tests; setting it to `'low'`
   * effectively disables the wrapper.
   */
  promoteAt?: SalienceLevel;
}

/**
 * Wrap a `DataResolver` so the rows it returns for high-salience
 * bindings carry `emphasis: 'high'`.
 *
 * Behaviour:
 *  - If the binding's source capability cannot be resolved (typo, unknown
 *    id), the wrapper is a no-op.
 *  - If the resolved level is below `promoteAt`, the wrapper is a no-op.
 *  - The wrapped resolver may return `undefined`, an array, or a
 *    `{ items: [...] }`-shaped object. The wrapper handles all three:
 *    arrays are mapped row-by-row; the `items` field is mapped on object
 *    payloads; everything else passes through unchanged.
 *  - A row that already carries an `emphasis` field is left alone.
 *
 * The wrapper is itself a `DataResolver` and composes naturally with
 * `withCache` and `CompositeDataResolver`.
 */
export function withHighSalienceEmphasis(
  inner: DataResolver,
  options: WithHighSalienceEmphasisOptions,
): DataResolver {
  const promoteAt = options.promoteAt ?? 'high';
  return async (binding: DataBinding): Promise<unknown> => {
    const result = await inner(binding);
    if (result === undefined || result === null) return result;
    const cap = lookupCapability(options.capabilities, binding.source);
    if (!cap) return result;
    const level = resolveLevel(cap, options.priorityOverrides);
    if (!shouldPromote(level, promoteAt)) return result;
    return stampEmphasis(result, level);
  };
}

/** True iff `level` is at least as strong as `threshold`. */
function shouldPromote(level: SalienceLevel, threshold: SalienceLevel): boolean {
  const order: Record<SalienceLevel, number> = { low: 0, normal: 1, high: 2 };
  return order[level] >= order[threshold];
}

/**
 * Stamp `emphasis` onto every row of a data payload.
 *
 * Recognised shapes:
 *  - Plain array (`[row, row, ...]`) — mapped element-by-element.
 *  - `{ items: [...] }` — `items` mapped, other fields preserved.
 *  - Anything else passes through unchanged so unusual shapes (single
 *    object, scalar) are not corrupted.
 */
function stampEmphasis(payload: unknown, level: SalienceLevel): unknown {
  if (Array.isArray(payload)) return payload.map((row) => stampRow(row, level));
  if (payload && typeof payload === 'object' && 'items' in payload) {
    const items = payload.items;
    if (Array.isArray(items)) {
      return { ...payload, items: items.map((row) => stampRow(row, level)) };
    }
  }
  return payload;
}

/**
 * Stamp `emphasis` on a single row. No-op for non-objects (scalars,
 * strings) and for rows that already declare an `emphasis` field. Always
 * returns a NEW object — the caller never holds a reference to the
 * mutated row.
 */
function stampRow(row: unknown, level: SalienceLevel): unknown {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
  const r = row as Record<string, unknown>;
  if ('emphasis' in r && r['emphasis'] !== undefined) return r;
  return { ...r, emphasis: level };
}
