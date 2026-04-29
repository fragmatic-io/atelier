// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
import { describe, expect, it } from 'vitest';
import { AuditEventSchema } from '../src/audit.ts';

describe('AuditEventSchema', () => {
  it('parses a manifest.compiled event', () => {
    const event = {
      event_id: 'evt_abc123',
      timestamp: '2026-04-29T12:00:00Z',
      user_id: 'vid',
      app_id: 'mail.example.com',
      type: 'manifest.compiled',
      actor: 'system',
      before_state_hash: 'sha256:0000',
      after_state_hash: 'sha256:abcd',
      trigger_chain: ['intent.lens_switched'],
      token_cost: 2400,
      policy_evaluations: [{ policy_id: 'data_access_within_grant', passed: true }],
      manifest_id: 'm_8f3a2b1c',
    };
    expect(() => AuditEventSchema.parse(event)).not.toThrow();
  });

  it('rejects an event with an unknown type', () => {
    const bad = {
      event_id: 'evt_xyz',
      timestamp: '2026-04-29T12:00:00Z',
      user_id: 'vid',
      app_id: 'app',
      type: 'cosmic.ray',
      actor: 'system',
      before_state_hash: 'h0',
      after_state_hash: 'h1',
      trigger_chain: [],
      token_cost: 0,
      policy_evaluations: [],
    };
    const result = AuditEventSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});
