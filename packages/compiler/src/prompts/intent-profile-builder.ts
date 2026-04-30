// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Per-call prompt builder for `compileIntentProfile()`.
 *
 * Mirrors the style of `builder.ts` (the manifest-compile prompt builder) but
 * targets the IntentProfile schema instead of Manifest. The user types a few
 * sentences about themselves; the LLM proposes a draft profile.
 *
 * Goal: keep the variable portion compact. The free-text description is the
 * only large input; everything else (capability ids, hard rules, schema hint)
 * is scoped to a few hundred tokens. Output target: one rule per
 * description-line of meaningful preference, plus lens slots for any apps
 * the user named.
 */
import type { Capability } from '@cir/schemas';

export interface IntentProfilePromptInput {
  description: string;
  user_id: string;
  capabilities: ReadonlyArray<Capability>;
}

export interface IntentProfilePromptResult {
  /** Variable portion of the prompt — appended after the cached system prompt. */
  user: string;
  /** True if the description appeared empty / whitespace only. */
  empty_description: boolean;
}

/**
 * Build the user-facing portion of the prompt. The system prompt
 * (`INTENT_PROFILE_SYSTEM_PROMPT`) is appended separately and stays cached.
 */
export function buildIntentProfilePrompt(
  input: IntentProfilePromptInput,
): IntentProfilePromptResult {
  const trimmed = input.description.trim();
  const empty = trimmed.length === 0;

  const lines: string[] = [];
  lines.push('# Intent profile compile request');
  lines.push(`user_id: ${input.user_id}`);
  lines.push('');

  // List the available capability ids so the compiler does not invent
  // capabilities. Keep this terse — only the ids; the compiler does not need
  // the full schemas to emit lenses/rules/vocabulary.
  lines.push('## Available capability ids (do not invent new ids)');
  if (input.capabilities.length === 0) {
    lines.push('(none — emit lenses/rules without binding capabilities)');
  } else {
    for (const c of input.capabilities) {
      lines.push(`- ${c.id} (${c.kind})`);
    }
  }
  lines.push('');

  lines.push("## User's free-text description");
  if (empty) {
    lines.push(
      '(empty — return a minimal valid profile with default global_preferences and no rules)',
    );
  } else {
    lines.push('```');
    lines.push(trimmed);
    lines.push('```');
  }
  lines.push('');

  lines.push('## Your task');
  lines.push(
    'Translate the description into a draft `IntentProfile` JSON. The runtime will let the user review and edit each field before persisting; you are seeding, not deciding.',
  );
  lines.push('');
  lines.push('## Output requirements');
  lines.push(
    '- Output ONLY the JSON object. No prose, no fencing, no commentary.',
    '- `user_id` MUST equal the value above.',
    '- `profile_version` MUST be 1 (this is a fresh profile).',
    '- `updated_at` MUST be a valid ISO-8601 datetime with offset.',
    '- `lenses` is a record `{domain: lens-name}`. Use `github` if they mention GitHub, `shopping` if they mention shopping, `today` for general daily-overview language. Do not invent fictional domains.',
    '- `rules` is an array of `{scope, rule, version, locked?}`. One rule per meaningful preference in the description. Use scope `*` for global, or a domain name for scoped rules. Set `locked: true` only when the user expresses an absolute prohibition ("never", "always confirm").',
    '- `global_preferences` may include `density` (`compact` | `comfortable` | `spacious`), `color_mode` (`light` | `dark` | `system`), `automation_trust` (`strict` | `cautious` | `permissive`), and any other free-form key/value the description suggests. Keep keys snake_case.',
    '- `vocabulary` is a record of name aliases / time references the user mentions (e.g. `{ "morning": "08:00-11:00" }`). Empty `{}` is fine.',
    '- `cross_app_workflows` may be omitted; only include an entry when the description names a multi-app sequence.',
    '- Be terse. One short sentence per rule; no explanatory prose inside fields.',
  );

  return { user: lines.join('\n'), empty_description: empty };
}

export const INTENT_PROFILE_SYSTEM_PROMPT = `You are CIR's intent-profile compiler. Your sole job is to translate a user's short free-text self-description into a draft IntentProfile JSON for that user to review and edit.

## What you produce

A single JSON object matching the IntentProfile schema. The schema is supplied via structured output. Top-level shape:

  {
    "user_id": "...",
    "profile_version": 1,
    "updated_at": "<iso8601>",
    "global_preferences": { ... },
    "lenses": { "<domain>": "<lens-name>" },
    "rules": [{ "scope": "<domain or *>", "rule": "<short imperative>", "version": 1 }],
    "vocabulary": { ... },
    "cross_app_workflows": []
  }

## Hard rules

1. Stay grounded in the description. Do not fabricate preferences the user did not state.
2. Use ONLY the capability ids listed in the per-call context for any rule that references a capability. If you can express a rule without naming a capability, do.
3. The output is a DRAFT. The user will review it. Prefer fewer, more precise rules over many speculative ones.
4. Do NOT include the user's raw description text inside any field. Translate it into structured shape; the description itself is not persisted.
5. Be cost-disciplined: one short rule per meaningful preference, no commentary, no nested JSON in rule strings.

## Output

Output ONLY the JSON object. No prose, no markdown fencing. Validation against the supplied response schema is mandatory.`;

export const INTENT_PROFILE_SYSTEM_PROMPT_VERSION = '1.0.0';
