// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Eval runner.
 *
 * Discovers `*.eval.ts` files matching `patterns`, dynamically imports each
 * one, harvests every `EvalSpec` it can find (default export, named exports,
 * arrays of specs), filters by kind/tag/id, runs them with bounded
 * concurrency, and returns an aggregate `RunSummary`.
 *
 * Comparison strategy:
 *  - `compare` overrides default behaviour entirely.
 *  - Predicate-style `expected` (`typeof === 'function'`) receives the actual
 *    output and decides pass/fail.
 *  - Otherwise the runner falls back to `node:util.isDeepStrictEqual`.
 *
 * Timeouts are enforced with `Promise.race` against a setTimeout — if the
 * eval's `run()` hangs forever the harness still terminates the slot, but
 * the underlying promise is left to settle on its own (Node has no
 * promise-cancellation primitive). The result is reported as `timeout`.
 *
 * Concurrency is implemented inline (no `p-limit` dependency). Default is 1
 * for deterministic ordering — most eval suites are short and reproducibility
 * is more valuable than throughput.
 */

import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import fg from 'fast-glob';
import type { EvalKind, EvalResult, EvalSpec, EvalStatus } from './define.js';

/** Options controlling discovery, filtering, and execution. */
export interface RunOptions {
  /** Glob patterns to discover eval files. Default ['evals/**\/*.eval.ts']. */
  patterns?: readonly string[];
  /** Filter by kind. Empty/undefined = no kind filter. */
  kinds?: readonly EvalKind[];
  /** Filter by tag (any-match). Empty/undefined = no tag filter. */
  tags?: readonly string[];
  /** Filter by id substring. */
  filter?: string;
  /** Default per-eval timeout. Default 10_000ms. */
  defaultTimeoutMs?: number;
  /** Concurrency. Default 1 (deterministic ordering). */
  concurrency?: number;
}

/** Aggregate result returned to callers (and to reporters). */
export interface RunSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  todo: number;
  timedOut: number;
  errored: number;
  duration_ms: number;
  results: readonly EvalResult[];
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_PATTERN = 'evals/**/*.eval.ts';

/** Type-guard: is `value` a plausible EvalSpec shape? */
function isEvalSpec(value: unknown): value is EvalSpec {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['id'] === 'string' &&
    typeof v['description'] === 'string' &&
    typeof v['kind'] === 'string' &&
    typeof v['run'] === 'function' &&
    'input' in v &&
    'expected' in v
  );
}

/** Harvest every EvalSpec exported by a module (default + named + arrays). */
function harvestSpecs(mod: Record<string, unknown>): EvalSpec[] {
  const out: EvalSpec[] = [];
  for (const value of Object.values(mod)) {
    if (isEvalSpec(value)) {
      out.push(value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (isEvalSpec(item)) out.push(item);
      }
    }
  }
  return out;
}

/** Discover and import every eval file under `cwd` matching `patterns`. */
async function loadSpecs(cwd: string, patterns: readonly string[]): Promise<EvalSpec[]> {
  const files = await fg([...patterns], {
    cwd,
    absolute: true,
    onlyFiles: true,
    unique: true,
    ignore: ['**/node_modules/**', '**/dist/**', '**/coverage/**'],
  });
  files.sort();
  const specs: EvalSpec[] = [];
  for (const file of files) {
    const mod = (await import(pathToFileURL(file).href)) as Record<string, unknown>;
    specs.push(...harvestSpecs(mod));
  }
  return specs;
}

/** Apply kind/tag/id filters to a spec list. */
function filterSpecs(specs: readonly EvalSpec[], options: RunOptions): EvalSpec[] {
  const kindSet = options.kinds && options.kinds.length > 0 ? new Set(options.kinds) : null;
  const tagSet = options.tags && options.tags.length > 0 ? new Set(options.tags) : null;
  const idFilter = options.filter ?? '';
  return specs.filter((spec) => {
    if (kindSet && !kindSet.has(spec.kind)) return false;
    if (tagSet) {
      const specTags = spec.tags ?? [];
      let any = false;
      for (const t of specTags) {
        if (tagSet.has(t)) {
          any = true;
          break;
        }
      }
      if (!any) return false;
    }
    if (idFilter && !spec.id.includes(idFilter)) return false;
    return true;
  });
}

/** Symbol returned by the timeout race when the timer wins. */
const TIMEOUT_SENTINEL = Symbol('eval-timeout');

/** Race `promise` against a timer; resolve with TIMEOUT_SENTINEL on timer win. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMEOUT_SENTINEL> {
  return new Promise<T | typeof TIMEOUT_SENTINEL>((resolveOuter, rejectOuter) => {
    const timer = setTimeout(() => resolveOuter(TIMEOUT_SENTINEL), ms);
    timer.unref?.();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolveOuter(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        rejectOuter(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

/** Decide pass/fail for a non-timeout, non-error eval result. */
async function decide(spec: EvalSpec, actual: unknown): Promise<boolean> {
  const expected = spec.expected;
  if (typeof expected === 'function') {
    const predicate = expected as (output: unknown) => boolean | Promise<boolean>;
    return Boolean(await predicate(actual));
  }
  if (spec.compare) {
    const compare = spec.compare;
    return Boolean(await compare(actual, expected));
  }
  return isDeepStrictEqual(actual, expected);
}

