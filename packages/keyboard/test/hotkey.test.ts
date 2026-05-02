// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
import { describe, expect, it } from 'vitest';
import {
  canonicalEventKey,
  formatHotkey,
  matchHotkey,
  matchStep,
  parseChord,
  parseHotkey,
  type HotkeyEventLike,
} from '../src/hotkey.js';

const MAC = 'mac' as const;
const OTHER = 'other' as const;

function ev(
  key: string,
  mods: Partial<Pick<HotkeyEventLike, 'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey'>> = {},
): HotkeyEventLike {
  return {
    key,
    ctrlKey: mods.ctrlKey ?? false,
    shiftKey: mods.shiftKey ?? false,
    altKey: mods.altKey ?? false,
    metaKey: mods.metaKey ?? false,
  };
}

describe('parseHotkey', () => {
  it('parses a single key', () => {
    const p = parseHotkey('k');
    expect(p.steps.length).toBe(1);
    expect(p.steps[0]?.key).toBe('k');
    expect(p.steps[0]?.cmdPortable).toBe(false);
  });

  it('parses cmd+k as portable', () => {
    const p = parseHotkey('cmd+k');
    expect(p.steps[0]?.cmdPortable).toBe(true);
    expect(p.steps[0]?.meta).toBe(false);
    expect(p.steps[0]?.ctrl).toBe(false);
  });

  it('treats `mod` as an alias for `cmd`', () => {
    const a = parseHotkey('mod+k').steps[0];
    const b = parseHotkey('cmd+k').steps[0];
    expect(a?.cmdPortable).toBe(b?.cmdPortable);
    expect(a?.key).toBe(b?.key);
  });

  it('parses ctrl+shift+p', () => {
    const p = parseHotkey('ctrl+shift+p').steps[0];
    expect(p?.ctrl).toBe(true);
    expect(p?.shift).toBe(true);
    expect(p?.key).toBe('p');
  });

  it('aliases escape / esc and arrow keys', () => {
    expect(parseHotkey('esc').steps[0]?.key).toBe('escape');
    expect(parseHotkey('Escape').steps[0]?.key).toBe('escape');
    expect(parseHotkey('up').steps[0]?.key).toBe('arrowup');
    expect(parseHotkey('left').steps[0]?.key).toBe('arrowleft');
  });

  it('tolerates whitespace inside a step', () => {
    const p = parseHotkey('cmd + shift + k').steps[0];
    expect(p?.cmdPortable).toBe(true);
    expect(p?.shift).toBe(true);
    expect(p?.key).toBe('k');
  });

  it('parses two-step chords (g i)', () => {
    const p = parseHotkey('g i');
    expect(p.steps.length).toBe(2);
    expect(p.steps[0]?.key).toBe('g');
    expect(p.steps[1]?.key).toBe('i');
  });

  it('throws on empty input', () => {
    expect(() => parseHotkey('')).toThrow(/empty/i);
    expect(() => parseHotkey('   ')).toThrow(/empty/i);
  });

  it('throws on a step with only modifiers', () => {
    expect(() => parseHotkey('cmd')).toThrow(/no non-modifier/i);
  });

  it('throws on a step with two non-modifiers', () => {
    expect(() => parseHotkey('a+b')).toThrow(/more than one/i);
  });
});

describe('parseChord', () => {
  it('returns null for single-step hotkeys', () => {
    expect(parseChord('cmd+k')).toBeNull();
  });

  it('returns the parsed chord for multi-step hotkeys', () => {
    const c = parseChord('g i');
    expect(c?.steps.length).toBe(2);
  });
});

