// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { defineEval } from '../../src/define.js';

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
