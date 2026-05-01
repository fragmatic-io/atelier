// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleReporter, JsonReporter } from '../src/reporter.js';
import type { EvalResult } from '../src/define.js';
import type { RunSummary } from '../src/run.js';

function makeResult(overrides: Partial<EvalResult>): EvalResult {
  return {
    id: 'reporter/test',
    description: 'reporter fixture',
    kind: 'capability',
    status: 'pass',
    duration_ms: 1,
    ...overrides,
  };
}

function makeSummary(results: readonly EvalResult[]): RunSummary {
  return {
    total: results.length,
    passed: results.filter((r) => r.status === 'pass').length,
    failed: results.filter((r) => r.status === 'fail').length,
    skipped: results.filter((r) => r.status === 'skip').length,
    todo: results.filter((r) => r.status === 'todo').length,
    timedOut: results.filter((r) => r.status === 'timeout').length,
    errored: results.filter((r) => r.status === 'error').length,
    duration_ms: 5,
    results,
  };
}

describe('ConsoleReporter', () => {
  let captured: string;
  let writeSpy: ReturnType<typeof vi.spyOn<NodeJS.WriteStream, 'write'>>;

  beforeEach(() => {
    captured = '';
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      captured += typeof chunk === 'string' ? chunk : String(chunk);
      return true;
    });
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  it('prints PASS / FAIL / SKIP / TODO / TIME / ERR glyphs', () => {
    const results: EvalResult[] = [
      makeResult({ id: 'r/pass', status: 'pass' }),
      makeResult({ id: 'r/fail', status: 'fail', expected: 1, actual: 2, message: 'diff' }),
      makeResult({ id: 'r/skip', status: 'skip', message: 'reason' }),
      makeResult({ id: 'r/todo', status: 'todo', message: 'later' }),
      makeResult({ id: 'r/timeout', status: 'timeout', message: 'slow' }),
      makeResult({ id: 'r/error', status: 'error', message: 'boom' }),
    ];
    ConsoleReporter.onStart({ total: results.length });
    for (const r of results) ConsoleReporter.onResult(r);
    ConsoleReporter.onSummary(makeSummary(results));

    expect(captured).toContain('PASS');
    expect(captured).toContain('FAIL');
    expect(captured).toContain('SKIP');
    expect(captured).toContain('TODO');
    expect(captured).toContain('TIME');
    expect(captured).toContain('ERR');
    // Fail result includes expected/actual sections.
    expect(captured).toContain('expected:');
    expect(captured).toContain('actual:');
    // Summary echoes counts.
    expect(captured).toContain('1 passed');
    expect(captured).toContain('1 failed');
  });
});

describe('JsonReporter', () => {
  let captured: string[];
  let writeSpy: ReturnType<typeof vi.spyOn<NodeJS.WriteStream, 'write'>>;

  beforeEach(() => {
    captured = [];
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      const text = typeof chunk === 'string' ? chunk : String(chunk);
      // Each `write` ends with \n.
      for (const line of text.split('\n').filter((s) => s.length > 0)) captured.push(line);
      return true;
    });
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  it('emits one JSON record per lifecycle event', () => {
    const results: EvalResult[] = [
      makeResult({ id: 'r/a', status: 'pass' }),
      makeResult({ id: 'r/b', status: 'fail', expected: 1, actual: 2 }),
    ];
    JsonReporter.onStart({ total: results.length });
    for (const r of results) JsonReporter.onResult(r);
    JsonReporter.onSummary(makeSummary(results));

    const parsed = captured.map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(parsed.length).toBe(4);
    expect(parsed[0]?.['type']).toBe('start');
    expect(parsed[0]?.['total']).toBe(2);
    expect(parsed[1]?.['type']).toBe('result');
    expect(parsed[1]?.['id']).toBe('r/a');
    expect(parsed[3]?.['type']).toBe('summary');
    expect(parsed[3]?.['total']).toBe(2);
    // Summary record does NOT include the per-result array (already streamed).
    expect(parsed[3]?.['results']).toBeUndefined();
  });
});
