// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * GeminiCompiler — calls Google's Gemini API (via @google/genai) to produce
 * manifests. Tier-routed: cold compiles use a heavier model (default
 * gemini-2.5-pro); diff-mode recompiles use a faster model (default
 * gemini-2.5-flash). Both validate output against the Manifest Zod schema
 * before returning; on validation failure we retry once with the failure
 * reason injected into the prompt.
 *
 * The compiler emits structured JSON via Gemini's `responseSchema`. We pass
 * the manifest's JSON Schema (codegen'd by `@cir/schemas` toJsonSchema()) as
 * the response schema; Gemini honors it. If the response still fails Zod
 * validation, that's a CompilerOutputError the resolver can catch and retry
 * or fall back from.
 */

import { GoogleGenAI, type GenerateContentConfig } from '@google/genai';
import { ManifestSchema, type Manifest } from '@cir/schemas';
import { COMPILER_SYSTEM_PROMPT, COMPILER_SYSTEM_PROMPT_VERSION } from './prompts/system.js';
import { buildPromptContext } from './prompts/builder.js';
import {
  CompilerOutputError,
  CompilerUnavailableError,
  type CompileInput,
  type CompileResult,
  type CompilerService,
} from './types.js';

export interface GeminiCompilerOptions {
  /** Required. Provided via env or explicit injection (tests). */
  apiKey: string;
  /** Cold-compile model. Default 'gemini-2.5-pro'. */
  coldModel?: string;
  /** Diff-mode model. Default 'gemini-2.5-flash'. */
  diffModel?: string;
  /** Optional override of the underlying client (for tests). */
  client?: GoogleGenAI;
  /** Maximum retries on validation failure. Default 1. */
  maxRetries?: number;
  /**
   * Optional post-parse hook the host supplies to enforce composition /
   * policy rules on the LLM's output. If it returns a non-empty `errors`
   * array, the compiler treats the output as invalid: it retries (up to
   * `maxRetries`) with the failure reason injected into the prompt, then
   * throws `CompilerOutputError` so the `CompositeCompiler` cascades to
   * the next compiler (typically `FallbackCompiler`).
   *
   * Without this, an LLM that emits a structurally-valid but
   * semantically-broken manifest (empty Stack, unknown component id,
   * etc.) would propagate to the runtime and surface as a render error
   * instead of cascading. Phase 1.5 (Dynamic UI Activation) added this.
   */
  validate?: (manifest: Manifest) => { errors: readonly string[] };
}

const DEFAULT_COLD_MODEL = 'gemini-2.5-pro';
const DEFAULT_DIFF_MODEL = 'gemini-2.5-flash';

export class GeminiCompiler implements CompilerService {
  readonly id: string;
  readonly #client: GoogleGenAI;
  readonly #coldModel: string;
  readonly #diffModel: string;
  readonly #maxRetries: number;
  readonly #validate: ((manifest: Manifest) => { errors: readonly string[] }) | undefined;

  constructor(opts: GeminiCompilerOptions) {
    if (!opts.apiKey) {
      throw new CompilerUnavailableError('GeminiCompiler requires an apiKey');
    }
    this.#client = opts.client ?? new GoogleGenAI({ apiKey: opts.apiKey });
    this.#coldModel = opts.coldModel ?? DEFAULT_COLD_MODEL;
    this.#diffModel = opts.diffModel ?? DEFAULT_DIFF_MODEL;
    this.#maxRetries = opts.maxRetries ?? 2;
    this.#validate = opts.validate;
    this.id = `gemini-compiler[${this.#coldModel},${this.#diffModel},sys@${COMPILER_SYSTEM_PROMPT_VERSION}]`;
  }

