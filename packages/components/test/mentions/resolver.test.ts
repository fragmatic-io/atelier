// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { describe, expect, it } from 'vitest';
import {
  combineMentionResolvers,
  type MentionDisplay,
  type MentionMatch,
  type MentionResolver,
} from '../../src/mentions/resolver.js';

const m = (prefix: string, id: string): MentionMatch => ({
  prefix,
  id,
  raw: `${prefix}${id}`,
  offset: 0,
});

describe('combineMentionResolvers', () => {
  it('takes the union of every resolver`s prefixes', () => {
    const userR: MentionResolver = {
      prefixes: ['@'],
      resolve: () => null,
    };
    const issueR: MentionResolver = {
      prefixes: ['#'],
      resolve: () => null,
    };
    const combined = combineMentionResolvers([userR, issueR]);
    expect(new Set(combined.prefixes)).toEqual(new Set(['@', '#']));
  });

  it('routes a match to the resolver that claimed its prefix', () => {
    const userR: MentionResolver = {
      prefixes: ['@'],
      resolve: (match): MentionDisplay => ({ label: `User:${match.id}` }),
    };
    const issueR: MentionResolver = {
      prefixes: ['#'],
      resolve: (match): MentionDisplay => ({ label: `Issue:${match.id}` }),
    };
    const combined = combineMentionResolvers([userR, issueR]);
    expect(combined.resolve(m('@', 'alice'))).toEqual({ label: 'User:alice' });
    expect(combined.resolve(m('#', 'ENG-1'))).toEqual({ label: 'Issue:ENG-1' });
  });

  it('returns null for an unclaimed prefix', () => {
    const userR: MentionResolver = {
      prefixes: ['@'],
      resolve: (match): MentionDisplay => ({ label: match.id }),
    };
    const combined = combineMentionResolvers([userR]);
    expect(combined.resolve(m('!', 'incident-7'))).toBeNull();
  });

  it('first registered resolver wins on a duplicated prefix', () => {
    const first: MentionResolver = {
      prefixes: ['@'],
      resolve: (match): MentionDisplay => ({ label: `first:${match.id}` }),
    };
    const second: MentionResolver = {
      prefixes: ['@'],
      resolve: (match): MentionDisplay => ({ label: `second:${match.id}` }),
    };
    const combined = combineMentionResolvers([first, second]);
    expect(combined.resolve(m('@', 'alice'))).toEqual({ label: 'first:alice' });
  });

  it('honours an async per-prefix resolver', async () => {
    const userR: MentionResolver = {
      prefixes: ['@'],
      resolve: (match) => Promise.resolve<MentionDisplay>({ label: `U:${match.id}` }),
    };
    const combined = combineMentionResolvers([userR]);
    const out = combined.resolve(m('@', 'alice'));
    expect(out).toBeInstanceOf(Promise);
    await expect(out).resolves.toEqual({ label: 'U:alice' });
  });

  it('treats an empty resolver list as an empty resolver', () => {
    const combined = combineMentionResolvers([]);
    expect(combined.prefixes).toEqual([]);
    expect(combined.resolve(m('@', 'alice'))).toBeNull();
  });
});
