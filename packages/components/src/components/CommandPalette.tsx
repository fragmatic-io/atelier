// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * CommandPalette — controlled, dialog-backed quick-launcher. Mirrors the
 * Modal pattern (HTML `<dialog>` for focus trap + Escape) and adds a search
 * input that filters `commands` live by label / keywords / group.
 *
 * Wave 11 / Int-3 upgrade:
 *
 *  - When no `commands` prop is supplied, the palette auto-discovers actions
 *    from the `<KeyboardProvider>` registry (read via the components-local
 *    `KeyboardContext`). Every registered action becomes a discoverable
 *    command — Linear-style.
 *  - Each item renders a hint chip showing its hotkey, formatted for the
 *    active platform via `formatHotkey()` (`cmd+k` → `⌘K` on macOS,
 *    `Ctrl+K` elsewhere).
 *  - Each item renders an icon via the host's `IconResolver` (Vis-3) when
 *    the action declares one — `<Icon set="lucide" name="archive">`-style.
 *  - Per-action `weight` lookups against an `ActionRecencyTracker` boost the
 *    fuzzy-match score so recently-used actions rank above equally-good
 *    text matches. The tracker is bumped on selection.
 *  - When `onOpen` is supplied AND a registry is in scope, the palette
 *    self-registers a `palette.open` action under `openHotkey` (default
 *    `cmd+k`) so Cmd+K opens it from anywhere.
 *  - Emits `data-cir-source="prop|registry"` so tests + audit tooling can
 *    tell which path is in use.
 *
 * Keyboard:
 *  - ArrowDown / ArrowUp move the highlight through the visible commands.
 *  - Enter triggers the highlighted command's `onSelect` and closes.
 *  - Escape closes (via the `<dialog>`'s `cancel` event).
 *
 * Filtering is case-insensitive substring matching against `label`, the
 * optional `group`, and any `keywords`. Commands group visually under their
 * `group` label when present.
 */
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import {
  detectPlatform,
  formatHotkey,
  parseHotkey,
  type ActionRecencyTracker,
  type KeyboardAction,
  type Platform,
} from '@atelier/keyboard';
import { useKeyboardServicesFromContext } from '../keyboard/context.js';
import { Icon } from './Icon.js';
import { cn, commandPaletteVariantClass, type CommandPaletteVariant } from './_variants.js';

const EMPTY_ACTIONS: readonly KeyboardAction[] = Object.freeze([]);

export interface CommandPaletteCommand {
  id: string;
  label: string;
  group?: string;
  keywords?: readonly string[];
  /** Optional hotkey hint (`'cmd+k'`). When present, the palette renders a chip. */
  hotkey?: string;
  /** Optional lucide icon name. Resolved through the IconResolver context. */
  icon?: string;
  onSelect: () => void;
}

export interface CommandPaletteProps {
  /** Whether the dialog is open. Always required (controlled). */
  open: boolean;
  /**
   * Static commands. When omitted, the palette auto-discovers from the
   * `<KeyboardProvider>` registry. Either a populated `commands` prop or a
   * mounted provider is required for the palette to render anything.
   */
  commands?: readonly CommandPaletteCommand[];
  onClose: () => void;
  placeholder?: string;
  className?: string;
  variant?: CommandPaletteVariant;
  /**
   * When `true` (the default), the palette registers a global `palette.open`
   * action with the active `<KeyboardProvider>` so Cmd+K opens the palette
   * from anywhere. Pass `false` if the host wires its own open shortcut.
   */
  bindOpenHotkey?: boolean;
  /** Hotkey for the auto-open action. Defaults to `'cmd+k'`. */
  openHotkey?: string;
  /**
   * Setter for `open`. Required when `bindOpenHotkey` is `true` so the
   * registered action can flip the dialog open. Optional when
   * `bindOpenHotkey` is `false`.
   */
  onOpen?: () => void;
  /**
   * Override platform detection (mostly for tests / SSR). Defaults to
   * runtime sniffing.
   */
  platform?: Platform;
}

interface ScoredCommand {
  command: CommandPaletteCommand;
  score: number;
}

function basicMatchScore(cmd: CommandPaletteCommand, q: string): number {
  if (q === '') return 1;
  const needle = q.toLowerCase();
  // Bigger boosts for label hits than keyword hits; prefix > substring.
  const label = cmd.label.toLowerCase();
  if (label === needle) return 10;
  if (label.startsWith(needle)) return 6;
  if (label.includes(needle)) return 4;
  if (cmd.group !== undefined && cmd.group.toLowerCase().includes(needle)) return 2;
  for (const kw of cmd.keywords ?? []) {
    const k = kw.toLowerCase();
    if (k === needle) return 3;
    if (k.includes(needle)) return 2;
  }
  return 0;
}

function rankCommands(
  commands: readonly CommandPaletteCommand[],
  q: string,
  recency: ActionRecencyTracker | undefined,
): ScoredCommand[] {
  const scored: ScoredCommand[] = [];
  for (const cmd of commands) {
    const base = basicMatchScore(cmd, q);
    if (base === 0) continue;
    const w = recency ? recency.weight(cmd.id) : 0;
    // Recency multiplies the base by up to 2× — a recently used action with
    // a substring match (4) beats a never-used action with a prefix match
    // (6) only when the recent one was used very recently. Tuned by hand.
    const score = base * (1 + w);
    scored.push({ command: cmd, score });
  }
  // Stable sort by score desc, falling back to label asc for determinism.
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.command.label.localeCompare(b.command.label);
  });
  return scored;
}