describe('matchHotkey', () => {
  it('matches a simple letter on mac (no modifiers)', () => {
    const p = parseHotkey('k');
    expect(matchHotkey(p, ev('k'), MAC)).toBe(true);
  });

  it('rejects when modifiers do not match', () => {
    const p = parseHotkey('k');
    expect(matchHotkey(p, ev('k', { ctrlKey: true }), MAC)).toBe(false);
  });

  it('cmd+k uses Meta on mac, Ctrl on other', () => {
    const p = parseHotkey('cmd+k');
    expect(matchHotkey(p, ev('k', { metaKey: true }), MAC)).toBe(true);
    expect(matchHotkey(p, ev('k', { ctrlKey: true }), MAC)).toBe(false);
    expect(matchHotkey(p, ev('k', { ctrlKey: true }), OTHER)).toBe(true);
    expect(matchHotkey(p, ev('k', { metaKey: true }), OTHER)).toBe(false);
  });

  it('strict meta+k binding requires Meta on both platforms', () => {
    const p = parseHotkey('meta+k');
    expect(matchHotkey(p, ev('k', { metaKey: true }), MAC)).toBe(true);
    expect(matchHotkey(p, ev('k', { metaKey: true }), OTHER)).toBe(true);
    expect(matchHotkey(p, ev('k', { ctrlKey: true }), OTHER)).toBe(false);
  });

  it('shift+escape requires both modifier and key', () => {
    const p = parseHotkey('shift+escape');
    expect(matchHotkey(p, ev('Escape', { shiftKey: true }), MAC)).toBe(true);
    expect(matchHotkey(p, ev('Escape'), MAC)).toBe(false);
  });

  it('letters case-fold so cmd+k matches Shift-modified KeyboardEvent for K', () => {
    const p = parseHotkey('cmd+k');
    // Browsers report `'K'` when shift is held + letter; the parser normalizes.
    // (Shift state still has to match — pressing literal Shift+Cmd+K shouldn't
    //  fire `cmd+k`. So we compare K *without* shift held.)
    expect(matchHotkey(p, ev('K', { metaKey: true }), MAC)).toBe(true);
  });

  it('chord-shaped hotkey is rejected by single-step matcher', () => {
    const p = parseHotkey('g i');
    expect(matchHotkey(p, ev('g'), MAC)).toBe(false);
  });

  it('matchStep can be called directly on a step', () => {
    const p = parseHotkey('shift+/');
    const step = p.steps[0];
    expect(step).toBeDefined();
    expect(matchStep(step!, ev('/', { shiftKey: true }), MAC)).toBe(true);
  });
});

describe('canonicalEventKey', () => {
  it('lowercases single characters', () => {
    expect(canonicalEventKey('K')).toBe('k');
    expect(canonicalEventKey('A')).toBe('a');
  });

  it('aliases longer key names', () => {
    expect(canonicalEventKey('Escape')).toBe('escape');
    expect(canonicalEventKey('Esc')).toBe('escape');
    expect(canonicalEventKey('ArrowUp')).toBe('arrowup');
  });

  it('passes unknown longer keys through lowercased', () => {
    expect(canonicalEventKey('F12')).toBe('f12');
  });
});

describe('formatHotkey', () => {
  it('renders cmd+k as ⌘K on mac', () => {
    expect(formatHotkey(parseHotkey('cmd+k'), MAC)).toBe('⌘K');
  });

  it('renders cmd+k as Ctrl+K elsewhere', () => {
    expect(formatHotkey(parseHotkey('cmd+k'), OTHER)).toBe('Ctrl+K');
  });

  it('renders chord with a space between steps on both platforms', () => {
    expect(formatHotkey(parseHotkey('g i'), MAC)).toBe('G I');
    expect(formatHotkey(parseHotkey('g i'), OTHER)).toBe('G I');
  });

  it('renders shift+escape with named key', () => {
    const mac = formatHotkey(parseHotkey('shift+escape'), MAC);
    expect(mac).toContain('Esc');
    expect(mac).toContain('⇧');
    const other = formatHotkey(parseHotkey('shift+escape'), OTHER);
    expect(other).toBe('Shift+Esc');
  });
});
