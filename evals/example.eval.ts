// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { defineEval } from '@atelier/evals';

export default defineEval({
  id: 'example/sanity',
  description: 'The harness can run an eval and pass.',
  kind: 'end-to-end',
  input: { x: 2 },
  run: ({ x }) => x + 2,
  expected: 4,
});
