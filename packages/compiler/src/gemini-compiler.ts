// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
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

import { GoogleGenAI } from '@google/genai';
import { ManifestSchema, toJsonSchema, type Manifest } from '@cir/schemas';
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
}

const DEFAULT_COLD_MODEL = 'gemini-2.5-pro';
const DEFAULT_DIFF_MODEL = 'gemini-2.5-flash';

export class GeminiCompiler implements CompilerService {
  readonly id: string;
  readonly #client: GoogleGenAI;
  readonly #coldModel: string;
  readonly #diffModel: string;
  readonly #maxRetries: number;

  constructor(opts: GeminiCompilerOptions) {
    if (!opts.apiKey) {
      throw new CompilerUnavailableError('GeminiCompiler requires an apiKey');
    }
    this.#client = opts.client ?? new GoogleGenAI({ apiKey: opts.apiKey });
    this.#coldModel = opts.coldModel ?? DEFAULT_COLD_MODEL;
    this.#diffModel = opts.diffModel ?? DEFAULT_DIFF_MODEL;
    this.#maxRetries = opts.maxRetries ?? 1;
    this.id = `gemini-compiler[${this.#coldModel},${this.#diffModel},sys@${COMPILER_SYSTEM_PROMPT_VERSION}]`;
  }

  async compile(input: CompileInput): Promise<CompileResult> {
    const ctx = buildPromptContext(input);
    const model = ctx.diff_mode ? this.#diffModel : this.#coldModel;
    const startedAt = Date.now();

    // Manifest JSON Schema for structured output. Gemini accepts a subset of
    // OpenAPI-flavored schema; zod-to-json-schema produces 2019-09 by default,
    // which Gemini interprets adequately (it ignores unknown keywords).
    const responseSchema = toJsonSchema(ManifestSchema, {
      name: 'manifest',
      target: 'jsonSchema7',
    });

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.#maxRetries; attempt++) {
      const userMessage =
        attempt === 0
          ? ctx.user
          : `${ctx.user}\n\n## Previous attempt failed validation\n${formatValidationError(lastError)}\n\nFix and re-emit. Output ONLY the corrected manifest JSON.`;

      const response = await this.#client.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        config: {
          systemInstruction: COMPILER_SYSTEM_PROMPT,
          responseMimeType: 'application/json',
          responseSchema,
          // Cold compiles: a touch of variability. Diff mode: deterministic.
          temperature: ctx.diff_mode ? 0 : 0.2,
          abortSignal: input.signal,
        },
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
