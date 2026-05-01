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
    this.#maxRetries = opts.maxRetries ?? 1;
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
          : `${ctx.user}\n\n## PREVIOUS ATTEMPT FAILED VALIDATION — DO NOT REPEAT THE MISTAKE\n${formatValidationError(lastError)}\n\nThe error above means you produced a container with no children. **You MUST emit at least one child for every Stack / Container / Card / Tabs / Modal / Drawer in the layout.** Re-read the few-shot example in the prompt and mirror its depth. Output ONLY the corrected manifest JSON.`;

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

function formatValidationError(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String(err.message);
  }
  return String(err);
}
