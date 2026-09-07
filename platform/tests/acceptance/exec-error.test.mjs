// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import test from 'node:test';
import assert from 'node:assert/strict';
import { describeExecError } from '../../scripts/acceptance/exec-error.mjs';

test('acceptance command errors retain bounded timeout diagnostics', () => {
  const diagnostic = describeExecError(
    {
      message: 'offline install timed out',
      code: 'ETIMEDOUT',
      signal: 'SIGTERM',
      killed: true,
      stdout: 'a'.repeat(20),
      stderr: 'cache unavailable',
    },
    10,
  );
  assert.deepEqual(diagnostic, {
    message: 'offline in',
    code: 'ETIMEDOUT',
    signal: 'SIGTERM',
    killed: true,
    timedOut: true,
    stdout: 'aaaaaaaaaa',
    stderr: 'cache unav',
  });
});
