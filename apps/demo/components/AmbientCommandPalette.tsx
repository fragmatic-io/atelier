// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * `<AmbientCommandPalette>` — Wave 11 / Int-3.
 *
 * Mounted ambiently by `atelier-providers.tsx` (outside the manifest tree, like
 * `<AmbientUndoBar>`). Owns the open/closed state and registers itself as
 * `palette.open` against the active `<KeyboardProvider>`. Cmd+K opens it
 * from anywhere on the page; Esc / Cmd+K-again closes.
 *
 * The palette auto-discovers commands from the registry — no manual command
 * list required. Aurora's `atelier-providers.tsx` seeds the registry with one
 * action per granted Atelier capability (`thread.archive`, `task.complete`,
 * `task.snooze`, `task.create_from_thread`) so every capability is a
 * keyboard-discoverable action.
 *
 * Why ambient (not a manifest node): per ETHOS principle #11, custom
 * bindings are a last resort. The palette is a host-level affordance that
 * should be available on every route regardless of what the LLM compiled —
 * it doesn't belong in the manifest tree any more than the undo toast does.
 */
import { useState, type ReactNode } from 'react';
import { CommandPalette } from '@atelier/components';

export function AmbientCommandPalette(): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <CommandPalette
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      placeholder="Search actions and capabilities…"
    />
  );
}
AmbientCommandPalette.displayName = 'AmbientCommandPalette';
