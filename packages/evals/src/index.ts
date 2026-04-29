// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * `@cir/evals` — public surface.
 *
 * Authors import `defineEval` to declare scenarios in `*.eval.ts` files; the
 * runner discovers them, the reporter prints them, and the CLI exposes both
 * to terminals and CI. Everything else (filtering helpers, internal worker
 * loops) is implementation detail.
 */

export {
  defineEval,
  type EvalKind,
  type EvalPredicate,
  type EvalResult,
  type EvalSpec,
  type EvalStatus,
} from './define.js';

export { runEvals, type RunHooks, type RunOptions, type RunSummary } from './run.js';

export { ConsoleReporter, JsonReporter, type Reporter } from './reporter.js';