  async compile(input: CompileInput): Promise<CompileResult> {
    const ctx = buildPromptContext(input);
    const model = ctx.diff_mode ? this.#diffModel : this.#coldModel;
    const startedAt = Date.now();

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.#maxRetries; attempt++) {
      const userMessage =
        attempt === 0
          ? ctx.user
          : `${ctx.user}\n\n## PREVIOUS ATTEMPT FAILED VALIDATION — DO NOT REPEAT THE MISTAKE\n${formatValidationError(lastError)}\n\n${policyFixGuidance(lastError)}\n\nRe-read the few-shot example in the prompt and mirror its structure exactly. Output ONLY the corrected manifest JSON.`;

      const config: GenerateContentConfig = {
        systemInstruction: COMPILER_SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        // Note: we deliberately do NOT pass `responseSchema`. The Manifest
        // Zod schema declares `children` as optional; passing it as Gemini's
        // response_schema lets the model take the path of least resistance
        // and emit empty containers (technically schema-valid, semantically
        // useless). Without the schema constraint, the model follows the
        // few-shot example in the prompt more faithfully. We still validate
        // post-parse via Zod + the host's `validate` hook, so bad outputs
        // are caught and retried / cascaded. See ETHOS principles 1 & 5.
        temperature: ctx.diff_mode ? 0 : 0.2,
      };
      if (input.signal !== undefined) config.abortSignal = input.signal;
      const response = await this.#client.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        config,
      });

      const text = response.text ?? '';
      const tokenCost =
        (response.usageMetadata?.promptTokenCount ?? 0) +
        (response.usageMetadata?.candidatesTokenCount ?? 0);

      let manifest: Manifest;
      try {
        const parsed = JSON.parse(text) as unknown;
        // Auto-correct: the manifest_id is a server concern, not an LLM
        // concern. The LLM consistently produces ids that don't match
        // `/^m_[a-z0-9]{8,}$/` (uppercase, hyphens, etc.). Generate a
        // fresh server-side id and overwrite whatever the LLM emitted —
        // saves one round-trip and makes the validation deterministic.
        if (parsed && typeof parsed === 'object' && parsed !== null) {
          (parsed as { manifest_id?: string }).manifest_id = generateManifestId();
        }
        manifest = ManifestSchema.parse(parsed);
      } catch (err) {
        lastError = err;
        if (attempt === this.#maxRetries) {
          throw new CompilerOutputError(
            `Gemini output failed Manifest validation after ${String(attempt + 1)} attempts`,
            err,
          );
        }
        continue;
      }

      // Host-supplied post-parse validation (composition rules, policy
      // enforcement). When it surfaces errors, retry once with the failure
      // reasons injected into the prompt, then cascade.
      if (this.#validate) {
        const { errors } = this.#validate(manifest);
        if (errors.length > 0) {
          const validationError = new Error(
            `Manifest semantically invalid:\n  - ${errors.join('\n  - ')}`,
          );
          lastError = validationError;
          if (attempt === this.#maxRetries) {
            throw new CompilerOutputError(
              `Gemini output failed semantic validation after ${String(attempt + 1)} attempts`,
              validationError,
            );
          }
          continue;
        }
      }

      return {
        manifest,
        token_cost: tokenCost,
        duration_ms: Date.now() - startedAt,
        model,
        diff_mode: ctx.diff_mode,
      };
    }

    // Unreachable — the loop always either returns or throws.
    throw new CompilerOutputError('GeminiCompiler exhausted retries', lastError);
  }
}

/**
 * Generate a fresh server-side manifest_id matching `/^m_[a-z0-9]{8,}$/`.
 * Always 12 chars after the `m_` prefix: 8 from a base36 timestamp slice +
 * 4 from a random base36 nibble. Total entropy is sufficient for cache key
 * uniqueness; see resolver.ts for the cache key composition.
 */
function generateManifestId(): string {
  const ts = Date.now().toString(36).slice(-8);
  const rnd = Math.floor(Math.random() * 0xfffff)
    .toString(36)
    .padStart(4, '0');
  return `m_${ts}${rnd}`;
}

