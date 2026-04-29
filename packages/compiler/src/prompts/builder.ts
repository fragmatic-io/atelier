// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Per-call prompt context builder. Takes a `CompileInput` and returns the
 * variable portion of the prompt the LLM sees alongside the cached system
 * prompt.
 *
 * Goal: fit the variable portion in 5–15k tokens (per
 * `docs/token-economics.md`). We achieve this by:
 *   - Including only capabilities relevant to the route
 *   - Including only the skill abstracts (when_to_use, when_not_to_use)
 *   - Compressing component definitions to their props_schema names
 *   - Scoping the intent slice to the route's domain
 *   - Folding the brand kit into a compact JSON block
 *   - Echoing the previous manifest verbatim if we're in diff mode
 */

import type { CompileInput } from '../types.js';

export interface BuiltPromptContext {
  /** The variable portion of the prompt — appended after the cached system prompt. */
  user: string;
  /** Whether the input contained a previous manifest (diff mode). */
  diff_mode: boolean;
}

export function buildPromptContext(input: CompileInput): BuiltPromptContext {
  const lines: string[] = [];

  lines.push(`# Compile request`);
  lines.push(`route: ${input.route}`);
  lines.push(`user_id: ${input.user_id}`);
  lines.push(`app_id: ${input.app_id}`);
  if (input.trigger) {
    lines.push(`trigger: ${input.trigger.type}`);
    lines.push(`trigger_payload: ${JSON.stringify(input.trigger)}`);
  } else {
    lines.push(`trigger: cold (no previous manifest or fresh request)`);
  }
  lines.push('');

  // Capabilities — full schemas, since the compiler needs to know input/output
  // shapes, side effects, confirmation requirements, reversibility.
  lines.push(`## Capabilities you may reference`);
  lines.push('```json');
  lines.push(JSON.stringify(input.capabilities, null, 2));
  lines.push('```');
  lines.push('');

  // Skills — only the high-signal fields. The full markdown body is too
  // verbose for the compiler context.
  if (input.skills && Object.keys(input.skills).length > 0) {
    lines.push(`## Skills (when to use the capabilities)`);
    const compactSkills = Object.fromEntries(
      Object.entries(input.skills).map(([name, s]) => [
        name,
        {
          description: s.description,
          capabilities_used: s.capabilities_used,
          when_to_use: s.when_to_use,
          when_not_to_use: s.when_not_to_use,
          known_failure_modes: s.known_failure_modes,
        },
      ]),
    );
    lines.push('```json');
    lines.push(JSON.stringify(compactSkills, null, 2));
    lines.push('```');
    lines.push('');
  }

  // Components — name + props_schema name + allowed actions.
  lines.push(`## Components you may reference (by id)`);
  const componentSummary = input.components.map((c) => ({
    id: (c as { id?: string }).id ?? '<no-id>',
    props_schema: c.props_schema,
    data_sources: c.data_sources,
    actions_supported: c.actions_supported,
  }));
  lines.push('```json');
  lines.push(JSON.stringify(componentSummary, null, 2));
  lines.push('```');
  lines.push('');

  // Brand kit — central to staying on-brand.
  if (input.brandKit) {
    lines.push(`## Brand kit (mandatory; the policy engine will reject off-brand manifests)`);
    lines.push('```json');
    lines.push(JSON.stringify(input.brandKit, null, 2));
    lines.push('```');
    lines.push('');
  }

  // Intent — scoped slice; the resolver should already have filtered.
  if (input.intent) {
    lines.push(`## Intent (this user's preferences)`);
    lines.push('```json');
    lines.push(JSON.stringify(input.intent, null, 2));
    lines.push('```');
    lines.push('');
  }

  // Diff mode — include previous manifest verbatim.
  const diffMode = input.previousManifest !== undefined;
  if (diffMode) {
    lines.push(
      `## Previous manifest (diff mode — produce only the changes needed for the trigger)`,
    );
    lines.push('```json');
    lines.push(JSON.stringify(input.previousManifest, null, 2));
    lines.push('```');
    lines.push('');
  }

  lines.push(`## Your task`);
  lines.push(
    diffMode
      ? `The trigger above invalidated the previous manifest. Produce a NEW manifest for route "${input.route}" that addresses the trigger's effect. Preserve unrelated structure verbatim. Output the full new manifest JSON, not a diff.`
      : `Produce a manifest for route "${input.route}" matching the user's intent and brand kit. Output ONLY the manifest JSON.`,
  );

  return { user: lines.join('\n'), diff_mode: diffMode };
}
