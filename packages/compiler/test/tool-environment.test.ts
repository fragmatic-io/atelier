// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Tests for the C-2 `ToolEnvironment` surface — the substring-fallback
 * search functions and the default no-op behaviour when optional hooks
 * are not supplied.
 *
 * These cover the data-only seam in `tool-environment.ts`. The integration
 * with the agent loop lives in `tool-using-compiler.test.ts`.
 */

import type { Capability, ComponentDefinition } from '@atelier/schemas';
import { describe, expect, it } from 'vitest';
import { fallbackFindCapability, fallbackFindComponent } from '../src/tool-environment.js';

function caps(): Record<string, Capability> {
  return {
    'thread.archive': {
      id: 'thread.archive',
      kind: 'action',
      version: '1.0.0',
      description: 'Archive a thread (reversible).',
    } as unknown as Capability,
    'thread.list': {
      id: 'thread.list',
      kind: 'data',
      version: '1.0.0',
      description: 'List threads in the inbox.',
    } as unknown as Capability,
    'github.issue.list': {
      id: 'github.issue.list',
      kind: 'data',
      version: '1.0.0',
      description: 'List GitHub issues.',
    } as unknown as Capability,
    'no.description': {
      id: 'no.description',
      kind: 'data',
      version: '1.0.0',
    } as unknown as Capability,
  };
}

function comps(): ComponentDefinition[] {
  return [
    {
      id: 'Stack',
      props_schema: 'StackProps',
      data_sources: [],
      actions_supported: [],
      responsive_targets: ['web'],
      design_tokens: '@app/tokens/v1',
      examples: [],
      text_render: true,
      description: 'Vertical or horizontal layout container.',
    } as unknown as ComponentDefinition,
    {
      id: 'Queue',
      props_schema: 'QueueProps',
      data_sources: [],
      actions_supported: [],
      responsive_targets: ['web'],
      design_tokens: '@app/tokens/v1',
      examples: [],
      text_render: true,
      description: 'Items requiring action — for inbox queues.',
    } as unknown as ComponentDefinition,
    {
      id: 'List',
      props_schema: 'ListProps',
      data_sources: [],
      actions_supported: [],
      responsive_targets: ['web'],
      design_tokens: '@app/tokens/v1',
      examples: [],
      text_render: true,
      description: 'Generic semantic list.',
    } as unknown as ComponentDefinition,
  ];
}

describe('fallbackFindCapability', () => {
  it('matches by id substring (case-insensitive)', () => {
    const r = fallbackFindCapability(caps(), 'archive', 5);
    expect(r.map((x) => x.id)).toEqual(['thread.archive']);
    expect(r[0]?.description).toBe('Archive a thread (reversible).');
  });

  it('matches by description substring (case-insensitive)', () => {
    const r = fallbackFindCapability(caps(), 'INBOX', 5);
    expect(r.map((x) => x.id)).toEqual(['thread.list']);
  });

  it('matches by leading domain segment', () => {
    const r = fallbackFindCapability(caps(), 'github', 5);
    expect(r.map((x) => x.id)).toEqual(['github.issue.list']);
  });

  it('respects k cap', () => {
    const r = fallbackFindCapability(caps(), 'list', 1);
    expect(r).toHaveLength(1);
    // Both `thread.list` and `github.issue.list` would match; the cap
    // limits to the first.
    expect(r[0]?.id).toMatch(/^(thread|github)\./);
  });

  it('returns empty array on no match', () => {
    expect(fallbackFindCapability(caps(), 'nonexistent', 5)).toEqual([]);
  });

  it('returns id without description when capability has none', () => {
    const r = fallbackFindCapability(caps(), 'no.description', 5);
    expect(r).toEqual([{ id: 'no.description' }]);
  });
});

describe('fallbackFindComponent', () => {
  it('matches by id substring (case-insensitive)', () => {
    const r = fallbackFindComponent(comps(), 'queue', 5);
    expect(r.map((c) => (c as { id?: string }).id)).toEqual(['Queue']);
  });

  it('matches by description substring (case-insensitive)', () => {
    const r = fallbackFindComponent(comps(), 'inbox', 5);
    expect(r.map((c) => (c as { id?: string }).id)).toEqual(['Queue']);
  });

  it('respects k cap', () => {
    // "list" matches Queue (description "for inbox queues" → no, but
    // List matches by id and Queue's description has neither). Only List
    // matches.
    const r = fallbackFindComponent(comps(), 'list', 1);
    expect(r).toHaveLength(1);
  });

  it('returns empty array on no match', () => {
    expect(fallbackFindComponent(comps(), 'zzz_no_match_zzz', 5)).toEqual([]);
  });
});
