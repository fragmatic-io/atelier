// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
import { describe, expect, it, vi } from 'vitest';
import {
  LUCIDE_DEFAULT_ROSTER,
  LUCIDE_SET_ID,
  LucideIconResolver,
  lucideIconNodeToSvg,
} from '../../src/icons/lucide-resolver.js';

describe('lucideIconNodeToSvg', () => {
  it('renders an iconNode tuple-array into an <svg> string with default attrs', () => {
    const svg = lucideIconNodeToSvg([
      ['path', { d: 'M3 7h18', key: 'ignored' }],
      ['rect', { width: '10', height: '10', x: '4', y: '4', key: 'r' }],
    ]);
    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox="0 0 24 24"');
    expect(svg).toContain('stroke="currentColor"');
    expect(svg).toContain('stroke-width="2"');
    expect(svg).toContain('<path d="M3 7h18" />');
    expect(svg).toContain('<rect width="10" height="10" x="4" y="4" />');
  });

  it('omits the React `key` attribute from the rendered SVG', () => {
    const svg = lucideIconNodeToSvg([['path', { d: 'M0 0', key: 'react-key' }]]);
    expect(svg).not.toContain('key=');
    expect(svg).not.toContain('react-key');
  });

  it('escapes HTML-significant characters in attribute values', () => {
    const svg = lucideIconNodeToSvg([['path', { d: '"M0 0" & <evil>', key: 'k' }]]);
    expect(svg).toContain('&quot;');
    expect(svg).toContain('&amp;');
    expect(svg).toContain('&lt;');
    expect(svg).toContain('&gt;');
    expect(svg).not.toContain('<evil>');
  });

  it('converts camelCase attribute names to kebab-case', () => {
    const svg = lucideIconNodeToSvg([
      // Synthetic — lucide already kebab-cases its attrs, but the resolver
      // should be defensive in case a host extends with raw React attrs.
      ['path', { strokeWidth: '3', key: 'k' }],
    ]);
    expect(svg).toContain('stroke-width="3"');
    expect(svg).not.toContain('strokeWidth');
  });
});

describe('LUCIDE_DEFAULT_ROSTER', () => {
  it('includes the icons the baseline components reach for', () => {
    const required = [
      'archive',
      'inbox',
      'info',
      'alert-triangle',
      'circle-check',
      'x-circle',
      'circle-dot',
    ];
    for (const name of required) {
      expect(LUCIDE_DEFAULT_ROSTER.has(name)).toBe(true);
    }
  });

  it('every entry is a non-empty iconNode tuple-array', () => {
    for (const [name, node] of LUCIDE_DEFAULT_ROSTER.entries()) {
      expect(Array.isArray(node), `roster entry ${name} should be an array`).toBe(true);
      expect(node.length).toBeGreaterThan(0);
      for (const [tag, attrs] of node) {
        expect(typeof tag).toBe('string');
        expect(typeof attrs).toBe('object');
      }
    }
  });
});

describe('LucideIconResolver', () => {
  it('resolves a known name in the default roster to a non-empty SVG string', () => {
    const r = new LucideIconResolver();
    const svg = r.resolve(LUCIDE_SET_ID, 'archive');
    expect(svg).toBeTruthy();
    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox="0 0 24 24"');
  });

  it('returns null for an unknown name and warns once', () => {
    const warn = vi.fn();
    const r = new LucideIconResolver({ warn });
    expect(r.resolve('lucide', 'this-icon-does-not-exist')).toBeNull();
    expect(r.resolve('lucide', 'this-icon-does-not-exist')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('lucide:this-icon-does-not-exist');
  });

  it('returns null for an unknown set without consulting the roster', () => {
    const r = new LucideIconResolver();
    expect(r.resolve('phosphor', 'archive')).toBeNull();
  });

  it('honours BrandKit allowedSets — disallowed set returns null + warns', () => {
    const warn = vi.fn();
    const r = new LucideIconResolver({ allowedSets: ['lucide'], warn });
    // Allowed set still resolves.
    expect(r.resolve('lucide', 'archive')).toBeTruthy();
    // Disallowed set returns null and warns.
    expect(r.resolve('phosphor', 'archive')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('not in BrandKit.iconography.allowed_sets');
  });

  it('extend merges custom icons on top of the default roster', () => {
    const r = new LucideIconResolver({
      extend: { 'custom-thing': '<svg id="custom"/>' },
    });
    expect(r.resolve('lucide', 'custom-thing')).toBe('<svg id="custom"/>');
    // Default roster still works.
    expect(r.resolve('lucide', 'archive')).toContain('<svg');
  });

  it('extend can supply iconNode tuples that get projected through lucideIconNodeToSvg', () => {
    const r = new LucideIconResolver({
      extend: { 'tiny-dot': [['circle', { cx: '12', cy: '12', r: '2', key: 'k' }]] },
    });
    const svg = r.resolve('lucide', 'tiny-dot');
    expect(svg).toContain('<circle cx="12" cy="12" r="2" />');
  });

  it('replace drops the default roster entirely', () => {
    const r = new LucideIconResolver({
      replace: { 'only-this': '<svg id="only"/>' },
      warn: () => {
        // suppress: the missing-name warn is the resolver's expected behaviour.
      },
    });
    expect(r.resolve('lucide', 'only-this')).toBe('<svg id="only"/>');
    expect(r.resolve('lucide', 'archive')).toBeNull();
  });

  it('warned-once de-dupes across (set, name) pairs', () => {
    const warn = vi.fn();
    const r = new LucideIconResolver({ allowedSets: ['lucide'], warn });
    r.resolve('phosphor', 'a');
    r.resolve('phosphor', 'b'); // same set; the warn key is set:phosphor → only 1 warn.
    r.resolve('heroicons', 'c'); // different set → 1 more warn.
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('knownNames returns the merged roster names', () => {
    const r = new LucideIconResolver({ extend: { 'custom-thing': '<svg/>' } });
    const names = r.knownNames();
    expect(names).toContain('archive');
    expect(names).toContain('custom-thing');
  });
});
