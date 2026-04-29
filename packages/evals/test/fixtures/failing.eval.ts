// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
import { defineEval } from '../../src/define.ts';

export default defineEval({
  id: 'fixture/fail/literal',
  description: 'Actual differs from expected — should fail.',
  kind: 'skill',
  input: { x: 1 },
  run: ({ x }) => x + 1,
  expected: 99,
});

export const errorSpec = defineEval({
  id: 'fixture/error/throws',
  description: 'run() throws — should record an error result.',
  kind: 'skill',
  input: null,
  run: () => {
    throw new Error('boom');
  },
  expected: 'never',
});