function actionToCommand(
  action: KeyboardAction,
  bumpAndInvoke: (action: KeyboardAction) => void,
): CommandPaletteCommand {
  return {
    id: action.id,
    label: action.label,
    ...(action.group !== undefined ? { group: action.group } : {}),
    ...(action.keywords !== undefined ? { keywords: action.keywords } : {}),
    ...(action.hotkey !== undefined ? { hotkey: action.hotkey } : {}),
    ...(action.icon !== undefined ? { icon: action.icon } : {}),
    onSelect: () => bumpAndInvoke(action),
  };
}

export function CommandPalette({
  open,
  commands,
  onClose,
  placeholder = 'Type a command…',
  className,
  variant = 'default',
  bindOpenHotkey = true,
  openHotkey = 'cmd+k',
  onOpen,
  platform,
}: CommandPaletteProps): ReactNode {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const inputId = useId();
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);

  const activePlatform = platform ?? detectPlatform();

  // -- Auto-discovery from the keyboard registry -----------------------------
  // We read services via the components-local `KeyboardContext` so this
  // baseline component doesn't take a runtime dependency on `@atelier/react`.
  // The `<KeyboardProvider>` (also in `@atelier/components`) sets the same
  // context.
  const services = useKeyboardServicesFromContext();
  const recency = services?.recency;
  const registryActions = useSyncExternalStore<readonly KeyboardAction[]>(
    (cb) => (services ? services.registry.subscribe(cb) : (): void => undefined),
    () => (services ? services.registry.list() : EMPTY_ACTIONS),
    () => (services ? services.registry.list() : EMPTY_ACTIONS),
  );

  // Bump recency on action invocation. `useCallback` so the synthesized
  // commands array below stays stable across renders.
  const bumpAndInvoke = useCallback(
    (action: KeyboardAction) => {
      recency?.bump(action.id);
      try {
        const result = action.invoke();
        if (result instanceof Promise) {
          result.catch((err: unknown) => {
            console.warn(`[cir] command palette: action "${action.id}" rejected`, err);
          });
        }
      } catch (err) {
        console.warn(`[cir] command palette: action "${action.id}" threw`, err);
      }
    },
    [recency],
  );

  const sourceIsProp = commands !== undefined;
  const effectiveCommands: readonly CommandPaletteCommand[] = useMemo(() => {
    if (commands !== undefined) return commands;
    return (
      registryActions
        // Don't list the palette's own self-open action — opening the palette
        // while the palette is open would be a confusing affordance.
        .filter((a) => a.id !== 'palette.open')
        .map((a) => actionToCommand(a, bumpAndInvoke))
    );
  }, [commands, registryActions, bumpAndInvoke]);

  // -- Auto-open hotkey ------------------------------------------------------
  // Register a `palette.open` action against the active registry so Cmd+K
  // (or whatever `openHotkey` is) opens the palette from anywhere. The
  // registration is gated on the host having both wired a provider AND
  // supplied `onOpen`; absent either, we skip silently.
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  const shouldBindOpen = bindOpenHotkey && onOpen !== undefined && services !== null;
  useEffect(() => {
    if (!shouldBindOpen || !services) return;
    const action: KeyboardAction = {
      id: 'palette.open',
      label: 'Open command palette',
      description: 'Search and run any registered action',
      hotkey: openHotkey,
      scope: 'global',
      group: 'Palette',
      icon: 'search',
      invoke: () => {
        const fn = onOpenRef.current;
        if (fn) fn();
      },
    };
    const unregister = services.registry.register(action);
    return () => {
      unregister();
    };
  }, [shouldBindOpen, services, openHotkey]);

  const scored = useMemo(
    () => rankCommands(effectiveCommands, query, recency),
    [effectiveCommands, query, recency],
  );
  const filtered = useMemo(() => scored.map((s) => s.command), [scored]);

  // Sync open/close with native <dialog> state.
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      if (typeof dlg.showModal === 'function') {
        try {
          dlg.showModal();
        } catch {
          dlg.setAttribute('open', '');
        }
      } else {
        dlg.setAttribute('open', '');
      }
    } else if (!open && dlg.open) {
      if (typeof dlg.close === 'function') dlg.close();
      else dlg.removeAttribute('open');
    }
  }, [open]);

  // Reset query + highlight when re-opening so a stale state never persists.
  useEffect(() => {
    if (open) {
      setQuery('');
      setHighlight(0);
    }
  }, [open]);

  // Mirror native cancel (Escape) onto onClose.
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    const onCancel = (e: Event): void => {
      e.preventDefault();
      onClose();
    };
    dlg.addEventListener('cancel', onCancel);
    return (): void => {
      dlg.removeEventListener('cancel', onCancel);
    };
  }, [onClose]);

  // Clamp highlight when filtered shrinks.
  useEffect(() => {
    if (highlight >= filtered.length) {
      setHighlight(filtered.length === 0 ? 0 : filtered.length - 1);
    }
  }, [filtered.length, highlight]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => (filtered.length === 0 ? 0 : (h + 1) % filtered.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) =>
        filtered.length === 0 ? 0 : (h - 1 + filtered.length) % filtered.length,
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = filtered[highlight];
      if (cmd) {
        cmd.onSelect();
        onClose();
      }
    }
  };

  return (
    <dialog
      ref={dialogRef}
      data-cir-component="CommandPalette"
      data-variant={variant}
      data-cir-source={sourceIsProp ? 'prop' : 'registry'}
      aria-label="Command palette"
      className={cn(commandPaletteVariantClass[variant], className)}
    >
      <div data-cir-part="palette-search">
        <label htmlFor={inputId} data-cir-part="palette-label">
          Command
        </label>
        <input
          id={inputId}
          type="search"
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.currentTarget.value);
          }}
          onKeyDown={onKeyDown}
          data-cir-part="palette-input"
          autoFocus
        />
      </div>
      <ul role="listbox" data-cir-part="palette-list" aria-label="Commands">
        {filtered.length === 0 ? (
          <li data-cir-part="palette-empty" role="presentation">
            No matching commands.
          </li>
        ) : (
          filtered.map((cmd, i) => (
            <li
              key={cmd.id}
              role="option"
              aria-selected={i === highlight}
              data-cir-part="palette-item"
              data-highlighted={i === highlight ? 'true' : 'false'}
              data-group={cmd.group ?? ''}
            >
              <button
                type="button"
                onClick={() => {
                  cmd.onSelect();
                  onClose();
                }}
                onMouseEnter={() => {
                  setHighlight(i);
                }}
                style={{
                  display: 'flex',
                  width: '100%',
                  textAlign: 'left',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                {cmd.icon !== undefined ? (
                  <span data-cir-part="palette-icon">
                    <Icon set="lucide" name={cmd.icon} ariaLabel={cmd.label} />
                  </span>
                ) : null}
                <span style={{ flex: 1 }}>
                  {cmd.group !== undefined ? (
                    <span data-cir-part="palette-group">{cmd.group}</span>
                  ) : null}
                  <span data-cir-part="palette-label-text">{cmd.label}</span>
                </span>
                {cmd.hotkey !== undefined ? (
                  <kbd data-cir-part="palette-hotkey">
                    {formatHotkey(parseHotkey(cmd.hotkey), activePlatform)}
                  </kbd>
                ) : null}
              </button>
            </li>
          ))
        )}
      </ul>
    </dialog>
  );
}

CommandPalette.displayName = 'CommandPalette';

export function commandPaletteTextRender(props: CommandPaletteProps): string {
  const count = props.commands?.length ?? 0;
  return `[CommandPalette: ${String(count)} commands]`;
}

export const CommandPaletteBinding: ComponentBinding = {
  id: 'CommandPalette',
  factory: CommandPalette,
};
