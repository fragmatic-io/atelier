// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * `<KeyboardProvider>` — Wave 11 / Int-3.
 *
 * Wraps a subtree, exposes `KeyboardServices` on context, and listens for
 * `keydown` events at the document level. When the registry resolves an
 * event to a `KeyboardAction`, we:
 *
 *   1. Bump the recency tracker (so subsequent palette renders weight it).
 *   2. Invoke the action.
 *   3. Prevent the browser's default + stop propagation so host-page
 *      keybindings don't double-fire.
 *
 * ## Input filtering
 *
 * Hotkeys do NOT fire when the event target is a text-input surface
 * (`<input type="text">`, `<textarea>`, `[contenteditable]`). This is the
 * web-app convention every reference app (Linear, Notion, Stripe, Raycast)
 * follows, and avoids "I typed `k` in a search box and the palette opened".
 *
 * Modifier-bearing hotkeys (anything carrying `cmd` / `ctrl` / `meta` /
 * `alt`) are still allowed inside inputs — `Cmd+K` should always open the
 * palette no matter what the user is typing into.
 *
 * ## Scope nesting
 *
 * Multiple providers can nest. The innermost wins for `useKeyboardRegistry()`
 * lookups. The keydown listener attaches to `document`, so duplicated
 * providers would double-fire — hosts should only mount one. (Tests use a
 * dedicated registry per test to side-step the document-level singleton.)
 */
import { useEffect, useMemo, type ReactNode } from 'react';
import {
  canonicalEventKey,
  ChordStateMachine,
  detectPlatform,
  InMemoryKeyboardRegistry,
  InMemoryRecencyTracker,
  NoopRecencyTracker,
  type HotkeyEventLike,
  type KeyboardAction,
  type KeyboardServices,
  type Platform,
} from '@atelier/keyboard';
import { KeyboardContext } from './context.js';

export interface KeyboardProviderProps {
  /**
   * Optional explicit services. When omitted, the provider builds an
   * in-memory registry + in-memory recency tracker on first render. Hosts
   * that need persistence (vault-backed recency, server-shared registry)
   * pass their own `services`.
   */
  services?: KeyboardServices;
  /**
   * Override platform detection. Defaults to runtime `navigator` sniffing.
   * Tests pass `'mac'` / `'other'` directly.
   */
  platform?: Platform;
  /**
   * Disable the document-level listener. Useful in tests that exercise the
   * registry directly without DOM events. Defaults to `false`.
   */
  disableEventListener?: boolean;
  children: ReactNode;
}

function isTextInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const tag = target.tagName;
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type.toLowerCase();
    // `type="search"` is also a text-input surface — palette internals filter
    // their OWN input, but external `<input type="search">` on the page should
    // also block bare hotkeys.
    return ['text', 'search', 'email', 'url', 'tel', 'password', 'number'].includes(type);
  }
  // `contenteditable="true"` (or `"plaintext-only"`) — Notion-style block
  // editors live here.
  if ((target as HTMLElement).isContentEditable) return true;
  return false;
}

function hasModifier(event: HotkeyEventLike): boolean {
  return event.ctrlKey || event.metaKey || event.altKey;
}

/**
 * Bump recency, invoke the action, and route any rejection / throw through
 * a console warning. Extracted so the chord-fire and single-step-fire paths
 * share the same lifecycle (recency-before-invoke, errors-don't-bubble).
 */
function fireAction(action: KeyboardAction, services: KeyboardServices): void {
  // Bump recency BEFORE invoking so async invokes don't lose the bump
  // if their promise rejects.
  const recency = services.recency ?? NoopRecencyTracker;
  recency.bump(action.id);
  try {
    const result = action.invoke();
    if (result instanceof Promise) {
      result.catch((err: unknown) => {
        console.warn(`[cir] keyboard action "${action.id}" rejected`, err);
      });
    }
  } catch (err) {
    console.warn(`[cir] keyboard action "${action.id}" threw`, err);
  }
}

export function KeyboardProvider({
  services,
  platform,
  disableEventListener,
  children,
}: KeyboardProviderProps): ReactNode {
  // Build a default services bag once; tests / hosts that pass `services`
  // skip this allocation. The dependency on `services` is intentional — a
  // host swapping registries mid-tree is unusual but supported.
  const value = useMemo<KeyboardServices>(() => {
    if (services !== undefined) return services;
    return {
      registry: new InMemoryKeyboardRegistry(),
      recency: new InMemoryRecencyTracker(),
    };
  }, [services]);

  // Chord state machine — Wave 11 / Int-7. Built once per services bag so
  // pending state survives across keydown ticks. Hosts that swap services
  // mid-tree get a fresh chord machine (correct: aliases / registry change).
  const chord = useMemo(() => new ChordStateMachine(value.registry), [value]);

  useEffect(() => {
    if (disableEventListener) return;
    if (typeof document === 'undefined') return;

    const onKeyDown = (event: KeyboardEvent): void => {
      const eventLike: HotkeyEventLike = {
        key: event.key,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
      };
      // Bare-key hotkeys never fire from inside text-input surfaces.
      // Modified hotkeys (Cmd+K, Ctrl+Shift+P) DO fire — those are
      // command-bar conventions every web app honours. A chord that's
      // mid-flight is also cancelled so the user typing into a search box
      // doesn't accidentally fire `g i`.
      if (!hasModifier(eventLike) && isTextInputTarget(event.target)) {
        chord.cancel();
        return;
      }
      // Escape cancels a pending chord without firing — even when no
      // single-step `Escape` action is registered. Mirrors Linear / Vim.
      if (chord.isPending && canonicalEventKey(event.key) === 'escape') {
        chord.cancel();
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const resolvedPlatform = platform ?? detectPlatform();
      // Modifier-bearing keystrokes never participate in chord matching —
      // chords are bare-key sequences (`g i`). Skip the chord layer entirely
      // so `Cmd+G` doesn't get swallowed mid-chord.
      if (!hasModifier(eventLike)) {
        const intent = chord.feed(eventLike, resolvedPlatform);
        if (intent.kind === 'pending') {
          // Captured the first key of a chord — suppress defaults so the
          // bare `g` doesn't reach a focused search box, then wait.
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (intent.kind === 'fire') {
          event.preventDefault();
          event.stopPropagation();
          fireAction(intent.action, value);
          return;
        }
        // 'passthrough' — fall through to the single-step resolver below.
      }
      const action = value.registry.resolve(eventLike, resolvedPlatform, value.aliases);
      if (!action) return;
      // Suppress the browser default before invoking — prevents the action
      // from racing browser-level Cmd+K behaviour (Firefox: search bar focus).
      event.preventDefault();
      event.stopPropagation();
      fireAction(action, value);
    };

    // `capture: true` so the listener wins over deeper handlers that might
    // call `stopPropagation()`. Necessary for routes that mount their own
    // keydown handlers (e.g. an editor inside the manifest tree).
    document.addEventListener('keydown', onKeyDown, { capture: true });
    return () => {
      document.removeEventListener('keydown', onKeyDown, { capture: true });
    };
  }, [value, platform, disableEventListener, chord]);

  return <KeyboardContext.Provider value={value}>{children}</KeyboardContext.Provider>;
}
KeyboardProvider.displayName = 'KeyboardProvider';
