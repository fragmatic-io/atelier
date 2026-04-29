// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';
/**
 * CommandPalette — controlled, dialog-backed quick-launcher. Mirrors the
 * Modal pattern (HTML `<dialog>` for focus trap + Escape) and adds a search
 * input that filters `commands` live by label / keywords / group.
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
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import type { ComponentBinding } from '@cir/runtime';

export interface CommandPaletteCommand {
  id: string;
  label: string;
  group?: string;
  keywords?: readonly string[];
  onSelect: () => void;
}

export interface CommandPaletteProps {
  open: boolean;
  commands: readonly CommandPaletteCommand[];
  onClose: () => void;
  placeholder?: string;
  className?: string;
}

function matches(cmd: CommandPaletteCommand, q: string): boolean {
  if (q === '') return true;
  const needle = q.toLowerCase();
  if (cmd.label.toLowerCase().includes(needle)) return true;
  if (cmd.group !== undefined && cmd.group.toLowerCase().includes(needle)) return true;
  for (const kw of cmd.keywords ?? []) {
    if (kw.toLowerCase().includes(needle)) return true;
  }
  return false;
}

export function CommandPalette({
  open,
  commands,
  onClose,
  placeholder = 'Type a command…',
  className,
}: CommandPaletteProps): ReactNode {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const inputId = useId();
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);

  const filtered = useMemo(() => commands.filter((c) => matches(c, query)), [commands, query]);

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
      aria-label="Command palette"
      className={className}
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
                style={{ display: 'block', width: '100%', textAlign: 'left' }}
              >
                {cmd.group !== undefined ? (
                  <span data-cir-part="palette-group">{cmd.group}</span>
                ) : null}
                <span data-cir-part="palette-label-text">{cmd.label}</span>
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
  return `[CommandPalette: ${String(props.commands.length)} commands]`;
}

export const CommandPaletteBinding: ComponentBinding = {
  id: 'CommandPalette',
  factory: CommandPalette,
};
