// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Chord state machine — Wave 11 / Int-7.
 *
 * Tracks the first key of a two-step chord (e.g. `g` in `g i`) and waits a
 * bounded window for the second key to arrive. When the second keystroke
 * lands within the window the chord resolves to a `KeyboardAction` via the
 * supplied registry; when it doesn't (timeout, modifier-bearing key, escape)
 * the state machine resets and the original keystroke is treated as a regular
 * single-step lookup.
 *
 * ## Design notes
 *
 *  - **Pure logic, no React, no DOM.** The state machine receives
 *    `HotkeyEventLike` records and returns one of three intents:
 *    `'pending'`  — first key of a chord captured; suppress default and wait
 *    `'fire'`     — second key matched a chord; invoke the returned action
 *    `'passthrough'` — neither chord-pending nor chord-firing; caller may
 *                     fall back to single-step `registry.resolve()`
 *
 *  - **Modifier-bearing keys never start a chord.** `Cmd+G` is its own
 *    binding; `g` (no modifiers, in a non-input context) starts a chord
 *    only when the registry contains at least one chord beginning with `g`.
 *
 *  - **Timeout is bounded** — defaults to 1500ms. After the timeout the
 *    pending key is discarded silently. The window is generous enough that
 *    a deliberate chord (`g`, pause, `i`) still works on slow keyboards.
 *
 *  - **Escape cancels.** Pressing Escape while a chord is pending clears
 *    the pending key without firing anything.
 *
 *  - **The state machine borrows the registry's hotkey index.** It walks
 *    `registry.list()` once per chord-start to detect "is there any chord
 *    that begins with `g`?". This is O(n) per chord-start (uncommon), not
 *    per keystroke (the hot path).
 */

import { matchStep, parseHotkey, type HotkeyEventLike, type Platform } from './hotkey.js';
import type { KeyboardAction, KeyboardRegistry } from './registry.js';

/**
 * The three possible outcomes of feeding an event to the chord state
 * machine. The provider routes its keydown handler through `feed()` and
 * branches on the returned `intent`.
 */
export type ChordIntent =
  | {
      /**
       * First key of a chord captured. The provider should call
       * `event.preventDefault()` + `event.stopPropagation()` so the bare
       * `g` doesn't leak through to the page (e.g. focusing a search box).
       */
      kind: 'pending';
    }
  | {
      /**
       * Second key matched a chord. The provider invokes `action` (and
       * bumps recency) just as it would for a single-step match.
       */
      kind: 'fire';
      action: KeyboardAction;
    }
  | {
      /**
       * Neither pending nor firing. The provider falls back to its normal
       * single-step `registry.resolve()` path.
       */
      kind: 'passthrough';
    };

export interface ChordStateMachineOptions {
  /**
   * Window in milliseconds the state machine waits for the second key
   * before discarding the pending key. Default 1500ms — comfortable for
   * deliberate chords without trapping accidental presses.
   */
  timeoutMs?: number;
  /**
   * Override the timer scheduler. Defaults to `setTimeout`/`clearTimeout`
   * so the state machine works in browsers and node alike. Tests pass a
   * fake scheduler to advance time deterministically.
   */
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

/**
 * Bounded two-step chord matcher. Construct one per provider; feed every
 * candidate `HotkeyEventLike` (modifier-only events filtered upstream).
 */
export class ChordStateMachine {
  readonly #registry: KeyboardRegistry;
  readonly #timeoutMs: number;
  readonly #setTimer: (fn: () => void, ms: number) => unknown;
  readonly #clearTimer: (handle: unknown) => void;

  // Mutable state: the captured first event (if any) and the pending timer
  // handle. Stored as a tuple so reset is a single assignment.
  #pending: { event: HotkeyEventLike; timer: unknown } | null = null;

  constructor(registry: KeyboardRegistry, opts: ChordStateMachineOptions = {}) {
    this.#registry = registry;
    this.#timeoutMs = opts.timeoutMs ?? 1500;
    // Default scheduler — `setTimeout` returns `number` in browsers and
    // `Timeout` in node; both accept a `clearTimeout` of the matching kind.
    this.#setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.#clearTimer =
      opts.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  }

