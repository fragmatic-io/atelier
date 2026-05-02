// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * FallbackCompiler — emits hand-written manifests instead of calling an LLM.
 *
 * Used in three scenarios:
 *   1. The host hasn't configured GEMINI_API_KEY (development without a key).
 *   2. The user's daily token budget is exhausted.
 *   3. The primary compiler keeps failing (rate-limited, validation failures,
 *      model outage). Wrapped via CompositeCompiler.
 *
 * The fallback is a function — the host owns the lookup. For the demo, we
 * pass a closure over the `manifestForRoute()` function in `lib/fake-manifests.ts`.
 */

import type { Manifest } from '@atelier/schemas';
import {
  CompilerOutputError,
  type CompileInput,
  type CompileResult,
  type CompilerService,
} from './types.js';

export interface FallbackCompilerOptions {
  /** Lookup: given a route path, return the hand-written manifest or null. */
  lookup: (route: string, input: CompileInput) => Manifest | null;
  /** Identifier recorded in audit events. Default 'fallback'. */
  id?: string;
}

export class FallbackCompiler implements CompilerService {
  readonly id: string;
  readonly #lookup: FallbackCompilerOptions['lookup'];

  constructor(opts: FallbackCompilerOptions) {
    this.id = opts.id ?? 'fallback';
    this.#lookup = opts.lookup;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async compile(input: CompileInput): Promise<CompileResult> {
    const startedAt = Date.now();
    const manifest = this.#lookup(input.route, input);
    if (!manifest) {
      throw new CompilerOutputError(`FallbackCompiler has no manifest for route ${input.route}`, {
        route: input.route,
      });
    }
    return {
      manifest,
      token_cost: 0,
      duration_ms: Date.now() - startedAt,
      model: this.id,
      diff_mode: false,
      reasoning: 'served from hand-written fallback (no LLM call)',
    };
  }
}
