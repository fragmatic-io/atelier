// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Hotkey parser + matcher — Wave 11 / Int-3.
 *
 * Authors register hotkeys as compact strings: `'cmd+k'`, `'ctrl+shift+p'`,
 * `'shift+escape'`, `'?'`, `'cmd+/'`, `'g i'`. We parse those into a
 * canonical `ParsedHotkey` shape that the matcher compares against
 * platform-native `KeyboardEvent` records.
 *
 * ## Design notes
 *
 *  - **`cmd` is portable.** `'cmd+k'` matches Meta on macOS and Control on
 *    Windows/Linux. Authors who want strict-Meta or strict-Ctrl write
 *    `'meta+k'` / `'ctrl+k'` explicitly. The default `cmd` token routes to
 *    whichever `KeyboardAction.invoke` should fire on the user's platform.
 *  - **`mod` is an alias for `cmd`** — many style guides prefer it. We
 *    accept both.
 *  - **Chord support is bounded.** Two-step chords (`'g i'` — press `g`,
 *    then `i` within ~1.2s) parse here; the chord state machine itself is
 *    Int-7 scope. We expose `parseChord(...)` so a future state machine can
 *    plug in without re-parsing strings.
 *  - **Modifier-only events never match.** Pressing Shift alone never fires
 *    a hotkey — the `key` MUST be a non-modifier key. (Avoids accidental
 *    triggers while the user is composing text.)
 *  - **Inputs are ignored by default at the React layer**, not here. The
 *    hotkey matcher is pure: given two records it returns yes/no. The
 *    `<KeyboardProvider>` wrapping it filters events from `<input>` /
 *    `<textarea>` / `[contenteditable]` so pressing `'k'` inside a search
 *    box doesn't open the palette.
 */

/** Platform-detection result for the `cmd` ↔ `meta`/`ctrl` mapping. */
export type Platform = 'mac' | 'other';

/**
 * Detects the active platform from `navigator.platform` / `navigator.userAgent`
 * with safe fallbacks for non-browser environments. Cached per call —
 * platform doesn't change at runtime. Tests can pass an override directly to
 * `matchHotkey()`.
 */
export function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other';
  // `userAgentData.platform` is the modern API; `navigator.platform` is
  // deprecated but still ubiquitous. Either signal containing 'mac' is enough.
  const uaData = (navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData;
  const candidates: Array<string | undefined> = [
    uaData?.platform,
    navigator.platform,
    navigator.userAgent,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && /mac/i.test(c)) return 'mac';
  }
  return 'other';
}

/**
 * Canonical key names. Browsers spell some keys differently across platforms
 * (e.g. `'Esc'` vs `'Escape'`); we normalize on parse so the matcher only
 * compares canonical forms.
 */
const KEY_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  esc: 'escape',
  escape: 'escape',
  enter: 'enter',
  return: 'enter',
  space: ' ',
  spc: ' ',
  spacebar: ' ',
  tab: 'tab',
  up: 'arrowup',
  down: 'arrowdown',
  left: 'arrowleft',
  right: 'arrowright',
  arrowup: 'arrowup',
  arrowdown: 'arrowdown',
  arrowleft: 'arrowleft',
  arrowright: 'arrowright',
  del: 'delete',
  delete: 'delete',
  backspace: 'backspace',
  pgup: 'pageup',
  pgdn: 'pagedown',
  pageup: 'pageup',
  pagedown: 'pagedown',
  home: 'home',
  end: 'end',
  plus: '+',
  minus: '-',
  comma: ',',
  period: '.',
  slash: '/',
  question: '?',
  semicolon: ';',
  quote: "'",
});

/** A single parsed hotkey step (one key plus its required modifiers). */
export interface HotkeyStep {
  /** Canonical key (lowercase for letters; `'enter'`, `'escape'`, `'/'`, etc.) */
  key: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  /**
   * `true` when the user wrote `'cmd+…'` or `'mod+…'` — a portable modifier
   * that means Meta on macOS and Ctrl elsewhere. The matcher resolves this
   * against the active platform; the parser preserves the intent.
   */
  cmdPortable: boolean;
}

