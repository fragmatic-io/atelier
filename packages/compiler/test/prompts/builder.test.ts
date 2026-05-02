// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for `buildPromptContext`. The builder is pure — given a
 * `CompileInput`, it returns the user-message text that's appended to the
 * cached system prompt. These tests assert presence/absence of each section
 * and confirm the diff-mode flag.
 */

import { describe, expect, it } from 'vitest';
import { buildPromptContext } from '../../src/prompts/builder.js';
import {
  fixtureBrandKit,
  fixtureCompileInput,
  fixtureIntent,
  fixtureManifest,
  fixtureSkill,
  fixtureTrigger,
} from '../_fixtures.js';

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

  it('emits a personalisation directives section when intent has global_preferences', () => {
    const intent = fixtureIntent();
    intent.global_preferences = {
      density: 'compact',
      color_mode: 'dark',
      motion_preference: 'reduced',
      automation_trust: 'strict',
      modal_tolerance: 'low',
    };
    const ctx = buildPromptContext(fixtureCompileInput({ intent }));
    expect(ctx.user).toContain('## Personalisation directives');
    expect(ctx.user).toContain('Active preferences:');
    expect(ctx.user).toContain('density=');
    // Density rule for compact.
    expect(ctx.user).toContain("density === 'compact'");
    expect(ctx.user).toContain("props.density: 'compact'");
    // Strict trust → promote inline confirmations to modal.
    expect(ctx.user).toContain('promoted to');
    expect(ctx.user).toContain("'modal'");
    // Reduced motion rule.
    expect(ctx.user).toContain("motion_preference === 'reduced'");
    // Color mode rule.
    expect(ctx.user).toContain("color_mode === 'dark'");
    // Modal tolerance rule.
    expect(ctx.user).toContain("modal_tolerance === 'low'");
  });

  it('omits the directives section when intent.global_preferences is empty', () => {
    const intent = fixtureIntent();
    intent.global_preferences = {};
    const ctx = buildPromptContext(fixtureCompileInput({ intent }));
    expect(ctx.user).not.toContain('## Personalisation directives');
  });

  it('passes through unknown preference keys as soft hints', () => {
    const intent = fixtureIntent();
    intent.global_preferences = {
      density: 'comfortable',
      primary_workflow: 'task_queue',
    };
    const ctx = buildPromptContext(fixtureCompileInput({ intent }));
    expect(ctx.user).toContain('Additional user-declared preferences');
    expect(ctx.user).toContain('primary_workflow');
  });

  it('emits a hierarchy directives section when a capability has salience_default and intent has priority_rules', () => {
    const intent = fixtureIntent();
    intent.priority_rules = [
      { domain: 'github', signal: 'urgency', weight: 0.5 },
      { domain: '*', signal: 'starred' },
    ];
    const ctx = buildPromptContext(
      fixtureCompileInput({
        intent,
        capabilities: {
          'github.issue.list': {
            id: 'github.issue.list',
            kind: 'data',
            version: '1.0.0',
            input: {},
            output: {},
            side_effects: ['reads:github_issues'],
            permissions: ['github:read'],
            confirmation: 'none',
            reversible: true,
            salience_default: 'urgency * recency + assigned_to_me * 2',
          } as never,
        },
      }),
    );
    expect(ctx.user).toContain('## Hierarchy directives');
    expect(ctx.user).toContain('github.issue.list');
    expect(ctx.user).toContain('urgency * recency + assigned_to_me * 2');
    // priority_rules are listed verbatim with the user's weight.
    expect(ctx.user).toContain('domain=`github`');
    expect(ctx.user).toContain('signal=`urgency`');
    expect(ctx.user).toContain('weight=0.5');
    // The cap-N=7 rule is the load-bearing instruction the LLM must read.
    expect(ctx.user).toContain('more than 7 items');
    expect(ctx.user).toContain('top 1');
  });

  it('omits the hierarchy directives section when no capability has salience_default and no priority_rules are set', () => {
    const ctx = buildPromptContext(fixtureCompileInput());
    expect(ctx.user).not.toContain('## Hierarchy directives');
  });

  it('emits the hierarchy section for priority_rules alone, even without salience_default', () => {
    const intent = fixtureIntent();
    intent.priority_rules = [{ domain: 'email', signal: 'unread', weight: 1 }];
    const ctx = buildPromptContext(fixtureCompileInput({ intent }));
    expect(ctx.user).toContain('## Hierarchy directives');
    expect(ctx.user).toContain('No capability declares a `salience_default`');
    expect(ctx.user).toContain('signal=`unread`');
  });

  it('emits a REFINEMENT MODE block when priorDraft + violations are supplied (Wave C / Phase C-1)', () => {
    const priorDraft = fixtureManifest({ manifest_id: 'm_priordft0' });
    const ctx = buildPromptContext(
      fixtureCompileInput({
        priorDraft,
        violations: ['Stack requires at least 1 child; got 0', 'Missing empty_state slot'],
      }),
    );
    expect(ctx.refinement_mode).toBe(true);
    expect(ctx.user).toContain('REFINEMENT MODE');
    // The exact violations are listed verbatim so the LLM patches each.
    expect(ctx.user).toContain('Stack requires at least 1 child');
    expect(ctx.user).toContain('Missing empty_state slot');
    // The previous draft is rendered as JSON for direct inspection.
    expect(ctx.user).toContain('m_priordft0');
    // The "Your task" line is refinement-aware.
    expect(ctx.user).toContain('previous attempt');
    expect(ctx.user).toContain('failed validation');
  });

  it('refinement_mode is false when priorDraft is set but violations is empty', () => {
    // Defensive: the wrapper might still call us with an empty violations
    // array if a buggy validate hook returned `ok: false` with no reasons.
    // We degrade gracefully — no REFINEMENT MODE block emitted.
    const ctx = buildPromptContext(
      fixtureCompileInput({
        priorDraft: fixtureManifest(),
        violations: [],
      }),
    );
    expect(ctx.refinement_mode).toBe(false);
    expect(ctx.user).not.toContain('REFINEMENT MODE');
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
