// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { describe, expect, it } from 'vitest';
import {
  ConversationOverlaySchema,
  GlobalPreferencesSchema,
  IntentProfileSchema,
} from '../src/intent.js';

describe('IntentProfileSchema', () => {
  it('parses the full docs/artifacts.md §Intent profile example', () => {
    const example = {
      user_id: 'vid',
      profile_version: 47,
      updated_at: '2026-04-29T12:00:00Z',
      global_preferences: {
        density: 'compact',
        color_mode: 'system',
        motion_preference: 'reduced',
        modal_tolerance: 'low',
        automation_trust: 'strict',
        primary_workflow: 'task_queue',
        decision_separation: true,
      },
      lenses: {
        email: 'founder_inbox',
        calendar: 'deep_work_blocks',
        github: 'review_queue',
        linear: 'this_week_only',
      },
      rules: [
        {
          scope: 'email',
          rule: 'Investor and customer emails surface above newsletters',
          version: 12,
        },
        {
          scope: '*',
          rule: 'Never auto-send. Drafts only. Always confirm.',
          version: 1,
          locked: true,
        },
      ],
      vocabulary: {
        'the team': ['alice', 'bob', 'charlie'],
        investors: ['@gp1.vc', '@gp2.vc'],
        'deep work': '9am-12pm weekdays',
      },
      cross_app_workflows: [
        {
          name: 'weekly_review',
          trigger: 'friday 4pm',
          uses: ['linear.completed', 'calendar.past_week', 'email.starred'],
        },
      ],
    };

    const parsed = IntentProfileSchema.parse(example);
    expect(parsed.user_id).toBe('vid');
    expect(parsed.rules).toHaveLength(2);
    expect(parsed.rules[1]?.locked).toBe(true);
    expect(parsed.cross_app_workflows?.[0]?.name).toBe('weekly_review');
  });

  it('rejects a profile_version that is negative', () => {
    const bad = {
      user_id: 'vid',
      profile_version: -1,
      updated_at: '2026-04-29T12:00:00Z',
      global_preferences: {},
      lenses: {},
      rules: [],
      vocabulary: {},
    };
    const result = IntentProfileSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('accepts a profile with priority_rules entries (well-known signals)', () => {
    const profile = {
      user_id: 'vid',
      profile_version: 1,
      updated_at: '2026-04-29T12:00:00Z',
      global_preferences: {},
      lenses: {},
      rules: [],
      vocabulary: {},
      priority_rules: [
        { domain: 'github', signal: 'urgency', weight: 0.5 },
        { domain: '*', signal: 'starred' },
        { domain: 'email', signal: 'unread', weight: 1 },
      ],
    };
    const parsed = IntentProfileSchema.parse(profile);
    expect(parsed.priority_rules).toHaveLength(3);
    expect(parsed.priority_rules?.[0]?.weight).toBe(0.5);
    expect(parsed.priority_rules?.[1]?.weight).toBeUndefined();
  });

  it('treats priority_rules as optional (existing profiles still validate)', () => {
    const profile = {
      user_id: 'vid',
      profile_version: 1,
      updated_at: '2026-04-29T12:00:00Z',
      global_preferences: {},
      lenses: {},
      rules: [],
      vocabulary: {},
    };
    const parsed = IntentProfileSchema.parse(profile);
    expect(parsed.priority_rules).toBeUndefined();
  });

  it('rejects a priority_rule with an unknown signal', () => {
    const profile = {
      user_id: 'vid',
      profile_version: 1,
      updated_at: '2026-04-29T12:00:00Z',
      global_preferences: {},
      lenses: {},
      rules: [],
      vocabulary: {},
      priority_rules: [{ domain: 'github', signal: 'mood', weight: 0.5 }],
    };
    const result = IntentProfileSchema.safeParse(profile);
    expect(result.success).toBe(false);
  });

  it('rejects a priority_rule with a weight outside the 0–1 range', () => {
    const profile = {
      user_id: 'vid',
      profile_version: 1,
      updated_at: '2026-04-29T12:00:00Z',
      global_preferences: {},
      lenses: {},
      rules: [],
      vocabulary: {},
      priority_rules: [{ domain: 'github', signal: 'urgency', weight: 1.5 }],
    };
    const result = IntentProfileSchema.safeParse(profile);
    expect(result.success).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Wave 7 / P-9 — priority_overrides (categorical)
  // ---------------------------------------------------------------------------

  it('accepts a profile with priority_overrides entries', () => {
    const profile = {
      user_id: 'vid',
      profile_version: 1,
      updated_at: '2026-05-02T12:00:00Z',
      global_preferences: {},
      lenses: {},
      rules: [],
      vocabulary: {},
      priority_overrides: [
        { capability_pattern: 'github.pr.*', salience: 'high', reason: 'onboarding' },
        { capability_pattern: '*.notify', salience: 'high' },
        { capability_pattern: 'log.**', salience: 'low' },
      ],
    };
    const parsed = IntentProfileSchema.parse(profile);
    expect(parsed.priority_overrides).toHaveLength(3);
    expect(parsed.priority_overrides?.[0]?.salience).toBe('high');
    expect(parsed.priority_overrides?.[0]?.reason).toBe('onboarding');
    expect(parsed.priority_overrides?.[1]?.reason).toBeUndefined();
  });

  it('treats priority_overrides as optional', () => {
    const profile = {
      user_id: 'vid',
      profile_version: 1,
      updated_at: '2026-05-02T12:00:00Z',
      global_preferences: {},
      lenses: {},
      rules: [],
      vocabulary: {},
    };
    const parsed = IntentProfileSchema.parse(profile);
    expect(parsed.priority_overrides).toBeUndefined();
  });

  it('rejects a priority_override with an unknown salience level', () => {
    const profile = {
      user_id: 'vid',
      profile_version: 1,
      updated_at: '2026-05-02T12:00:00Z',
      global_preferences: {},
      lenses: {},
      rules: [],
      vocabulary: {},
      priority_overrides: [{ capability_pattern: 'github.**', salience: 'urgent' }],
    };
    const result = IntentProfileSchema.safeParse(profile);
    expect(result.success).toBe(false);
  });

  it('rejects a priority_override with an empty capability_pattern', () => {
    const profile = {
      user_id: 'vid',
      profile_version: 1,
      updated_at: '2026-05-02T12:00:00Z',
      global_preferences: {},
      lenses: {},
      rules: [],
      vocabulary: {},
      priority_overrides: [{ capability_pattern: '', salience: 'high' }],
    };
    const result = IntentProfileSchema.safeParse(profile);
    expect(result.success).toBe(false);
  });
});

describe('GlobalPreferencesSchema', () => {
  it('parses the canonical personalisation signals', () => {
    const parsed = GlobalPreferencesSchema.parse({
      density: 'compact',
      color_mode: 'dark',
      motion_preference: 'reduced',
      automation_trust: 'strict',
      modal_tolerance: 'low',
    });
    expect(parsed.density).toBe('compact');
    expect(parsed.color_mode).toBe('dark');
    expect(parsed.motion_preference).toBe('reduced');
    expect(parsed.automation_trust).toBe('strict');
    expect(parsed.modal_tolerance).toBe('low');
  });

  it('treats every well-known signal as optional', () => {
    expect(() => GlobalPreferencesSchema.parse({})).not.toThrow();
  });

  it('passes through unknown keys (apps may store extra preferences)', () => {
    const parsed = GlobalPreferencesSchema.parse({
      density: 'comfortable',
      primary_workflow: 'task_queue',
    });
    expect((parsed as Record<string, unknown>)['primary_workflow']).toBe('task_queue');
  });

  it('rejects an invalid enum value on a well-known key', () => {
    const result = GlobalPreferencesSchema.safeParse({ density: 'huge' });
    expect(result.success).toBe(false);
  });
});

describe('ConversationOverlaySchema', () => {
  it('parses the docs/chat/conversation-artifacts.md overlay example', () => {
    const overlay = {
      conversation_id: 'conv_abc',
      overrides: [
        { scope: 'scheduling', rule: 'afternoons only this week', set_at_turn: 3 },
        { scope: '*', rule: 'respond concisely', set_at_turn: 1 },
      ],
      context_summary:
        'User is planning a Tokyo trip; wants minimal options, prefers concise responses',
    };
    const parsed = ConversationOverlaySchema.parse(overlay);
    expect(parsed.overrides).toHaveLength(2);
  });
});
