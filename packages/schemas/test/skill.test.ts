// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
import { describe, expect, it } from 'vitest';
import { SkillSchema } from '../src/skill.js';

describe('SkillSchema', () => {
  it('parses the docs/artifacts.md §Skill example (email-triage)', () => {
    const frontmatter = {
      name: 'email-triage',
      version: '1.4.0',
      description: 'Categorize an email thread by urgency and required action',
      capabilities_used: [
        'thread.read',
        'thread.classify',
        'task.create',
        'calendar.suggest_event',
      ],
      when_to_use:
        'When the user opens a thread that contains explicit asks, deadlines, or commitments. Not for newsletters or notifications.',
      when_not_to_use:
        'Marketing emails. Auth codes. Receipts. System notifications. Anything from no-reply addresses.',
      example_flow:
        '1. Read thread content + sender context\n2. Classify\n3. Propose tasks or events',
      known_failure_modes: [
        'Confusing FYI emails for action items',
        'Misreading scheduling polls as confirmed events',
        'Treating thread quotes as new asks',
      ],
    };

    const parsed = SkillSchema.parse(frontmatter);
    expect(parsed.name).toBe('email-triage');
    expect(parsed.capabilities_used).toHaveLength(4);
  });

  it('rejects empty when_to_use', () => {
    const bad = {
      name: 'broken-skill',
      version: '0.1.0',
      description: 'test',
      capabilities_used: [],
      when_to_use: '',
      when_not_to_use: 'whatever',
      example_flow: 'whatever',
      known_failure_modes: [],
    };
    const result = SkillSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('when_to_use'))).toBe(true);
    }
  });
});
