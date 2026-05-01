// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
import { describe, expect, it } from 'vitest';
import { PolicySchema } from '../src/policy.js';

describe('PolicySchema', () => {
  it('parses a valid policy descriptor', () => {
    const p = {
      id: 'data_access_within_grant',
      description: 'Every data source must be inside the user-granted scope.',
      applies_to: 'manifest',
      severity: 'error',
    };
    expect(() => PolicySchema.parse(p)).not.toThrow();
  });

  it('rejects unknown applies_to', () => {
    const bad = {
      id: 'broken',
      description: 'broken',
      applies_to: 'sometimes',
      severity: 'error',
    };
    const result = PolicySchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});
