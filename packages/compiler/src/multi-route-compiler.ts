// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `MultiRouteCompiler` — fan-out that pairs the once-per-app outline
 * pass with N parallel route compiles. Wave C / Phase C-4.
 *
 * Flow:
 *   1. Call `OutlineCompiler.compileOutline()` once per app — produces
 *      an `AppOutline` with chrome / nav / common policies / skill
 *      stack / brand kit id.
 *   2. Fan out N route compiles in parallel via `Promise.all`. Each
 *      route's `CompileInput` is augmented with the outline so the
 *      inner compiler (the existing `CompilerService` chain) can
 *      render only the route's content area knowing the chrome is
 *      supplied externally. Today the outline rides on `CompileInput`
 *      via the `outline` field — implementations that don't read it
 *      degrade to the existing per-route behaviour.
 *   3. Return `{ outline, manifests }` where `manifests` is a `Map`
 *      keyed by route id.
 *
 * The fan-out is unbounded by default (every route runs in parallel).
 * Hosts that need throttling can wrap the inner compiler in a
 * concurrency-limited compose step before passing it in; the contract
 * here is "outline once, then route compiles in parallel" — concurrency
 * policy is a layer up.
 *
 * ## Why outline-on-`CompileInput`?
 *
 * `CompileInput` already carries every per-compile signal (capabilities,
 * components, intent, brand kit, trigger). The outline is one more
 * signal of the same shape — adding an optional `outline` field keeps
 * the existing `CompilerService` contract intact for compilers that
 * don't read it (the deterministic / fallback path), while LLM-driven
 * compilers can fold it into the prompt to suppress chrome generation.
 *
 * The field lives on `CompileInput` (in `types.ts`) as an optional
 * property; this file consumes / threads it but does not re-declare
 * the shape.
 */

import type { Manifest } from '@atelier/schemas';
import type { OutlineCompiler, OutlineRouteInput } from './outline-compiler.js';
import type { CompileInput, CompileResult, CompilerService } from './types.js';
import type { AppOutline } from '@atelier/schemas';

/**
 * Per-route compile input for the fan-out. Combines the outline route
 * descriptor (id / policyIds / skillIds / …) with the full
 * `CompileInput` that drives the inner `CompilerService` for the
 * route's content compile. The `route` field on `CompileInput` is what
 * the inner compiler keys off; the `OutlineRouteInput` is what the
 * outline pre-pass reads.
 */
export interface MultiRouteEntry {
  /** Route descriptor consumed by the outline pre-pass. */
  outlineRoute: OutlineRouteInput;
  /** Full per-route compile input passed to the inner compiler. */
  compileInput: CompileInput;
}

export interface MultiRouteCompilerOptions {
  /** The outline compiler — typically `DeterministicOutlineCompiler`. */
  outline: OutlineCompiler;
  /** The per-route compiler — typically a `CompositeCompiler`. */
  inner: CompilerService;
}

/**
 * The result of a multi-route compile: the shared outline plus a map
 * from route id to the produced `Manifest`. Per-route token cost /
 * duration / model are NOT aggregated here — callers wanting
 * per-route diagnostics should drive the fan-out through their own
 * audit emitter (the inner compiler's `CompileResult` stays available
 * via the optional `routeResults` field for the same reason).
 */
export interface MultiRouteCompileResult {
  outline: AppOutline;
  /** Compiled manifest per route, keyed by `OutlineRouteInput.id`. */
  manifests: Map<string, Manifest>;
  /**
   * Optional per-route raw `CompileResult`s — same key as `manifests`.
   * Useful for audit / observability. The map is always present (may
   * be empty if the inner compiler returned a default).
   */
  routeResults: Map<string, CompileResult>;
}

/**
 * Fan-out compiler. Outline once, then N route compiles in parallel.
 * No retries / fallback at this layer — the inner compiler is
 * expected to handle that (typically by being a `CompositeCompiler`
 * with `GeminiCompiler` + `GenericFallbackCompiler` already wired).
 * If a route compile rejects, the outer `Promise.all` rejects too;
 * callers can wrap individual entries in `.catch()` upstream if they
 * want partial results.
 */
export class MultiRouteCompiler {
  readonly id: string;
  private readonly outlineCompiler: OutlineCompiler;
  private readonly inner: CompilerService;

  constructor(opts: MultiRouteCompilerOptions) {
    this.outlineCompiler = opts.outline;
    this.inner = opts.inner;
    this.id = `multi-route[${opts.outline.id},${opts.inner.id}]`;
  }

  async compileApp(input: {
    entries: readonly MultiRouteEntry[];
    brandKitId: string;
  }): Promise<MultiRouteCompileResult> {
    const outline = await this.outlineCompiler.compileOutline({
      routes: input.entries.map((e) => e.outlineRoute),
      brandKitId: input.brandKitId,
    });

    // Fan out. Every route compile runs in parallel via Promise.all so
    // the wall clock is bounded by the slowest route, not the sum.
    const routeResults = await Promise.all(
      input.entries.map(async (entry) => {
        const augmented: CompileInput = {
          ...entry.compileInput,
          outline,
        };
        const result = await this.inner.compile(augmented);
        return { id: entry.outlineRoute.id, result };
      }),
    );

    const manifests = new Map<string, Manifest>();
    const resultMap = new Map<string, CompileResult>();
    for (const { id, result } of routeResults) {
      manifests.set(id, result.manifest);
      resultMap.set(id, result);
    }

    return {
      outline,
      manifests,
      routeResults: resultMap,
    };
  }
}
