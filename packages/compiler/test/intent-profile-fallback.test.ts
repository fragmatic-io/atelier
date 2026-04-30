// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Tests for `FallbackIntentProfileCompiler` keyword heuristics.
 *
 * The fallback is a deterministic pure function — these tests are the
 * spec of every keyword path. Each assertion pins one behavior; the tests
 * intentionally read like a translation table.
 */

import { describe, expect, it } from 'vitest';
import type { Capability } from '@cir/schemas';
import { FallbackIntentProfileCompiler } from '../src/intent-profile-compiler.ts';

function compile(description: string) {
  const c = new FallbackIntentProfileCompiler({
    now: () => new Date('2026-04-30T12:00:00Z'),
  });
  return c.compileIntentProfile({
    description,
    user_id: 'demo-user',
    capabilities: [] as ReadonlyArray<Capability>,
  });
}

describe('FallbackIntentProfileCompiler heuristics', () => {
  it('empty description returns a minimal valid profile', async () => {
    const r = await compile('');
    expect(r.profile.user_id).toBe('demo-user');
    expect(r.profile.profile_version).toBe(1);
    expect(r.profile.global_preferences['density']).toBe('comfortable');
    expect(r.profile.lenses).toEqual({});
    expect(r.profile.rules).toEqual([]);
    expect(r.token_cost).toBe(0);
  });

  it('whitespace-only description returns a minimal valid profile', async () => {
    const r = await compile('   \n\t  ');
    expect(r.profile.lenses).toEqual({});
    expect(r.profile.rules).toEqual([]);
  });

  it('mention of "github" sets the github reviewer lens', async () => {
    const r = await compile('I review GitHub PRs daily.');
    expect(r.profile.lenses['github']).toBe('reviewer');
  });

  it('mention of "code review" sets the github reviewer lens', async () => {
    const r = await compile('Most of my day is code review.');
    expect(r.profile.lenses['github']).toBe('reviewer');
  });

  it('mention of "morning" adds a global "morning items first" rule', async () => {
    const r = await compile('I work mostly in the morning.');
    const rule = r.profile.rules.find((x) => x.scope === '*');
    expect(rule).toBeDefined();
    expect(rule?.rule).toMatch(/morning/i);
  });

  it('mention of "shopping" sets the shopping browser lens', async () => {
    const r = await compile('I shop online a lot.');
    expect(r.profile.lenses['shopping']).toBe('browser');
  });

  it('mention of "products" sets the shopping browser lens', async () => {
    const r = await compile('I research products before buying.');
    expect(r.profile.lenses['shopping']).toBe('browser');
  });

  it('mention of "compact" sets density=compact', async () => {
    const r = await compile('Give me a compact UI.');
    expect(r.profile.global_preferences['density']).toBe('compact');
  });

  it('mention of "dense" sets density=compact', async () => {
    const r = await compile('I prefer dense layouts.');
    expect(r.profile.global_preferences['density']).toBe('compact');
  });

  it('mention of "dark" sets color_mode=dark', async () => {
    const r = await compile('Dark mode please.');
    expect(r.profile.global_preferences['color_mode']).toBe('dark');
  });

  it('mention of "never" sets automation_trust=strict and adds locked rule', async () => {
    const r = await compile('Never automate things on my behalf.');
    expect(r.profile.global_preferences['automation_trust']).toBe('strict');
    const locked = r.profile.rules.find((x) => x.locked === true);
    expect(locked).toBeDefined();
    expect(locked?.rule).toMatch(/confirm/i);
  });

  it('mention of "always confirm" sets automation_trust=strict', async () => {
    const r = await compile('Always confirm before sending.');
    expect(r.profile.global_preferences['automation_trust']).toBe('strict');
  });

  it('combined description: github + morning + compact + dark + wary of automation', async () => {
    const r = await compile(
      "I review GitHub PRs in the morning, I'm a Linux developer, I prefer compact UIs and dark mode, I'm wary of automation.",
    );
    expect(r.profile.lenses['github']).toBe('reviewer');
    expect(r.profile.global_preferences['density']).toBe('compact');
    expect(r.profile.global_preferences['color_mode']).toBe('dark');
    expect(r.profile.global_preferences['automation_trust']).toBe('strict');
    // morning rule + locked-confirm rule.
    expect(r.profile.rules.length).toBeGreaterThanOrEqual(2);
  });

  it('reports compiler_model = configured id', async () => {
    const c = new FallbackIntentProfileCompiler({ id: 'custom-fallback' });
    const r = await c.compileIntentProfile({
      description: 'test',
      user_id: 'u',
      capabilities: [] as ReadonlyArray<Capability>,
    });
    expect(r.compiler_model).toBe('custom-fallback');
    expect(c.id).toBe('custom-fallback');
  });

  it('updated_at is a valid ISO datetime', async () => {
    const r = await compile('hello');
    expect(() => new Date(r.profile.updated_at).toISOString()).not.toThrow();
  });
});
