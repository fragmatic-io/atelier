// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Vitest unit tests for the vault grant-flow eval.
 *
 * The eval lives in `vault-grant-flow.eval.ts` and is driven by the
 * `atelier-evals` runner. This file pins the predicate + run() function under
 * vitest so a regression breaks CI immediately rather than waiting for the
 * eval pass.
 */

import { describe, expect, it } from 'vitest';
import vaultEval from './vault-grant-flow.eval.js';

describe('vault-grant-flow eval', () => {
  it('is registered as an end-to-end eval', () => {
    expect(vaultEval.id).toBe('end-to-end/vault-grant-flow');
    expect(vaultEval.kind).toBe('end-to-end');
  });

  it('runs the full happy path and the predicate accepts it', async () => {
    const outcome = await vaultEval.run(vaultEval.input);
    const predicate = vaultEval.expected as (out: unknown) => boolean;
    expect(predicate(outcome)).toBe(true);
  });

  it('predicate rejects a partial outcome', () => {
    const predicate = vaultEval.expected as (out: unknown) => boolean;
    expect(
      predicate({
        steps_passed: 3,
        revocations: 0,
        unauthorized_after_revoke: false,
        scope_violation_caught: false,
        read_lens_keys: [],
      }),
    ).toBe(false);
  });

  it('predicate rejects when the read leaked an extra lens domain', () => {
    const predicate = vaultEval.expected as (out: unknown) => boolean;
    expect(
      predicate({
        steps_passed: 6,
        revocations: 1,
        unauthorized_after_revoke: true,
        scope_violation_caught: true,
        read_lens_keys: ['today', 'thread'],
      }),
    ).toBe(false);
  });
});