/**
 * A parsed hotkey is a non-empty sequence of steps. Single-step hotkeys
 * (the common case: `'cmd+k'`) have `steps.length === 1`. Two-step chords
 * (`'g i'`) have `steps.length === 2`.
 */
export interface ParsedHotkey {
  /** Original input string, preserved for diagnostics. */
  raw: string;
  steps: ReadonlyArray<HotkeyStep>;
}

const MODIFIER_TOKENS = new Set([
  'ctrl',
  'control',
  'shift',
  'alt',
  'opt',
  'option',
  'meta',
  'win',
  'super',
  'cmd',
  'command',
  'mod',
]);

function canonicalKey(token: string): string {
  const lower = token.toLowerCase();
  const alias = KEY_ALIASES[lower];
  if (alias !== undefined) return alias;
  // Single printable characters (letters, digits, punctuation) lowercase to
  // match `KeyboardEvent.key` for letters. Non-letter symbols (`?`, `/`,
  // `+`, `-`) survive unchanged.
  return lower;
}

/**
 * Parse a single hotkey step (e.g. `'cmd+shift+k'`). Throws on empty / unknown
 * shapes so misuse fails loudly during host setup rather than silently failing
 * to match at runtime.
 */
function parseStep(input: string): HotkeyStep {
  const raw = input.trim();
  if (raw.length === 0) {
    throw new Error('parseHotkey: empty step');
  }
  // Tokens are separated by `+`. We also allow whitespace inside a step
  // (`'cmd + k'`) for readability — strip it before splitting.
  const tokens = raw
    .split('+')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (tokens.length === 0) {
    throw new Error(`parseHotkey: empty step after splitting "${input}"`);
  }
  let ctrl = false;
  let shift = false;
  let alt = false;
  let meta = false;
  let cmdPortable = false;
  let key: string | null = null;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] as string;
    const lower = token.toLowerCase();
    if (MODIFIER_TOKENS.has(lower)) {
      switch (lower) {
        case 'ctrl':
        case 'control':
          ctrl = true;
          break;
        case 'shift':
          shift = true;
          break;
        case 'alt':
        case 'opt':
        case 'option':
          alt = true;
          break;
        case 'meta':
        case 'win':
        case 'super':
          meta = true;
          break;
        case 'cmd':
        case 'command':
        case 'mod':
          cmdPortable = true;
          break;
      }
      continue;
    }
    // First non-modifier wins; trailing tokens are an error (we don't yet
    // support multi-key combos within a single step like `'a+b'`).
    if (key !== null) {
      throw new Error(
        `parseHotkey: step "${input}" has more than one non-modifier key ("${key}", "${token}")`,
      );
    }
    key = canonicalKey(token);
  }
  if (key === null) {
    throw new Error(`parseHotkey: step "${input}" has no non-modifier key`);
  }
  return { key, ctrl, shift, alt, meta, cmdPortable };
}

/**
 * Parse a hotkey string into a sequence of steps. Whitespace separates
 * chord steps: `'g i'` → two steps, `'cmd+k'` → one step. Always returns at
 * least one step; throws on malformed input.
 */
export function parseHotkey(input: string): ParsedHotkey {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw new Error('parseHotkey: empty input');
  }
  // Collapse whitespace around `+` so `'cmd + shift + k'` parses as a single
  // step. The remaining whitespace then separates chord steps cleanly:
  // `'g i'` → `['g', 'i']`.
  const collapsed = trimmed.replace(/\s*\+\s*/g, '+');
  const stepStrings = collapsed.split(/\s+/);
  const steps = stepStrings.map(parseStep);
  return { raw: input, steps };
}

/**
 * Convenience parser for chords specifically. Returns `null` when the input
 * has only one step (callers can then route it to the single-step matcher).
 */
export function parseChord(input: string): ParsedHotkey | null {
  const parsed = parseHotkey(input);
  return parsed.steps.length > 1 ? parsed : null;
}

/**
 * Subset of `KeyboardEvent` we actually compare against. Defined as an
 * interface so tests can construct minimal records without a full DOM.
 */