/** Run a single spec and turn its outcome into an EvalResult. */
async function runOne(spec: EvalSpec, defaultTimeoutMs: number): Promise<EvalResult> {
  const base = { id: spec.id, description: spec.description, kind: spec.kind } as const;

  if (spec.skip) {
    return { ...base, status: 'skip', duration_ms: 0, message: spec.skip };
  }
  if (spec.todo) {
    return { ...base, status: 'todo', duration_ms: 0, message: spec.todo };
  }

  const timeoutMs = spec.timeoutMs ?? defaultTimeoutMs;
  const start = performance.now();
  let actual: unknown;
  try {
    const racing = Promise.resolve().then(() => spec.run(spec.input));
    const settled = await withTimeout(racing, timeoutMs);
    if (settled === TIMEOUT_SENTINEL) {
      return {
        ...base,
        status: 'timeout' satisfies EvalStatus,
        duration_ms: Math.round(performance.now() - start),
        message: `eval exceeded timeout of ${String(timeoutMs)}ms`,
      };
    }
    actual = settled;
  } catch (err: unknown) {
    return {
      ...base,
      status: 'error',
      duration_ms: Math.round(performance.now() - start),
      message: err instanceof Error ? err.message : String(err),
    };
  }

  let passed = false;
  try {
    passed = await decide(spec, actual);
  } catch (err: unknown) {
    return {
      ...base,
      status: 'error',
      duration_ms: Math.round(performance.now() - start),
      message: err instanceof Error ? err.message : String(err),
      actual,
    };
  }

  const duration_ms = Math.round(performance.now() - start);
  if (passed) {
    return { ...base, status: 'pass', duration_ms };
  }
  return {
    ...base,
    status: 'fail',
    duration_ms,
    message: 'expected and actual differ',
    expected: typeof spec.expected === 'function' ? '<predicate>' : spec.expected,
    actual,
  };
}

/**
 * Run a list of specs with bounded concurrency, preserving result order.
 *
 * Implemented inline rather than pulling `p-limit`. Workers pull the next
 * index from a shared cursor; results land at their original index so output
 * order is stable regardless of completion order.
 */
async function runWithConcurrency(
  specs: readonly EvalSpec[],
  defaultTimeoutMs: number,
  concurrency: number,
  onResult?: (result: EvalResult) => void,
): Promise<EvalResult[]> {
  const results = new Array<EvalResult>(specs.length);
  let cursor = 0;
  const slots = Math.max(1, Math.min(concurrency, specs.length || 1));

  const workers: Promise<void>[] = [];
  for (let w = 0; w < slots; w++) {
    workers.push(
      (async (): Promise<void> => {
        for (;;) {
          const i = cursor++;
          if (i >= specs.length) return;
          const spec = specs[i];
          if (!spec) return;
          const result = await runOne(spec, defaultTimeoutMs);
          results[i] = result;
          onResult?.(result);
        }
      })(),
    );
  }
  await Promise.all(workers);
  return results;
}

/** Tally a list of results into a RunSummary. */
function summarise(results: readonly EvalResult[], duration_ms: number): RunSummary {
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let todo = 0;
  let timedOut = 0;
  let errored = 0;
  for (const r of results) {
    switch (r.status) {
      case 'pass':
        passed++;
        break;
      case 'fail':
        failed++;
        break;
      case 'skip':
        skipped++;
        break;
      case 'todo':
        todo++;
        break;
      case 'timeout':
        timedOut++;
        break;
      case 'error':
        errored++;
        break;
    }
  }
  return {
    total: results.length,
    passed,
    failed,
    skipped,
    todo,
    timedOut,
    errored,
    duration_ms,
    results,
  };
}

/** Hook surface for streaming progress to a reporter. Internal to runEvals. */
export interface RunHooks {
  onStart?: (plan: { total: number }) => void;
  onResult?: (result: EvalResult) => void;
  onSummary?: (summary: RunSummary) => void;
}

/**
 * Discover, filter, and execute every eval under `cwd`.
 *
 * Pure async — the function returns once all evals complete. Hooks let
 * reporters stream output as evals finish, but a `RunSummary` is always
 * returned so callers (CI, scripts) can act on the aggregate.
 */
export async function runEvals(
  cwd: string,
  options: RunOptions = {},
  hooks: RunHooks = {},
): Promise<RunSummary> {
  const patterns =
    options.patterns && options.patterns.length > 0 ? options.patterns : [DEFAULT_PATTERN];
  const defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const concurrency = options.concurrency ?? 1;

  const absCwd = resolve(cwd);
  const discovered = await loadSpecs(absCwd, patterns);
  const specs = filterSpecs(discovered, options);

  hooks.onStart?.({ total: specs.length });

  const start = performance.now();
  const results = await runWithConcurrency(specs, defaultTimeoutMs, concurrency, hooks.onResult);
  const duration_ms = Math.round(performance.now() - start);

  const summary = summarise(results, duration_ms);
  hooks.onSummary?.(summary);
  return summary;
}
