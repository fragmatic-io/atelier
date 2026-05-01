// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
import { describe, expect, it } from 'vitest';
import { TriggerSchema } from '../src/trigger.js';

describe('TriggerSchema (discriminated union)', () => {
  it('parses a capability.changed trigger', () => {
    const trigger = {
      type: 'capability.changed',
      app_id: 'mail.example.com',
      capability_id: 'thread.archive',
      old_v: '2.0.0',
      new_v: '2.1.0',
    };
    expect(() => TriggerSchema.parse(trigger)).not.toThrow();
  });

  it('parses an intent.lens_switched trigger', () => {
    const trigger = {
      type: 'intent.lens_switched',
      user_id: 'vid',
      app: 'mail.example.com',
      lens: 'founder_inbox',
    };
    expect(() => TriggerSchema.parse(trigger)).not.toThrow();
  });

  it('parses a turn.classified chat trigger', () => {
    const trigger = {
      type: 'turn.classified',
      conversation_id: 'conv_abc',
      turn: 5,
      classification: 'continue',
    };
    expect(() => TriggerSchema.parse(trigger)).not.toThrow();
  });

  it('parses a behavior.workaround_detected trigger', () => {
    const trigger = {
      type: 'behavior.workaround_detected',
      user_id: 'vid',
      app_id: 'mail.example.com',
      pattern: 'thread_to_task_with_extracted_date',
      occurrences: 4,
      proposed_capability: 'task.create_from_thread',
      proposed_recompile: ['/today', '/inbox'],
    };
    expect(() => TriggerSchema.parse(trigger)).not.toThrow();
  });

  it('rejects an unknown trigger type', () => {
    const bad = { type: 'unicorn.appeared', user_id: 'vid' };
    const result = TriggerSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects a turn.classified with invalid classification', () => {
    const bad = {
      type: 'turn.classified',
      conversation_id: 'conv_abc',
      turn: 5,
      classification: 'maybe',
    };
    const result = TriggerSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});
