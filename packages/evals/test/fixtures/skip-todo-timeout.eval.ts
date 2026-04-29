// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
import { defineEval } from '../../src/define.ts';

export const skipped = defineEval({
  id: 'fixture/skip/example',
  description: 'Skipped with a reason.',
  kind: 'component',
  input: 0,
  run: () => 0,
  expected: 0,
  skip: 'paused while we redesign the policy',
});

export const todoSpec = defineEval({
  id: 'fixture/todo/example',
  description: 'Marked todo until the implementation lands.',
  kind: 'component',
  input: 0,
  run: () => 0,
  expected: 0,
  todo: 'awaiting Phase 5 component runtime',
});

export const slowSpec = defineEval({
  id: 'fixture/timeout/sleeps',
  description: 'run() takes 50ms with a 10ms timeout — should time out.',
  kind: 'end-to-end',
  input: 50,
  timeoutMs: 10,
  run: (ms: number) => new Promise<number>((resolve) => setTimeout(() => resolve(ms), ms)),
  expected: 50,
});
