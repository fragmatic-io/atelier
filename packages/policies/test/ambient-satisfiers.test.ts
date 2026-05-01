// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Tests for the prebuilt ambient policy satisfier declarations and the
 * `ambientCovers()` helper. The policies that consult these (`rate_limited_*`,
 * `reversibility_*`) have their own integration coverage; this file exercises
 * the helper module in isolation.
 */

import { describe, expect, it } from 'vitest';
import {
  ambientCovers,
  rateLimitChipSatisfier,
  undoToastSatisfier,
  RATE_LIMIT_CHIP_AMBIENT_SATISFIER,
  UNDO_TOAST_AMBIENT_SATISFIER,
} from '../src/baseline/ambient-satisfiers.ts';

describe('ambientCovers', () => {
  it('returns false on empty / undefined satisfier lists', () => {
    expect(ambientCovers(undefined, 'reversibility_surfaced', 'cap.x')).toBe(false);
    expect(ambientCovers([], 'reversibility_surfaced', 'cap.x')).toBe(false);
  });

  it('returns true when satisfies: "all" covers any capability for the named policy', () => {
    expect(
      ambientCovers([UNDO_TOAST_AMBIENT_SATISFIER], 'reversibility_surfaced', 'thread.archive'),
    ).toBe(true);
    expect(
      ambientCovers([UNDO_TOAST_AMBIENT_SATISFIER], 'reversibility_surfaced', 'task.complete'),
    ).toBe(true);
  });

  it('returns false when the policy id does not match', () => {
    expect(
      ambientCovers(
        [UNDO_TOAST_AMBIENT_SATISFIER],
        'rate_limited_actions_show_state',
        'thread.archive',
      ),
    ).toBe(false);
  });

  it('returns true only for capabilities listed in the array form', () => {
    const sat = rateLimitChipSatisfier(['github.issue.create', 'github.issue.close']);
    expect(ambientCovers([sat], 'rate_limited_actions_show_state', 'github.issue.create')).toBe(
      true,
    );
    expect(ambientCovers([sat], 'rate_limited_actions_show_state', 'github.issue.close')).toBe(
      true,
    );
    expect(ambientCovers([sat], 'rate_limited_actions_show_state', 'github.issue.archive')).toBe(
      false,
    );
  });

  it('combines multiple satisfiers — first match wins', () => {
    const list = [
      // Only covers a single rate-limited capability.
      rateLimitChipSatisfier(['cap.a']),
      // Covers everything else for the same policy.
      RATE_LIMIT_CHIP_AMBIENT_SATISFIER,
    ];
    expect(ambientCovers(list, 'rate_limited_actions_show_state', 'cap.a')).toBe(true);
    expect(ambientCovers(list, 'rate_limited_actions_show_state', 'cap.x')).toBe(true);
  });
});

describe('factory helpers', () => {
  it('rateLimitChipSatisfier produces a policy-id and per-capability list', () => {
    const sat = rateLimitChipSatisfier(['cap.a', 'cap.b']);
    expect(sat.policyId).toBe('rate_limited_actions_show_state');
    expect(sat.satisfies).toEqual([{ capabilityId: 'cap.a' }, { capabilityId: 'cap.b' }]);
  });

  it('undoToastSatisfier produces a policy-id and per-capability list', () => {
    const sat = undoToastSatisfier(['cap.x']);
    expect(sat.policyId).toBe('reversibility_surfaced');
    expect(sat.satisfies).toEqual([{ capabilityId: 'cap.x' }]);
  });

  it('prebuilt constants use the "all" shape', () => {
    expect(UNDO_TOAST_AMBIENT_SATISFIER.satisfies).toBe('all');
    expect(RATE_LIMIT_CHIP_AMBIENT_SATISFIER.satisfies).toBe('all');
  });
});
