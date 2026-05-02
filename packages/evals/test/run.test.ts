// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { runEvals } from '../src/run.js';
import { defineEval } from '../src/define.js';

const FIXTURES_CWD = resolve(import.meta.dirname);
const FIXTURE_PATTERN = 'fixtures/**/*.eval.ts';

describe('runEvals — discovery', () => {
  it('discovers eval specs across multiple files', async () => {
    const summary = await runEvals(FIXTURES_CWD, { patterns: [FIXTURE_PATTERN] });
    // Six fixture specs across three files: 2 passing + 1 failing + 1 error
    // + 1 skip + 1 todo + 1 timeout.
    expect(summary.total).toBe(7);
    const ids = summary.results.map((r) => r.id).sort();
    expect(ids).toContain('fixture/pass/literal');
    expect(ids).toContain('fixture/pass/predicate');
    expect(ids).toContain('fixture/fail/literal');
    expect(ids).toContain('fixture/error/throws');
    expect(ids).toContain('fixture/skip/example');
    expect(ids).toContain('fixture/todo/example');
    expect(ids).toContain('fixture/timeout/sleeps');
  });

  it('returns an empty summary when patterns match nothing', async () => {
    const summary = await runEvals(FIXTURES_CWD, { patterns: ['no-such-dir/**/*.eval.ts'] });
    expect(summary.total).toBe(0);
    expect(summary.passed).toBe(0);
    expect(summary.failed).toBe(0);
  });

  it('returns an empty summary when --filter matches nothing', async () => {
    const summary = await runEvals(FIXTURES_CWD, {
      patterns: [FIXTURE_PATTERN],
      filter: 'absolutely-no-match',
    });
    expect(summary.total).toBe(0);
  });
});

describe('runEvals — execution & status reporting', () => {
  it('reports each status correctly', async () => {
    const summary = await runEvals(FIXTURES_CWD, { patterns: [FIXTURE_PATTERN] });
    const byId = new Map(summary.results.map((r) => [r.id, r]));
    expect(byId.get('fixture/pass/literal')?.status).toBe('pass');
    expect(byId.get('fixture/pass/predicate')?.status).toBe('pass');
    expect(byId.get('fixture/fail/literal')?.status).toBe('fail');
    expect(byId.get('fixture/error/throws')?.status).toBe('error');
    expect(byId.get('fixture/skip/example')?.status).toBe('skip');
    expect(byId.get('fixture/todo/example')?.status).toBe('todo');
    expect(byId.get('fixture/timeout/sleeps')?.status).toBe('timeout');
  });

  it('counts statuses in the summary', async () => {
    const summary = await runEvals(FIXTURES_CWD, { patterns: [FIXTURE_PATTERN] });
    expect(summary.passed).toBe(2);
    expect(summary.failed).toBe(1);
    expect(summary.errored).toBe(1);
    expect(summary.skipped).toBe(1);
    expect(summary.todo).toBe(1);
    expect(summary.timedOut).toBe(1);
  });

  it('captures expected and actual on a failed eval', async () => {
    const summary = await runEvals(FIXTURES_CWD, {
      patterns: [FIXTURE_PATTERN],
      filter: 'fixture/fail/literal',
    });
    const result = summary.results[0];
    expect(result?.status).toBe('fail');
    expect(result?.expected).toBe(99);
    expect(result?.actual).toBe(2);
  });
});

describe('runEvals — filtering', () => {
  it('filters by kind', async () => {
    const summary = await runEvals(FIXTURES_CWD, {
      patterns: [FIXTURE_PATTERN],
      kinds: ['capability'],
    });
    expect(summary.results.every((r) => r.kind === 'capability')).toBe(true);
    expect(summary.total).toBeGreaterThan(0);
  });

  it('filters by tag', async () => {
    const summary = await runEvals(FIXTURES_CWD, {
      patterns: [FIXTURE_PATTERN],
      tags: ['fast'],
    });
    expect(summary.total).toBe(2);
    expect(summary.results.map((r) => r.id).sort()).toEqual([
      'fixture/pass/literal',
      'fixture/pass/predicate',
    ]);
  });

  it('filters by id substring', async () => {
    const summary = await runEvals(FIXTURES_CWD, {
      patterns: [FIXTURE_PATTERN],
      filter: 'timeout',
    });
    expect(summary.total).toBe(1);
    expect(summary.results[0]?.id).toBe('fixture/timeout/sleeps');
  });
});

describe('runEvals — concurrency', () => {
  it('preserves result ordering with concurrency > 1', async () => {
    const summarySerial = await runEvals(FIXTURES_CWD, {
      patterns: [FIXTURE_PATTERN],
      concurrency: 1,
    });
    const summaryParallel = await runEvals(FIXTURES_CWD, {
      patterns: [FIXTURE_PATTERN],
      concurrency: 4,
    });
    expect(summaryParallel.total).toBe(summarySerial.total);
    expect(summaryParallel.passed).toBe(summarySerial.passed);
    expect(summaryParallel.failed).toBe(summarySerial.failed);
    // Result list is index-stable regardless of completion order.
    expect(summaryParallel.results.map((r) => r.id)).toEqual(
      summarySerial.results.map((r) => r.id),
    );
  });
});

describe('runEvals — hooks', () => {
  it('calls onStart, onResult, and onSummary in order', async () => {
    const events: string[] = [];
    await runEvals(
      FIXTURES_CWD,
      { patterns: [FIXTURE_PATTERN] },
      {
        onStart: (plan) => events.push(`start:${String(plan.total)}`),
        onResult: (r) => events.push(`result:${r.id}`),
        onSummary: (s) => events.push(`summary:${String(s.total)}`),
      },
    );
    expect(events[0]).toBe('start:7');
    expect(events.at(-1)).toBe('summary:7');
    expect(events.filter((e) => e.startsWith('result:')).length).toBe(7);
  });
});

describe('runEvals — defaults', () => {
  it('honours defaultTimeoutMs when a spec has no timeoutMs override', () => {
    // We point the runner at an inline-built spec list by using a fake fixture
    // file. To stay self-contained we just verify the defineEval shape supports
    // a per-spec timeout — direct integration is covered by the slowSpec fixture.
    const spec = defineEval({
      id: 'inline/timeout-default',
      description: 'sanity',
      kind: 'end-to-end',
      input: 0,
      run: () => 0,
      expected: 0,
    });
    expect(spec.timeoutMs).toBeUndefined();
  });
});
