// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Wave C / Phase C-3 — capability scoping pre-pass.
 *
 * When `CompileInput.capabilityResolver` is supplied, the compiler runs a
 * resolver call BEFORE prompt assembly to narrow the full capability
 * registry (potentially 200+ entries) to the top-N most relevant for
 * this route + intent. Only the narrowed subset is stuffed into the
 * system prompt; the C-2 agent's tool surface still sees the full
 * registry so it can broaden via `lookupCapability` /
 * `listCapabilities` when the resolver missed something.
 *
 * This file contains the shared helper used by both `GeminiCompiler`
 * and `ToolUsingCompiler`. The function is intentionally permissive:
 *
 *   - Returns the full registry unchanged when no resolver is set.
 *   - Returns the full registry unchanged when the resolver throws or
 *     resolves to an empty list (we never starve the prompt — the agent
 *     can still discover via tools, but the prompt's grounding suffers).
 *   - Caps `topN` to `[1, registry size]` so a misconfigured `topN: 0`
 *     can't accidentally blank the prompt.
 *
 * The resolver may implement either the high-level `resolve(query)`
 * shape OR the lower-level `scope(request, k, registry)` shape; the
 * helper bridges both. `scope` is preferred when both are present
 * because it threads route + user context to the underlying tiny model.
 */

import type { Capability } from '@atelier/schemas';
import type { CompileCapabilityResolver, CompileInput } from './types.js';

/**
 * Default top-N when the caller doesn't pass one. Sized so the narrowed
 * set fits comfortably in a Pro-model system prompt (≈5-10kB of schema
 * JSON). Mirrors `@atelier/capability-resolver`'s `DEFAULT_SCOPING_K`.
 */
export const DEFAULT_RESOLVER_TOP_N = 30;

/**
 * Apply the resolver to `input.capabilities` and return a narrowed
 * registry. If no resolver is supplied — or the resolver fails — the
 * original registry is returned unchanged.
 *
 * The shape of the returned object matches `input.capabilities` exactly
 * (a `Record<string, Capability>`) so callers can substitute it
 * verbatim.
 *
 * Errors from the resolver are reported via `onError` (when supplied)
 * and otherwise swallowed; the compile must never fail because of a
 * scoping hiccup. This mirrors the cascade story documented on
 * `EmbeddingCapabilityResolver` and `TwoStageCapabilityResolver`.
 */
export async function applyCapabilityResolver(
  input: CompileInput,
  options: { onError?: (err: unknown) => void } = {},
): Promise<Record<string, Capability>> {
  const resolver = input.capabilityResolver;
  if (!resolver) return input.capabilities;

  const fullRegistry = input.capabilities;
  const fullSize = Object.keys(fullRegistry).length;
  if (fullSize === 0) return fullRegistry;

  const topN = clampTopN(input.topN ?? DEFAULT_RESOLVER_TOP_N, fullSize);
  // Below threshold the scoping is pure overhead — the prompt already
  // fits. Skip the resolver call entirely.
  if (topN >= fullSize) return fullRegistry;

  const queryText = buildQueryText(input);

  let pickedIds: readonly string[] = [];
  try {
    pickedIds = await dispatchResolver(resolver, queryText, topN, input);
  } catch (err) {
    options.onError?.(err);
    return fullRegistry;
  }

  if (pickedIds.length === 0) {
    // Resolver returned nothing — degrade gracefully. The agent's tools
    // can still discover; the prompt loses grounding but the compile
    // proceeds.
    return fullRegistry;
  }

  // Narrow the registry to the picked ids, in resolver order. Drop ids
  // the resolver invented that don't exist in the live registry (the
  // resolver MAY hallucinate when stage 1 is an LLM).
  const narrowed: Record<string, Capability> = {};
  const seen = new Set<string>();
  for (const id of pickedIds) {
    if (seen.has(id)) continue;
    const cap = fullRegistry[id];
    if (!cap) continue;
    seen.add(id);
    narrowed[id] = cap;
  }
  // If every id was hallucinated, fall back to the full registry rather
  // than starving the prompt.
  if (Object.keys(narrowed).length === 0) return fullRegistry;
  return narrowed;
}

/**
 * Bridge a `CompileCapabilityResolver` (which may implement `scope`,
 * `resolve`, or both) into a flat `string[]` of picked ids. Prefers
 * `scope` because it carries route + user context, which the
 * production two-stage resolver feeds to its tiny model.
 */
async function dispatchResolver(
  resolver: CompileCapabilityResolver,
  queryText: string,
  topN: number,
  input: CompileInput,
): Promise<readonly string[]> {
  if (resolver.scope) {
    const refs = await resolver.scope(
      {
        intent: queryText,
        route: input.route,
        userId: input.user_id,
        appId: input.app_id,
        ...(input.signal !== undefined ? { signal: input.signal } : {}),
      },
      topN,
      input.capabilities,
    );
    return refs.map((r) => r.id);
  }
  if (resolver.resolve) {
    const result = await resolver.resolve({
      routeId: input.route,
      ...(input.intent !== undefined ? { intent: input.intent } : {}),
      text: queryText,
      topN,
      ...(input.signal !== undefined ? { signal: input.signal } : {}),
    });
    return result.capabilities.map((c) => c.id);
  }
  // No usable method — degrade silently.
  return [];
}

/**
 * Build the free-text query the resolver sees. Falls back through
 * `intent.summary` → route id so the resolver always has something
 * non-empty to work with.
 */
function buildQueryText(input: CompileInput): string {
  const intent = input.intent as { summary?: string; route_intent?: string } | undefined;
  const summary = intent?.summary;
  if (typeof summary === 'string' && summary.length > 0) return summary;
  return input.route;
}

function clampTopN(n: number, registrySize: number): number {
  if (!Number.isFinite(n)) return Math.min(DEFAULT_RESOLVER_TOP_N, registrySize);
  if (n < 1) return Math.min(DEFAULT_RESOLVER_TOP_N, registrySize);
  return Math.min(Math.floor(n), registrySize);
}
