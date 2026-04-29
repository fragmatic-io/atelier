// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Core eval types for `@cir/evals`.
 *
 * An eval is a single scenario: given an input, run a function, compare the
 * output to an expected value (or run a predicate). Files contributing evals
 * use the `*.eval.ts` extension and are picked up by the harness — never by
 * vitest, which is the unit/integration test runner.
 *
 * The five eval kinds (`capability`, `skill`, `component`, `manifest`,
 * `end-to-end`) match the taxonomy in `/Users/vid/cir/docs/production-concerns.md`
 * §"Evals". The runner aggregates results regardless of kind; reporters and
 * filters use the kind to slice output.
 *
 * `defineEval` is intentionally an identity function — it exists so authors
 * get inference and type errors at the call site without forcing the harness
 * to depend on a builder pattern.
 */

/** The five eval kinds CIR recognises. See `docs/production-concerns.md` §Evals. */
export type EvalKind = 'capability' | 'skill' | 'component' | 'manifest' | 'end-to-end';

/** Predicate-style assertion: receives the actual output, returns ok/not-ok. */
export type EvalPredicate<TOutput> = (output: TOutput) => boolean | Promise<boolean>;

/**
 * One eval scenario. Authors call `defineEval(...)` to build this object.
 *
 * `expected` is either a literal value compared by `compare` (default deep
 * equality) or a predicate that inspects `output` directly. The two cases are
 * disambiguated at runtime by `typeof expected === 'function'`.
 */
export interface EvalSpec<TInput = unknown, TOutput = unknown, TExpected = unknown> {
  /** Stable identifier; use a path-style string e.g. "capability/email-triage/marks-action-required". */
  id: string;
  /** Human description shown in reports. */
  description: string;
  kind: EvalKind;
  /** Optional tag list for filtering: --tag email --tag p1. */
  tags?: readonly string[];
  /** The scenario to execute. Returns the actual output. */
  run: (input: TInput) => Promise<TOutput> | TOutput;
  /** The input passed to run(). */
  input: TInput;
  /** What we expect run() to produce, OR a predicate. */
  expected: TExpected | EvalPredicate<TOutput>;
  /** Optional comparator. Default deepEqual; pass a custom one for fuzzy matching. */
  compare?: (actual: TOutput, expected: TExpected) => boolean | Promise<boolean>;
  /** Hard timeout per eval, ms. Default 10_000. */
  timeoutMs?: number;
  /** Skip with reason. */
  skip?: false | string;
  /** Mark as known-failing without breaking the run. */
  todo?: false | string;
}

/** Status of a single eval result. */
export type EvalStatus = 'pass' | 'fail' | 'skip' | 'todo' | 'timeout' | 'error';

/** The runner's per-eval output. Reporters consume this. */
export interface EvalResult {
  id: string;
  description: string;
  kind: EvalKind;
  status: EvalStatus;
  duration_ms: number;
  message?: string;
  /** Captured for fail reports. */
  expected?: unknown;
  actual?: unknown;
}

/**
 * Identity helper: lets authors write `defineEval({...})` and pick up inference
 * from the spec's input/output/expected positions. It is not a constructor —
 * we want zero runtime cost beyond the call.
 */
export function defineEval<TI, TO, TE>(spec: EvalSpec<TI, TO, TE>): EvalSpec<TI, TO, TE> {
  return spec;
}
