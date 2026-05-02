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

import type { KeyboardRegistry } from './registry.js';
import type { ActionRecencyTracker } from './recency.js';

/**
 * Aggregate services bag for the React adapter (and other adapters). Hosts
 * construct one of these at boot and pass it to `<KeyboardProvider>`.
 */
export interface KeyboardServices {
  registry: KeyboardRegistry;
  /** Optional persistence — per-user action recency for fuzzy weighting. */
  recency?: ActionRecencyTracker;
}
