// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { describe, expect, it, vi } from 'vitest';
import { ChordStateMachine } from '../src/chord.js';
import { InMemoryKeyboardRegistry } from '../src/registry.js';
import type { HotkeyEventLike } from '../src/hotkey.js';

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

/**
 * Manual scheduler so tests can advance "time" deterministically without
 * leaning on `vi.useFakeTimers()` (which interferes with promise microtask
 * scheduling under happy-dom).
 */
function makeManualScheduler(): {
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  fire: () => void;
  pending: number;
} {
  const timers = new Map<number, () => void>();
  let next = 0;
  return {
    pending: 0,
    setTimer(fn) {
      const id = next++;
      timers.set(id, fn);
      return id;
    },
    clearTimer(handle) {
      timers.delete(handle as number);
    },
    fire() {
      const snapshot = Array.from(timers.entries());
      timers.clear();
      for (const [, fn] of snapshot) fn();
    },
  };
}

describe('ChordStateMachine', () => {
  it('returns passthrough when no chord begins with the event', () => {
    const reg = new InMemoryKeyboardRegistry();
    reg.register({ id: 'palette', label: 'palette', hotkey: 'cmd+k', invoke: vi.fn() });
    const chord = new ChordStateMachine(reg);
    expect(chord.feed(ev('x')).kind).toBe('passthrough');
    expect(chord.isPending).toBe(false);
  });

  it('captures the first key of a registered chord and returns pending', () => {
    const reg = new InMemoryKeyboardRegistry();
    reg.register({ id: 'go.inbox', label: 'inbox', hotkey: 'g i', invoke: vi.fn() });
    const chord = new ChordStateMachine(reg);
    expect(chord.feed(ev('g')).kind).toBe('pending');
    expect(chord.isPending).toBe(true);
  });

  it('fires the matching action when the second key arrives', () => {
    const reg = new InMemoryKeyboardRegistry();
    const invoke = vi.fn();
    reg.register({ id: 'go.inbox', label: 'inbox', hotkey: 'g i', invoke });
    const chord = new ChordStateMachine(reg);
    chord.feed(ev('g'));
    const intent = chord.feed(ev('i'));
    expect(intent.kind).toBe('fire');
    if (intent.kind === 'fire') {
      expect(intent.action.id).toBe('go.inbox');
    }
    expect(chord.isPending).toBe(false);
  });

  it('routes between siblings: g i vs g a', () => {
    const reg = new InMemoryKeyboardRegistry();
    const invokeI = vi.fn();
    const invokeA = vi.fn();
    reg.register({ id: 'go.inbox', label: 'inbox', hotkey: 'g i', invoke: invokeI });
    reg.register({ id: 'go.archive', label: 'archive', hotkey: 'g a', invoke: invokeA });
    const chord = new ChordStateMachine(reg);

    // First chord: g a
    chord.feed(ev('g'));
    const a = chord.feed(ev('a'));
    expect(a.kind).toBe('fire');
    if (a.kind === 'fire') expect(a.action.id).toBe('go.archive');

    // Second chord (state machine should have reset cleanly): g i
    chord.feed(ev('g'));
    const i = chord.feed(ev('i'));
    expect(i.kind).toBe('fire');
    if (i.kind === 'fire') expect(i.action.id).toBe('go.inbox');
  });

  it('passes the second key through when no chord matches', () => {
    const reg = new InMemoryKeyboardRegistry();
    reg.register({ id: 'go.inbox', label: 'inbox', hotkey: 'g i', invoke: vi.fn() });
    const chord = new ChordStateMachine(reg);
    chord.feed(ev('g'));
    // `g` then `q` — no `g q` chord registered.
    const intent = chord.feed(ev('q'));
    expect(intent.kind).toBe('passthrough');
    expect(chord.isPending).toBe(false);
  });

  it('clears the pending state on timeout', () => {
    const reg = new InMemoryKeyboardRegistry();
    reg.register({ id: 'go.inbox', label: 'inbox', hotkey: 'g i', invoke: vi.fn() });
    const sched = makeManualScheduler();
    const chord = new ChordStateMachine(reg, {
      timeoutMs: 1500,
      setTimer: sched.setTimer,
      clearTimer: sched.clearTimer,
    });
    chord.feed(ev('g'));
    expect(chord.isPending).toBe(true);
    sched.fire(); // simulate the 1500ms window elapsing
    expect(chord.isPending).toBe(false);
  });

  it('cancel() clears a pending chord', () => {
    const reg = new InMemoryKeyboardRegistry();
    reg.register({ id: 'go.inbox', label: 'inbox', hotkey: 'g i', invoke: vi.fn() });
    const chord = new ChordStateMachine(reg);
    chord.feed(ev('g'));
    expect(chord.isPending).toBe(true);
    chord.cancel();
    expect(chord.isPending).toBe(false);
  });

  it('cancel() is a no-op when nothing is pending', () => {
    const reg = new InMemoryKeyboardRegistry();
    const chord = new ChordStateMachine(reg);
    expect(() => chord.cancel()).not.toThrow();
  });

  it('later registrations win on chord collision', () => {
    const reg = new InMemoryKeyboardRegistry();
    reg.register({ id: 'first', label: 'first', hotkey: 'g i', invoke: vi.fn() });
    reg.register({ id: 'second', label: 'second', hotkey: 'g i', invoke: vi.fn() });
    const chord = new ChordStateMachine(reg);
    chord.feed(ev('g'));
    const intent = chord.feed(ev('i'));
    expect(intent.kind).toBe('fire');
    if (intent.kind === 'fire') expect(intent.action.id).toBe('second');
  });

  it('respects platform when matching cmd-portable chord steps', () => {
    const reg = new InMemoryKeyboardRegistry();
    // Contrived but valid: a chord that needs Ctrl on the FIRST step.
    reg.register({ id: 'odd', label: 'odd', hotkey: 'ctrl+g i', invoke: vi.fn() });
    const chord = new ChordStateMachine(reg);
    expect(chord.feed(ev('g'), 'mac').kind).toBe('passthrough');
    expect(chord.feed(ev('g', { ctrlKey: true }), 'mac').kind).toBe('pending');
  });

  it('chord-pending state is reset after timeout even if next key is unrelated', () => {
    const reg = new InMemoryKeyboardRegistry();
    reg.register({ id: 'go.inbox', label: 'inbox', hotkey: 'g i', invoke: vi.fn() });
    const sched = makeManualScheduler();
    const chord = new ChordStateMachine(reg, {
      setTimer: sched.setTimer,
      clearTimer: sched.clearTimer,
    });
    chord.feed(ev('g'));
    sched.fire();
    // Now `i` alone should NOT fire `go.inbox` (chord state was discarded).
    const intent = chord.feed(ev('i'));
    expect(intent.kind).toBe('passthrough');
  });

  it('a fired chord clears the underlying timer (no leak)', () => {
    const reg = new InMemoryKeyboardRegistry();
    reg.register({ id: 'go.inbox', label: 'inbox', hotkey: 'g i', invoke: vi.fn() });
    const cleared: unknown[] = [];
    const chord = new ChordStateMachine(reg, {
      setTimer: () => 'timer-handle',
      clearTimer: (h) => cleared.push(h),
    });
    chord.feed(ev('g'));
    chord.feed(ev('i'));
    expect(cleared).toContain('timer-handle');
  });

  it('cancel() clears the underlying timer', () => {
    const reg = new InMemoryKeyboardRegistry();
    reg.register({ id: 'go.inbox', label: 'inbox', hotkey: 'g i', invoke: vi.fn() });
    let cleared = false;
    const chord = new ChordStateMachine(reg, {
      setTimer: () => 'h',
      clearTimer: () => {
        cleared = true;
      },
    });
    chord.feed(ev('g'));
    chord.cancel();
    expect(cleared).toBe(true);
  });

  it('uses the default timeoutMs (1500) when not overridden', () => {
    const reg = new InMemoryKeyboardRegistry();
    reg.register({ id: 'go.inbox', label: 'inbox', hotkey: 'g i', invoke: vi.fn() });
    let observedMs: number | null = null;
    const chord = new ChordStateMachine(reg, {
      setTimer: (_fn, ms) => {
        observedMs = ms;
        return 0;
      },
      clearTimer: () => undefined,
    });
    chord.feed(ev('g'));
    expect(observedMs).toBe(1500);
  });

  it('honours a custom timeoutMs', () => {
    const reg = new InMemoryKeyboardRegistry();
    reg.register({ id: 'go.inbox', label: 'inbox', hotkey: 'g i', invoke: vi.fn() });
    let observedMs: number | null = null;
    const chord = new ChordStateMachine(reg, {
      timeoutMs: 750,
      setTimer: (_fn, ms) => {
        observedMs = ms;
        return 0;
      },
      clearTimer: () => undefined,
    });
    chord.feed(ev('g'));
    expect(observedMs).toBe(750);
  });

  it('actions registered without a hotkey never start a chord', () => {
    const reg = new InMemoryKeyboardRegistry();
    reg.register({ id: 'noop', label: 'noop', invoke: vi.fn() });
    const chord = new ChordStateMachine(reg);
    expect(chord.feed(ev('g')).kind).toBe('passthrough');
  });
});
