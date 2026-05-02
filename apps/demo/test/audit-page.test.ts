// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
// @vitest-environment happy-dom
/**
 * Tests for the `/admin/audit` page's pure SSE-chunk parser. The React
 * tree itself is exercised by the demo's Playwright suite; this file
 * pins the byte-faithful frame parser.
 *
 * The parser mirrors what `cir dev --tail` and the in-browser EventSource
 * already implement. We re-implement it on the page so the page can drive
 * its own buffered list (EventSource only fires one event at a time and
 * doesn't expose the raw chunked stream, but our test stand-in does).
 */

import { describe, expect, it } from 'vitest';
import { parseSseChunk } from '../app/admin/audit/page';

describe('parseSseChunk', () => {
  it('returns no frames and the full buffer as remainder when no terminator is present', () => {
    const out = parseSseChunk('event: action.executed\ndata: {"x":1}');
    expect(out.frames).toHaveLength(0);
    expect(out.remainder).toBe('event: action.executed\ndata: {"x":1}');
  });

  it('parses a single complete frame', () => {
    const buf = 'event: action.executed\ndata: {"x":1}\n\n';
    const out = parseSseChunk(buf);
    expect(out.frames).toHaveLength(1);
    expect(out.frames[0]?.event).toBe('action.executed');
    expect(out.frames[0]?.data).toBe('{"x":1}');
    expect(out.remainder).toBe('');
  });

  it('parses multiple frames in a single chunk', () => {
    const buf =
      'event: manifest.compiled\ndata: {"a":1}\n\nevent: policy.violated\ndata: {"b":2}\n\n';
    const out = parseSseChunk(buf);
    expect(out.frames).toHaveLength(2);
    expect(out.frames[0]?.event).toBe('manifest.compiled');
    expect(out.frames[1]?.event).toBe('policy.violated');
  });

  it('keeps the trailing partial frame in remainder', () => {
    const buf = 'event: x\ndata: 1\n\nevent: y\ndata: 2'; // no final \n\n
    const out = parseSseChunk(buf);
    expect(out.frames).toHaveLength(1);
    expect(out.remainder).toBe('event: y\ndata: 2');
  });

  it('joins multi-line data fields with newlines', () => {
    const buf = 'event: foo\ndata: a\ndata: b\n\n';
    const out = parseSseChunk(buf);
    expect(out.frames[0]?.data).toBe('a\nb');
  });

  it('ignores comment lines (": connected") and other prefixes', () => {
    const buf = ': connected\n\nevent: action.executed\ndata: {"y":3}\n\n';
    const out = parseSseChunk(buf);
    // Comment-only block produces no frame.
    expect(out.frames).toHaveLength(1);
    expect(out.frames[0]?.event).toBe('action.executed');
  });

  it('defaults the event name to "message" when no event: line is provided', () => {
    const buf = 'data: {"x":1}\n\n';
    const out = parseSseChunk(buf);
    expect(out.frames).toHaveLength(1);
    expect(out.frames[0]?.event).toBe('message');
  });
});
