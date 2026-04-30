// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
import { describe, expect, it } from 'vitest';
import { CapabilitySchema, KNOWN_SIDE_EFFECTS } from '../src/capability.ts';

describe('CapabilitySchema', () => {
  it('parses the docs/artifacts.md §Capability example (thread.archive)', () => {
    const example = {
      id: 'thread.archive',
      kind: 'action',
      version: '2.1.0',
      input: { thread_id: 'string' },
      output: { archived_at: 'datetime' },
      side_effects: ['mutates:thread_state'],
      permissions: ['thread:write'],
      confirmation: 'none',
      rate_limit: '100/min/user',
      reversible: true,
      rollback: 'thread.unarchive',
    };

    const parsed = CapabilitySchema.parse(example);
    expect(parsed.id).toBe('thread.archive');
    expect(parsed.kind).toBe('action');
    expect(parsed.rate_limit).toBe('100/min/user');
    expect(parsed.rollback).toBe('thread.unarchive');
    expect(parsed.reversible).toBe(true);
  });

  it('rejects an invalid kind value at expected path', () => {
    const bad = {
      id: 'thread.archive',
      kind: 'something_else',
      version: '2.1.0',
      input: {},
      output: {},
      side_effects: [],
      permissions: [],
      confirmation: 'none',
      reversible: true,
    };

    const result = CapabilitySchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.join('.') === 'kind');
      expect(issue).toBeDefined();
    }
  });

  it('accepts mutates:* and reads:* qualified side effects', () => {
    const cap = {
      id: 'thread.read',
      kind: 'data',
      version: '1.0.0',
      input: {},
      output: {},
      side_effects: ['reads:thread_state', 'reads:user_metadata'],
      permissions: ['thread:read'],
      confirmation: 'none',
      reversible: true,
    };
    expect(() => CapabilitySchema.parse(cap)).not.toThrow();
  });

  it('exposes KNOWN_SIDE_EFFECTS as a sane set', () => {
    expect(KNOWN_SIDE_EFFECTS).toContain('send');
    expect(KNOWN_SIDE_EFFECTS).toContain('delete');
    expect(KNOWN_SIDE_EFFECTS).toContain('modify_permissions');
  });

  it('accepts an optional salience_default expression on a data capability', () => {
    const cap = {
      id: 'thread.list',
      kind: 'data',
      version: '1.0.0',
      input: {},
      output: {},
      side_effects: ['reads:thread_state'],
      permissions: ['thread:read'],
      confirmation: 'none',
      reversible: true,
      salience_default: 'urgency * recency + assigned_to_me * 2',
    };
    const parsed = CapabilitySchema.parse(cap);
    expect(parsed.salience_default).toBe('urgency * recency + assigned_to_me * 2');
  });

  it('treats salience_default as optional — capabilities without it still validate', () => {
    const cap = {
      id: 'thread.list',
      kind: 'data',
      version: '1.0.0',
      input: {},
      output: {},
      side_effects: ['reads:thread_state'],
      permissions: ['thread:read'],
      confirmation: 'none',
      reversible: true,
    };
    const parsed = CapabilitySchema.parse(cap);
    expect(parsed.salience_default).toBeUndefined();
  });

  it('rejects salience_default when set to a non-string value', () => {
    const bad = {
      id: 'thread.list',
      kind: 'data',
      version: '1.0.0',
      input: {},
      output: {},
      side_effects: [],
      permissions: ['thread:read'],
      confirmation: 'none',
      reversible: true,
      salience_default: 42,
    };
    const result = CapabilitySchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.join('.') === 'salience_default');
      expect(issue).toBeDefined();
    }
  });
});
