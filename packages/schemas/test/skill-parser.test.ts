// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { parseSkillMarkdown } from '../src/skill-parser.ts';

describe('parseSkillMarkdown', () => {
  it('parses valid markdown with full frontmatter', () => {
    const source = `---
name: email-triage
version: 1.4.0
description: Categorize an email thread by urgency and required action
capabilities_used:
  - thread.read
  - thread.classify
when_to_use: When the user opens a thread that contains explicit asks.
when_not_to_use: Marketing emails. Auth codes. Receipts.
example_flow: |
  1. Read thread content
  2. Classify
  3. Propose tasks
known_failure_modes:
  - Confusing FYI emails for action items
---

# Email triage

This is the body that the compiler reads.

It can have multiple paragraphs.
`;

    const { skill, body } = parseSkillMarkdown(source);
    expect(skill.name).toBe('email-triage');
    expect(skill.version).toBe('1.4.0');
    expect(skill.capabilities_used).toEqual(['thread.read', 'thread.classify']);
    expect(skill.known_failure_modes).toHaveLength(1);
    expect(body.startsWith('# Email triage')).toBe(true);
    expect(body.endsWith('paragraphs.')).toBe(true);
  });

  it('throws ZodError when required frontmatter fields are missing', () => {
    const source = `---
name: incomplete-skill
version: 0.1.0
description: missing several required fields
---

Body only.
`;

    let caught: unknown;
    try {
      parseSkillMarkdown(source);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ZodError);
    if (caught instanceof ZodError) {
      const missing = new Set(caught.issues.map((i) => i.path.join('.')));
      expect(missing.has('capabilities_used')).toBe(true);
      expect(missing.has('when_to_use')).toBe(true);
      expect(missing.has('when_not_to_use')).toBe(true);
      expect(missing.has('example_flow')).toBe(true);
      expect(missing.has('known_failure_modes')).toBe(true);
    }
  });

  it('throws (via Zod) when there is no frontmatter at all', () => {
    const source = `# Just markdown

No frontmatter block here.
`;

    let caught: unknown;
    try {
      parseSkillMarkdown(source);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ZodError);
  });
});
