// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * `@atelier/keyboard` — Wave 11 / Int-3.
 *
 * The keyboard registry is the marketplace primitive for "things the user
 * can do via the keyboard". It powers:
 *
 *   - `<CommandPalette>` (Cmd+K) — auto-discovers actions
 *   - `<QuickSwitcher>` (Cmd+P, Int-6) — same registry, scoped to nav
 *   - chord shortcuts (`g i`, Int-7) — chord state machine wraps `resolve()`
 *   - settings search (Int-12) — same registry, filtered to settings group
 *
 * Pure logic. No React. The React adapter (`<KeyboardProvider>`,
 * `useKeyboardAction`) lives in `@atelier/react`.
 */

export {
  type ActionRecencyTracker,
  InMemoryRecencyTracker,
  type InMemoryRecencyTrackerOptions,
  NoopRecencyTracker,
} from './recency.js';

export { type AliasOverlay, effectiveHotkey, InMemoryAliasOverlay } from './aliases.js';

export { ChordStateMachine, type ChordIntent, type ChordStateMachineOptions } from './chord.js';

export {
  canonicalEventKey,
  detectPlatform,
  formatHotkey,
  type HotkeyEventLike,
  type HotkeyStep,
  matchHotkey,
  matchStep,
  parseChord,
  parseHotkey,
  type ParsedHotkey,
  type Platform,
} from './hotkey.js';

export {
  InMemoryKeyboardRegistry,
  type KeyboardAction,
  type KeyboardRegistry,
  type KeyboardRegistryListener,
} from './registry.js';

export {
  InMemoryQuickSwitchIndex,
  type QuickSwitchIndex,
  type QuickSwitchIndexListener,
  type QuickSwitchItem,
} from './quickswitch.js';

import type { KeyboardRegistry } from './registry.js';
import type { QuickSwitchIndex } from './quickswitch.js';
import type { ActionRecencyTracker } from './recency.js';
import type { AliasOverlay } from './aliases.js';

/**
 * Aggregate services bag for the React adapter (and other adapters). Hosts
 * construct one of these at boot and pass it to `<KeyboardProvider>`.
 */
export interface KeyboardServices {
  registry: KeyboardRegistry;
  /** Optional persistence — per-user action recency for fuzzy weighting. */
  recency?: ActionRecencyTracker;
  /**
   * Optional quick-switch index — the resource counterpart to `registry`.
   * Powers `<QuickSwitcher>` (Cmd+P, Int-6). When absent, the switcher
   * falls through to its `items` prop (or renders empty).
   */
  quickswitch?: QuickSwitchIndex;
  /**
   * Optional per-user alias overlay (Wave 11 / Int-7). When provided, the
   * resolver consults the overlay before each action's declared hotkey, so
   * a user-set rebinding wins. Hosts that persist aliases (vault scope,
   * localStorage) wrap an `InMemoryAliasOverlay` with their writer; the
   * `<KeyboardProvider>` is neutral on the storage strategy.
   */
  aliases?: AliasOverlay;
}
