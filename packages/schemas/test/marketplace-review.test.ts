// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for V-6.d review / curation primitives — `ReviewState` enum and
 * `ReviewRecord` schema round-trip.
 */
import { describe, expect, it } from 'vitest';

import {
  ReviewRecordSchema,
  ReviewStateSchema,
  type ReviewRecord,
} from '../src/marketplace-review.js';

describe('ReviewStateSchema', () => {
  it('accepts the four canonical states', () => {
    for (const state of ['pending', 'approved', 'rejected', 'flagged'] as const) {
      expect(ReviewStateSchema.safeParse(state).success).toBe(true);
    }
  });

  it('rejects unknown states', () => {
    expect(ReviewStateSchema.safeParse('approved-pending').success).toBe(false);
    expect(ReviewStateSchema.safeParse('').success).toBe(false);
    expect(ReviewStateSchema.safeParse(null).success).toBe(false);
  });
});

describe('ReviewRecordSchema', () => {
  const baseRecord: ReviewRecord = {
    address: {
      scheme: 'atelier',
      author: 'acme',
      persona: 'email-triage',
      version: '1.0.0',
    },
    state: 'pending',
    submitted_at: '2026-05-02T12:00:00.000Z',
  };

  it('accepts a minimal pending record (no reviewer / notes / reviewed_at)', () => {
    const out = ReviewRecordSchema.safeParse(baseRecord);
    expect(out.success).toBe(true);
  });

  it('accepts a fully-populated approved record', () => {
    const full: ReviewRecord = {
      ...baseRecord,
      state: 'approved',
      reviewed_at: '2026-05-03T08:30:00.000Z',
      reviewer_id: 'maintainer-a',
      notes: 'LGTM after security pass.',
    };
    const out = ReviewRecordSchema.safeParse(full);
    expect(out.success).toBe(true);
    if (out.success) {
      // Round-trip: parsed value matches input.
      expect(out.data).toEqual(full);
    }
  });

  it('rejects a record with an invalid address', () => {
    const bad = { ...baseRecord, address: { ...baseRecord.address, scheme: 'http' } };
    expect(ReviewRecordSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a record with an unknown state', () => {
    const bad = { ...baseRecord, state: 'banned' };
    expect(ReviewRecordSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a record whose timestamps are not ISO-8601', () => {
    const bad = { ...baseRecord, submitted_at: 'yesterday' };
    expect(ReviewRecordSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a record whose reviewed_at is not ISO-8601', () => {
    const bad = { ...baseRecord, reviewed_at: 'now' };
    expect(ReviewRecordSchema.safeParse(bad).success).toBe(false);
  });
});
