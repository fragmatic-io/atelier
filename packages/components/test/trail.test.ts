// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { describe, expect, it } from 'vitest';
import { parseTrail, serializeTrail, type TrailSegment } from '../src/breadcrumb/trail.js';

describe('serializeTrail / parseTrail', () => {
  it('serializes label-only segments separated by `|`', () => {
    expect(serializeTrail([{ label: 'Charges' }, { label: 'Refunds' }])).toBe('Charges|Refunds');
  });

  it('appends id with `_` separator when present (with `_` in payload escaped)', () => {
    // Stripe-shaped ids contain `_`. We percent-escape them so the
    // structural `_` between label and id stays unambiguous.
    expect(serializeTrail([{ label: 'charges' }, { label: 'ch_xxx', id: 'ch_xxx' }])).toBe(
      'charges|ch%5Fxxx_ch%5Fxxx',
    );
  });

  it('serializes empty trail as the empty string', () => {
    expect(serializeTrail([])).toBe('');
  });

  it('treats empty `id` the same as no id', () => {
    expect(serializeTrail([{ label: 'a', id: '' }])).toBe('a');
  });

  it('parses a Stripe-shaped trail back to segments via round-trip', () => {
    // The wire format is unambiguous AS LONG AS labels/ids go through the
    // serializer's escape pass — direct string manipulation by hosts is
    // discouraged. Round-trip is the contract.
    const trail: readonly TrailSegment[] = [
      { label: 'charges' },
      { label: 'ch_xxx', id: 'ch_xxx' },
      { label: 'refund', id: 'r_yyy' },
    ];
    expect(parseTrail(serializeTrail(trail))).toEqual(trail);
  });

  it('parses simple `_`-free wire payloads using the first `_` as the separator', () => {
    // No `_` in label/id payloads → wire format is fully human-legible.
    expect(parseTrail('charges|ch|refund_ryyy')).toEqual([
      { label: 'charges' },
      { label: 'ch' },
      { label: 'refund', id: 'ryyy' },
    ]);
  });

  it('parses an empty value as an empty array', () => {
    expect(parseTrail('')).toEqual([]);
  });

  it('extracts the named key from a full query string', () => {
    expect(parseTrail('?_trail=Charges|Refunds&foo=1')).toEqual([
      { label: 'Charges' },
      { label: 'Refunds' },
    ]);
    // also without the leading ?
    expect(parseTrail('_trail=Charges|Refunds&foo=1')).toEqual([
      { label: 'Charges' },
      { label: 'Refunds' },
    ]);
  });

  it('returns empty when the named key is missing', () => {
    expect(parseTrail('?other=Charges|Refunds')).toEqual([]);
  });

  it('honors a caller-supplied URL key', () => {
    expect(parseTrail('?path=A|B', 'path')).toEqual([{ label: 'A' }, { label: 'B' }]);
  });

  it('round-trips arbitrary unicode + whitespace + delimiter chars', () => {
    const trail: readonly TrailSegment[] = [
      { label: 'Hello World', id: 'a|b' },
      { label: 'Über', id: 'x_y' },
      { label: 'Π', id: '%' },
    ];
    const back = parseTrail(serializeTrail(trail));
    expect(back).toEqual(trail);
  });

  it('drops malformed pieces silently rather than throwing', () => {
    // Stray `%` is invalid percent-encoding — `decodeURIComponent` throws,
    // and the parser treats the piece as missing.
    const parsed = parseTrail('good|%E0%A4|also_good');
    expect(parsed).toEqual([{ label: 'good' }, { label: 'also', id: 'good' }]);
  });

  it('drops empty pieces from leading/trailing/double separators', () => {
    expect(parseTrail('|a||b|')).toEqual([{ label: 'a' }, { label: 'b' }]);
  });

  it('does NOT serialize the optional `href` field', () => {
    // `href` is a host-side affordance, not part of the persisted shape.
    const out = serializeTrail([
      { label: 'A', href: '/a' },
      { label: 'B', id: 'b', href: '/b' },
    ]);
    const back = parseTrail(out);
    expect(back).toEqual([{ label: 'A' }, { label: 'B', id: 'b' }]);
  });
});
