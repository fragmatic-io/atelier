// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * CompositeCompiler — try compilers in order; fall back on error.
 *
 * Typical wire-up:
 *   new CompositeCompiler([
 *     new GeminiCompiler({ apiKey: process.env.GEMINI_API_KEY }),
 *     new FallbackCompiler({ lookup: manifestForRoute }),
 *   ])
 *
 * If the LLM is unavailable, hits its rate limit, or returns invalid output,
 * we serve the hand-written manifest. The audit event records which compiler
 * actually produced the result via `compiler_model`.
 */

import {
  CompilerOutputError,
  CompilerUnavailableError,
  type CompileInput,
  type CompileResult,
  type CompilerService,
} from './types.js';

export interface CompositeCompilerOptions {
  /**
   * If true, swallow CompilerUnavailableError without trying further. Useful
   * when the first compiler's "unavailable" is a recoverable network blip
   * (you'd rather fall back than fail fast). Default true.
   */
  cascadeOnUnavailable?: boolean;
  /**
   * If true, swallow CompilerOutputError (validation/parse failures) and
   * cascade. Default true. Set false for strict environments where the LLM
   * MUST produce valid output and a fallback would mask a regression.
   */
  cascadeOnInvalidOutput?: boolean;
  /** Optional logger called on each cascade. */
  onCascade?: (from: string, error: unknown) => void;
}

export class CompositeCompiler implements CompilerService {
  readonly id: string;
  readonly #compilers: readonly CompilerService[];
  readonly #cascadeOnUnavailable: boolean;
  readonly #cascadeOnInvalidOutput: boolean;
  readonly #onCascade: ((from: string, error: unknown) => void) | undefined;

  constructor(compilers: readonly CompilerService[], opts: CompositeCompilerOptions = {}) {
    if (compilers.length === 0) {
      throw new Error('CompositeCompiler requires at least one compiler');
    }
    this.#compilers = compilers;
    this.#cascadeOnUnavailable = opts.cascadeOnUnavailable ?? true;
    this.#cascadeOnInvalidOutput = opts.cascadeOnInvalidOutput ?? true;
    this.#onCascade = opts.onCascade;
    this.id = `composite[${compilers.map((c) => c.id).join(',')}]`;
  }

  async compile(input: CompileInput): Promise<CompileResult> {
    let lastError: unknown;
    for (const compiler of this.#compilers) {
      try {
        return await compiler.compile(input);
      } catch (err) {
        lastError = err;
        const cascadable = this.#shouldCascade(err);
        if (!cascadable) throw err;
        this.#onCascade?.(compiler.id, err);
      }
    }
    throw new CompilerOutputError(
      `CompositeCompiler exhausted all compilers (${String(this.#compilers.length)})`,
      lastError,
    );
  }

  #shouldCascade(err: unknown): boolean {
    if (err instanceof CompilerUnavailableError) return this.#cascadeOnUnavailable;
    if (err instanceof CompilerOutputError) return this.#cascadeOnInvalidOutput;
    // Network errors, abort signals, generic Error — cascade by default;
    // it's safer to fall back than to surface a hard error to the user.
    return true;
  }
}
