// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Tests for `buildPromptContext`. The builder is pure — given a
 * `CompileInput`, it returns the user-message text that's appended to the
 * cached system prompt. These tests assert presence/absence of each section
 * and confirm the diff-mode flag.
 */

import { describe, expect, it } from 'vitest';
import { buildPromptContext } from '../../src/prompts/builder.ts';
import {
  fixtureBrandKit,
  fixtureCompileInput,
  fixtureIntent,
  fixtureManifest,
  fixtureSkill,
  fixtureTrigger,
} from '../_fixtures.ts';

describe('buildPromptContext', () => {
  it('includes capabilities, components, and intent JSON when supplied', () => {
    const ctx = buildPromptContext(
      fixtureCompileInput({
        intent: fixtureIntent(),
      }),
    );
    expect(ctx.user).toContain('## Capabilities you may reference');
    expect(ctx.user).toContain('thread.archive');
    expect(ctx.user).toContain('## Components you may reference');
    expect(ctx.user).toContain('## Intent');
    expect(ctx.user).toContain('founder_inbox');
  });

  it('sets diff_mode=true when previousManifest is supplied and includes the previous manifest section', () => {
    const ctx = buildPromptContext(fixtureCompileInput({ previousManifest: fixtureManifest() }));
    expect(ctx.diff_mode).toBe(true);
    expect(ctx.user).toContain('## Previous manifest');
    expect(ctx.user).toContain('produce only the changes');
  });

  it('folds in brand kit when supplied; omits the section when not', () => {
    const withBk = buildPromptContext(fixtureCompileInput({ brandKit: fixtureBrandKit() }));
    expect(withBk.user).toContain('## Brand kit');
    expect(withBk.user).toContain('demo-brand');

    const withoutBk = buildPromptContext(fixtureCompileInput());
    expect(withoutBk.user).not.toContain('## Brand kit');
  });

  it('includes trigger context when supplied; otherwise marks the request as cold', () => {
    const withTrig = buildPromptContext(fixtureCompileInput({ trigger: fixtureTrigger() }));
    expect(withTrig.user).toContain('trigger: intent.lens_switched');
    expect(withTrig.user).toContain('trigger_payload');

    const cold = buildPromptContext(fixtureCompileInput());
    expect(cold.user).toContain('trigger: cold');
  });

  it('compresses skills to high-signal fields only — no markdown body', () => {
    const skill = fixtureSkill();
    const ctx = buildPromptContext(fixtureCompileInput({ skills: { 'email-triage': skill } }));
    expect(ctx.user).toContain('## Skills');
    expect(ctx.user).toContain('when_to_use');
    expect(ctx.user).toContain('when_not_to_use');
    expect(ctx.user).toContain('known_failure_modes');
    // The full example_flow body and the skill name/version are intentionally
    // NOT included in the compressed skill projection.
    expect(ctx.user).not.toContain(skill.example_flow);
    // Within the Skills block, only high-signal keys appear — name/version are
    // omitted (capabilities ABOVE this block carry their own version, which is
    // why we don't grep for "version" globally).
    const skillsBlock = ctx.user.slice(ctx.user.indexOf('## Skills'));
    const componentsIdx = skillsBlock.indexOf('## Components');
    const onlySkills = componentsIdx >= 0 ? skillsBlock.slice(0, componentsIdx) : skillsBlock;
    expect(onlySkills).not.toContain('"version"');
    expect(onlySkills).not.toContain('"name"');
  });
});