  /**
   * Feed a keyboard event to the chord state machine. Returns one of three
   * intents the provider routes on. `platform` defaults to `'other'`; the
   * provider passes its own resolved platform.
   *
   * Contract:
   *  - When no chord is pending and the event is a candidate first-step of
   *    SOME registered chord → returns `{ kind: 'pending' }`. The caller
   *    suppresses defaults and waits for the next event.
   *  - When a chord IS pending and the event matches the second step of a
   *    registered chord → returns `{ kind: 'fire', action }` and clears the
   *    pending state.
   *  - Otherwise → returns `{ kind: 'passthrough' }`. If a chord WAS pending
   *    and the second event doesn't match, the pending state is cleared
   *    silently (no fire, no defer).
   */
  feed(event: HotkeyEventLike, platform: Platform = 'other'): ChordIntent {
    if (this.#pending !== null) {
      // Second keystroke. Try to resolve the captured first + this event
      // against any registered chord. Whether or not it matches, the chord
      // pending state ends — chords are exactly two steps in this version.
      const first = this.#pending.event;
      this.#clear();
      const chord = this.#findChord(first, event, platform);
      if (chord !== null) {
        return { kind: 'fire', action: chord };
      }
      // No matching chord; pass through so the caller can decide whether
      // the second key is itself a single-step hotkey. The first key was
      // already swallowed (intent: 'pending') on the previous tick.
      return { kind: 'passthrough' };
    }
    // No pending chord — does this event START any registered chord?
    if (this.#startsAnyChord(event, platform)) {
      this.#begin(event);
      return { kind: 'pending' };
    }
    return { kind: 'passthrough' };
  }

  /**
   * Cancel any pending chord. Called by the provider when Escape lands or
   * focus shifts to a text-input surface mid-chord.
   */
  cancel(): void {
    if (this.#pending !== null) {
      this.#clear();
    }
  }

  /** True when a first-step key has been captured and we're awaiting step 2. */
  get isPending(): boolean {
    return this.#pending !== null;
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  /**
   * Walk every registered action looking for a chord (steps.length >= 2)
   * whose first step matches `event`. Returns true on the first match. We
   * deliberately re-parse here (cheap — tens of actions, parsed strings)
   * rather than caching another shape on the registry; the registry stays
   * neutral on chord semantics.
   */
  #startsAnyChord(event: HotkeyEventLike, platform: Platform): boolean {
    for (const action of this.#registry.list()) {
      if (action.hotkey === undefined) continue;
      // The registry stores actions; we re-parse the hotkey here to avoid
      // adding chord-aware fields to the registry's internal cache. Parse
      // failures throw at register time, so this is always safe.
      const parsed = parseHotkey(action.hotkey);
      if (parsed.steps.length < 2) continue;
      const first = parsed.steps[0];
      if (first === undefined) continue;
      if (matchStep(first, event, platform)) return true;
    }
    return false;
  }

  /**
   * Walk the registry for a chord whose first step matches `first` AND whose
   * second step matches `second`. Returns the first action found (later
   * registrations win on collision via reverse iteration, mirroring
   * `registry.resolve()`).
   */
  #findChord(
    first: HotkeyEventLike,
    second: HotkeyEventLike,
    platform: Platform,
  ): KeyboardAction | null {
    const actions = Array.from(this.#registry.list());
    for (let i = actions.length - 1; i >= 0; i--) {
      const action = actions[i] as KeyboardAction;
      if (action.hotkey === undefined) continue;
      const parsed = parseHotkey(action.hotkey);
      if (parsed.steps.length !== 2) continue;
      const [s1, s2] = parsed.steps;
      if (s1 === undefined || s2 === undefined) continue;
      if (!matchStep(s1, first, platform)) continue;
      if (!matchStep(s2, second, platform)) continue;
      return action;
    }
    return null;
  }

  #begin(event: HotkeyEventLike): void {
    const timer = this.#setTimer(() => {
      // Timeout fired — discard the pending key silently. The user pressed
      // `g` and then nothing happened within the window; treating that as
      // "abandoned" is the right call (vs. firing some default action).
      this.#pending = null;
    }, this.#timeoutMs);
    this.#pending = { event, timer };
  }

  #clear(): void {
    if (this.#pending !== null) {
      this.#clearTimer(this.#pending.timer);
      this.#pending = null;
    }
  }
}