export interface HotkeyEventLike {
  key: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

/**
 * Returns true when the event matches the supplied step. Pure: no side effects.
 *
 *  - `cmdPortable: true` matches Meta on `'mac'` and Ctrl elsewhere.
 *  - All other modifiers must match exactly. Pressing `'cmd+shift+k'` does
 *    NOT fire a binding registered for `'cmd+k'`.
 *  - The event's `key` is normalized through the same alias table the parser
 *    uses, so `'Escape'` → `'escape'` and the comparison is platform-stable.
 */
export function matchStep(
  step: HotkeyStep,
  event: HotkeyEventLike,
  platform: Platform = detectPlatform(),
): boolean {
  // Resolve the portable `cmd` modifier first.
  const wantsMeta = step.meta || (step.cmdPortable && platform === 'mac');
  const wantsCtrl = step.ctrl || (step.cmdPortable && platform !== 'mac');
  if (event.metaKey !== wantsMeta) return false;
  if (event.ctrlKey !== wantsCtrl) return false;
  if (event.shiftKey !== step.shift) return false;
  if (event.altKey !== step.alt) return false;
  // Normalize letters so `'k'` matches both `'k'` and `'K'` (when the platform
  // reports the latter for shift-modified key events).
  const eventKey = canonicalEventKey(event.key);
  return eventKey === step.key;
}

/**
 * Convenience wrapper over `matchStep` that operates on a single-step
 * `ParsedHotkey`. Returns `false` for chord-shaped hotkeys (call sites use
 * the chord state machine instead).
 */
export function matchHotkey(
  parsed: ParsedHotkey,
  event: HotkeyEventLike,
  platform: Platform = detectPlatform(),
): boolean {
  if (parsed.steps.length !== 1) return false;
  return matchStep(parsed.steps[0] as HotkeyStep, event, platform);
}

/**
 * Normalize a `KeyboardEvent.key` for matching. Single-character letters
 * lowercase (so shift-modified events still match the canonical `'k'`); the
 * alias table handles the named keys.
 */
export function canonicalEventKey(key: string): string {
  if (key.length === 1) {
    return key.toLowerCase();
  }
  const lower = key.toLowerCase();
  return KEY_ALIASES[lower] ?? lower;
}

/**
 * Render a parsed hotkey back to a human-readable label suitable for hint
 * chips. The `cmd` token renders as `⌘` on macOS and `Ctrl` elsewhere; named
 * keys (`escape`, `enter`) capitalize. Symbols pass through.
 */
export function formatHotkey(parsed: ParsedHotkey, platform: Platform = detectPlatform()): string {
  return parsed.steps.map((step) => formatStep(step, platform)).join(' ');
}

function formatStep(step: HotkeyStep, platform: Platform): string {
  const isMac = platform === 'mac';
  const parts: string[] = [];
  if (step.ctrl) parts.push(isMac ? '⌃' : 'Ctrl');
  if (step.cmdPortable) parts.push(isMac ? '⌘' : 'Ctrl');
  if (step.alt) parts.push(isMac ? '⌥' : 'Alt');
  if (step.shift) parts.push(isMac ? '⇧' : 'Shift');
  if (step.meta && !step.cmdPortable) parts.push(isMac ? '⌘' : 'Win');
  parts.push(formatKeyLabel(step.key));
  return parts.join(isMac ? '' : '+');
}

function formatKeyLabel(key: string): string {
  if (key.length === 1) return key.toUpperCase();
  switch (key) {
    case 'escape':
      return 'Esc';
    case 'enter':
      return 'Enter';
    case 'arrowup':
      return '↑';
    case 'arrowdown':
      return '↓';
    case 'arrowleft':
      return '←';
    case 'arrowright':
      return '→';
    case 'tab':
      return 'Tab';
    case 'backspace':
      return 'Backspace';
    case 'delete':
      return 'Del';
    case 'pageup':
      return 'PgUp';
    case 'pagedown':
      return 'PgDn';
    case 'home':
      return 'Home';
    case 'end':
      return 'End';
    case ' ':
      return 'Space';
    default:
      return key.charAt(0).toUpperCase() + key.slice(1);
  }
}
