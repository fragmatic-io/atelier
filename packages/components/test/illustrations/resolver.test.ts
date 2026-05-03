// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { describe, expect, it } from 'vitest';
import {
  MapIllustrationResolver,
  NoopIllustrationResolver,
  type IllustrationEntry,
} from '../../src/illustrations/resolver.js';
import {
  DEFAULT_ILLUSTRATIONS,
  createDefaultIllustrationResolver,
} from '../../src/illustrations/builtins.js';

describe('NoopIllustrationResolver', () => {
  it('returns null for any name', () => {
    expect(NoopIllustrationResolver.resolve('inbox-zero')).toBeNull();
    expect(NoopIllustrationResolver.resolve('unknown')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(NoopIllustrationResolver.resolve('')).toBeNull();
  });
});

describe('MapIllustrationResolver round-trip', () => {
  it('returns the entry registered under a name', () => {
    const map: Record<string, IllustrationEntry> = {
      mascot: { svg: '<svg id="m"/>', label: 'Mascot' },
      simple: { svg: '<svg id="s"/>' },
    };
    const r = new MapIllustrationResolver(map);
    expect(r.resolve('mascot')).toEqual({ svg: '<svg id="m"/>', label: 'Mascot' });
    expect(r.resolve('simple')).toEqual({ svg: '<svg id="s"/>' });
  });

  it('returns null for an unknown name', () => {
    const r = new MapIllustrationResolver({ mascot: { svg: '<svg/>' } });
    expect(r.resolve('not-here')).toBeNull();
  });

  it('handles an empty map', () => {
    const r = new MapIllustrationResolver({});
    expect(r.resolve('anything')).toBeNull();
  });

  it('preserves the label field on round-trip', () => {
    const r = new MapIllustrationResolver({
      x: { svg: '<svg/>', label: 'announce-me' },
    });
    expect(r.resolve('x')?.label).toBe('announce-me');
  });
});

describe('DEFAULT_ILLUSTRATIONS bundled set', () => {
  it('ships the Vis-5 curated names', () => {
    expect(Object.keys(DEFAULT_ILLUSTRATIONS).sort()).toEqual([
      'error',
      'inbox-zero',
      'loading',
      'no-results',
      'placeholder',
    ]);
  });

  it('every entry carries non-empty SVG markup', () => {
    for (const [name, entry] of Object.entries(DEFAULT_ILLUSTRATIONS)) {
      expect(entry.svg, name).toMatch(/^<svg[\s>]/);
      expect(entry.svg, name).toContain('</svg>');
    }
  });

  it('every entry has an ARIA label', () => {
    for (const [name, entry] of Object.entries(DEFAULT_ILLUSTRATIONS)) {
      expect(entry.label, name).toBeTruthy();
    }
  });

  it('is frozen — hosts must clone to extend', () => {
    expect(Object.isFrozen(DEFAULT_ILLUSTRATIONS)).toBe(true);
  });
});

describe('createDefaultIllustrationResolver()', () => {
  it('resolves every bundled name', () => {
    const r = createDefaultIllustrationResolver();
    for (const name of Object.keys(DEFAULT_ILLUSTRATIONS)) {
      const entry = r.resolve(name);
      expect(entry, name).toBeTruthy();
      expect(entry?.svg).toContain('<svg');
    }
  });

  it('returns null for names outside the curated set', () => {
    const r = createDefaultIllustrationResolver();
    expect(r.resolve('definitely-not-bundled')).toBeNull();
  });
});
