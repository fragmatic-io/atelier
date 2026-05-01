// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
import { defineEval } from '../../src/define.js';

export default defineEval({
  id: 'fixture/pass/literal',
  description: 'Literal expected matches actual via deep-equal.',
  kind: 'capability',
  tags: ['fast'],
  input: { x: 2 },
  run: ({ x }) => ({ doubled: x * 2 }),
  expected: { doubled: 4 },
});

export const predicateSpec = defineEval({
  id: 'fixture/pass/predicate',
  description: 'Predicate-style expected works.',
  kind: 'manifest',
  tags: ['fast'],
  input: { items: [1, 2, 3] },
  run: ({ items }) => items.reduce((a: number, b: number) => a + b, 0),
  expected: (output: unknown) => typeof output === 'number' && output === 6,
});
