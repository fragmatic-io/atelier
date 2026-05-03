// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { describe, expect, it } from 'vitest';
import { parseMentions } from '../../src/mentions/parser.js';
import type { MentionMatch } from '../../src/mentions/resolver.js';

/**
 * Helper — narrow `string | MentionMatch` to the match path so each
 * assertion stays terse.
 */
function asMatch(v: string | MentionMatch): MentionMatch {
  if (typeof v === 'string') throw new Error(`expected match, got literal ${JSON.stringify(v)}`);
  return v;
}

describe('parseMentions', () => {
  it('returns the whole text as one literal when no prefix matches', () => {
    expect(parseMentions('plain prose with no mentions', ['@', '#'])).toEqual([
      'plain prose with no mentions',
    ]);
  });

  it('returns the empty array for empty input', () => {
    expect(parseMentions('', ['@'])).toEqual([]);
  });

  it('returns the input as a single literal when prefixes is empty', () => {
    expect(parseMentions('@alice and #ENG-1', [])).toEqual(['@alice and #ENG-1']);
  });

  it('parses a single @-mention', () => {
    const out = parseMentions('hi @alice', ['@']);
    expect(out).toHaveLength(2);
    expect(out[0]).toBe('hi ');
    const m = asMatch(out[1] as string | MentionMatch);
    expect(m).toEqual({ prefix: '@', id: 'alice', raw: '@alice', offset: 3 });
  });

  it('parses a Linear-shaped #-autolink with a dash inside the id', () => {
    const out = parseMentions('see #ENG-123 for context', ['#']);
    expect(out).toHaveLength(3);
    expect(out[0]).toBe('see ');
    const m = asMatch(out[1] as string | MentionMatch);
    expect(m).toEqual({ prefix: '#', id: 'ENG-123', raw: '#ENG-123', offset: 4 });
    expect(out[2]).toBe(' for context');
  });

  it('parses multiple mentions with mixed prefixes in one pass', () => {
    const out = parseMentions('hi @alice see #ENG-123 cc @bob', ['@', '#']);
    // ['hi ', @alice, ' see ', #ENG-123, ' cc ', @bob]
    expect(out).toHaveLength(6);
    expect(out[0]).toBe('hi ');
    expect(asMatch(out[1] as string | MentionMatch).id).toBe('alice');
    expect(asMatch(out[1] as string | MentionMatch).prefix).toBe('@');
    expect(out[2]).toBe(' see ');
    expect(asMatch(out[3] as string | MentionMatch).id).toBe('ENG-123');
    expect(asMatch(out[3] as string | MentionMatch).prefix).toBe('#');
    expect(out[4]).toBe(' cc ');
    expect(asMatch(out[5] as string | MentionMatch).id).toBe('bob');
  });

  it('does not parse `email@host` as @host (boundary rule)', () => {
    // `t` precedes the `@`, which is an id char, so it's not a boundary.
    const out = parseMentions('contact me at noreply@example.com', ['@']);
    expect(out).toEqual(['contact me at noreply@example.com']);
  });

  it('parses a mention at offset 0 (no preceding char)', () => {
    const out = parseMentions('@alice opened the issue', ['@']);
    expect(out).toHaveLength(2);
    expect(asMatch(out[0] as string | MentionMatch).offset).toBe(0);
    expect(asMatch(out[0] as string | MentionMatch).id).toBe('alice');
  });

  it('parses a mention preceded by an opening bracket / paren / comma', () => {
    for (const prelude of ['(', '[', ',', ':', "'"]) {
      const out = parseMentions(`${prelude}@alice`, ['@']);
      expect(out).toHaveLength(2);
      expect(out[0]).toBe(prelude);
      expect(asMatch(out[1] as string | MentionMatch).id).toBe('alice');
    }
  });

  it('does not eat a trailing `.` (prose punctuation)', () => {
    const out = parseMentions('hello @alice. how are you?', ['@']);
    expect(out).toHaveLength(3);
    const m = asMatch(out[1] as string | MentionMatch);
    expect(m.id).toBe('alice');
    expect(m.raw).toBe('@alice');
    expect(out[2]).toBe('. how are you?');
  });

  it('keeps an internal `.` (`alice.smith`)', () => {
    const out = parseMentions('cc @alice.smith', ['@']);
    expect(out).toHaveLength(2);
    expect(asMatch(out[1] as string | MentionMatch).id).toBe('alice.smith');
  });

  it('keeps an internal `/` (`team/alice`)', () => {
    const out = parseMentions('cc @team/alice', ['@']);
    expect(out).toHaveLength(2);
    expect(asMatch(out[1] as string | MentionMatch).id).toBe('team/alice');
  });

  it('does not treat a bare prefix with no id as a match', () => {
    expect(parseMentions('email @ gmail', ['@'])).toEqual(['email @ gmail']);
  });

  it('does not treat a prefix followed only by `.` as a match', () => {
    // `@.` — the candidate id is just `.`, which trims to empty.
    expect(parseMentions('what @. is this', ['@'])).toEqual(['what @. is this']);
  });

  it('keeps the offset accurate for multi-byte-free input', () => {
    const out = parseMentions('xx @a yy @b', ['@']);
    // ['xx ', @a, ' yy ', @b]
    expect(asMatch(out[1] as string | MentionMatch).offset).toBe(3);
    expect(asMatch(out[3] as string | MentionMatch).offset).toBe(9);
  });

  it('round-trips: concatenating raw + literals reproduces the input', () => {
    const text = 'hi @alice see #ENG-123, cc @bob.';
    const out = parseMentions(text, ['@', '#']);
    const recombined = out.map((seg) => (typeof seg === 'string' ? seg : seg.raw)).join('');
    expect(recombined).toBe(text);
  });

  it('does not match a `@` that immediately follows an id char (boundary rule)', () => {
    // `@alice@bob` — the second `@` is preceded by `e` (an id char),
    // so the boundary rule correctly rejects it. This is the same rule
    // that keeps `noreply@example.com` from being parsed as a mention.
    // Hosts that need back-to-back mention support should require
    // separators (whitespace, comma, etc.) — the alternative is widening
    // the boundary rule and re-introducing the email-address false
    // positive.
    const out = parseMentions('@alice@bob', ['@']);
    expect(out).toHaveLength(2);
    expect(asMatch(out[0] as string | MentionMatch).id).toBe('alice');
    // The trailing `@bob` stays in the literal chunk.
    expect(out[1]).toBe('@bob');
  });

  it('parses back-to-back mentions when separated by a non-id char', () => {
    const out = parseMentions('@alice, @bob', ['@']);
    expect(out).toHaveLength(3);
    expect(asMatch(out[0] as string | MentionMatch).id).toBe('alice');
    expect(out[1]).toBe(', ');
    expect(asMatch(out[2] as string | MentionMatch).id).toBe('bob');
  });

  it('does not match a prefix mid-id (`#ENG-123` does not also yield a `-123` match)', () => {
    const out = parseMentions('see #ENG-123', ['#', '-']);
    // The `-` is INSIDE the id, so even though `-` is in `prefixes` we
    // never emit a `-123` match (the `-` is not at a boundary).
    expect(out).toHaveLength(2);
    expect(asMatch(out[1] as string | MentionMatch).id).toBe('ENG-123');
  });
});