function formatValidationError(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String(err.message);
  }
  return String(err);
}

/**
 * Translate validator error messages into specific, actionable retry guidance.
 * Each clause maps a known failure pattern to "here's exactly how to fix it"
 * — much more directive than a generic "try again" message. Concatenated
 * across all matching patterns so a manifest with multiple violations gets
 * concrete fix steps for each. ETHOS principle #1.
 */
function policyFixGuidance(err: unknown): string {
  const msg =
    err && typeof err === 'object' && 'message' in err ? String((err as Error).message) : '';
  const guidance: string[] = [];

  if (/requires at least \d+ child(?:ren)?; got 0/.test(msg)) {
    guidance.push(
      '**Empty container fix**: every `Stack` / `Container` / `Card` / `Tabs` / `Modal` / `Drawer` MUST have at least one child. Look at the few-shot example: every container nests real components (Markdown, custom bindings, etc.) — never `children: []`.',
    );
  }

  if (/has data binding but no (empty|loading|error)_state/.test(msg)) {
    guidance.push(
      '**Data binding state-slots fix**: every component carrying `data: { source: ... }` MUST also include `data.empty_state`, `data.loading_state`, and `data.error_state` as inline LayoutNode slots. Use `<EmptyState>` for empty, `<Skeleton>` for loading, `<Alert variant="error">` for error.',
    );
  }

  if (/Rate-limited action ".+" is exposed without a visible quota indicator/.test(msg)) {
    const match = /Rate-limited action "([^"]+)" is exposed/.exec(msg);
    const cap = match?.[1] ?? '<capability>';
    guidance.push(
      `**Rate-limit fix**: the route exposes ${cap} (a rate-limited capability) but no node carries a quota data binding. Add a node — typically the chrome header — with \`data: { source: "${cap}.rate_limit" }\`. Look at the few-shot example: the chrome (e.g. \`<MarigoldHeader>\` or \`<OctantHeader>\`) carries the data binding even though it visually renders just a chip. The pattern \`*.rate_limit\` is the policy's allow-list — match it exactly.`,
    );
  }

  if (/Reversible action ".+" has no undo affordance/.test(msg)) {
    const match = /Reversible action "([^"]+)" has no undo affordance for rollback "([^"]+)"/.exec(
      msg,
    );
    const cap = match?.[1] ?? '<capability>';
    const rollback = match?.[2] ?? '<rollback>';
    guidance.push(
      `**Reversibility fix**: ${cap} is reversible but the route has no undo affordance. Add EITHER \`<UndoToast props={{ duration_ms: 5000 }} />\` somewhere in the layout (works for any reversible action while mounted), OR a \`<Button actions=["${rollback}"] />\` that may be visually inert (display:none).`,
    );
  }

  if (/Component "(\w+)" is a leaf and cannot have children/.test(msg)) {
    const match = /Component "(\w+)" is a leaf and cannot have children/.exec(msg);
    const id = match?.[1] ?? '<component>';
    guidance.push(
      `**Leaf component fix**: \`${id}\` declares \`can_contain: 'leaf'\` in the composition rules — it owns its own internal markup or consumes data via props. Set \`children: []\` on this node and put any content into \`props\` (e.g. \`items\`, \`label\`, \`data\`).`,
    );
  }

  if (/Manifest IDs must match/.test(msg)) {
    guidance.push(
      '**manifest_id fix**: must match `/^m_[a-z0-9]{8,}$/` exactly — `m_` prefix, then at least 8 lowercase alphanumeric characters. Examples: `m_x47azqp1`, `m_ghreview01`, `m_browsey001`. No uppercase, no dashes, no underscores after the prefix.',
    );
  }

  return guidance.length > 0
    ? guidance.join('\n\n')
    : "**General fix**: re-read the prompt rules and the few-shot example. Match the example's shape and content. Output the full corrected manifest JSON.";
}
