// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
import { describe, expect, it } from 'vitest';
import {
  LiteralIconResolver,
  MapIconResolver,
  NoopIconResolver,
} from '../../src/icons/resolver.js';

describe('NoopIconResolver', () => {
  it('returns null for any (set, name)', () => {
    expect(NoopIconResolver.resolve('lucide', 'archive')).toBeNull();
    expect(NoopIconResolver.resolve('phosphor', 'gear')).toBeNull();
  });

  it('returns null even for empty strings', () => {
    expect(NoopIconResolver.resolve('', '')).toBeNull();
  });
});

describe('MapIconResolver', () => {
  it('resolves keys formatted as `${set}:${name}`', () => {
    const map = new Map<string, string>([
      ['lucide:archive', '<svg id="a"/>'],
      ['lucide:trash', '<svg id="t"/>'],
    ]);
    const r = new MapIconResolver(map);
    expect(r.resolve('lucide', 'archive')).toBe('<svg id="a"/>');
    expect(r.resolve('lucide', 'trash')).toBe('<svg id="t"/>');
  });

  it('returns null for an unknown name within a known set', () => {
    const r = new MapIconResolver(new Map([['lucide:archive', '<svg/>']]));
    expect(r.resolve('lucide', 'unknown')).toBeNull();
  });

  it('returns null for an unknown set', () => {
    const r = new MapIconResolver(new Map([['lucide:archive', '<svg/>']]));
    expect(r.resolve('phosphor', 'archive')).toBeNull();
  });

  it('does not collide across sets that share a name', () => {
    const r = new MapIconResolver(
      new Map([
        ['lucide:gear', '<svg id="lucide-gear"/>'],
        ['phosphor:gear', '<svg id="phosphor-gear"/>'],
      ]),
    );
    expect(r.resolve('lucide', 'gear')).toBe('<svg id="lucide-gear"/>');
    expect(r.resolve('phosphor', 'gear')).toBe('<svg id="phosphor-gear"/>');
  });

  it('returns null for an empty map', () => {
    const r = new MapIconResolver(new Map());
    expect(r.resolve('any', 'thing')).toBeNull();
  });
});

describe('LiteralIconResolver', () => {
  it('resolves nested literal records', () => {
    const r = new LiteralIconResolver({
      lucide: { archive: '<svg id="a"/>', trash: '<svg id="t"/>' },
      phosphor: { gear: '<svg id="g"/>' },
    });
    expect(r.resolve('lucide', 'archive')).toBe('<svg id="a"/>');
    expect(r.resolve('lucide', 'trash')).toBe('<svg id="t"/>');
    expect(r.resolve('phosphor', 'gear')).toBe('<svg id="g"/>');
  });

  it('returns null for an unknown set', () => {
    const r = new LiteralIconResolver({ lucide: { archive: '<svg/>' } });
    expect(r.resolve('phosphor', 'archive')).toBeNull();
  });

  it('returns null for an unknown name within a known set', () => {
    const r = new LiteralIconResolver({ lucide: { archive: '<svg/>' } });
    expect(r.resolve('lucide', 'trash')).toBeNull();
  });

  it('handles an empty literal', () => {
    const r = new LiteralIconResolver({});
    expect(r.resolve('lucide', 'archive')).toBeNull();
  });

  it('handles an empty per-set bucket', () => {
    const r = new LiteralIconResolver({ lucide: {} });
    expect(r.resolve('lucide', 'archive')).toBeNull();
  });
});
