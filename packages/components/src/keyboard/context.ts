// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';
/**
 * `KeyboardContext` — React context that carries `@cir/keyboard` services
 * down the tree. Wave 11 / Int-3.
 *
 * Lives in `@cir/components` (not `@cir/react`) for the same reason the
 * `IconResolverContext` does: the `<CommandPalette>` baseline component
 * needs to read it without forcing `@cir/components` to depend on
 * `@cir/react` (which depends on `@cir/components` transitively for
 * tests). Hosts wire the provider via `<KeyboardProvider>` from
 * `@cir/react`; that provider sets THIS context.
 *
 * The default value is `null` so consumers can detect a missing provider
 * and degrade gracefully — `<CommandPalette>` falls back to its `commands`
 * prop when no provider is in scope.
 */
import { createContext, useContext } from 'react';
import type { KeyboardServices } from '@cir/keyboard';

export const KeyboardContext = createContext<KeyboardServices | null>(null);

/** Reads the context. Returns `null` when no provider is in scope. */
export function useKeyboardServicesFromContext(): KeyboardServices | null {
  return useContext(KeyboardContext);
}
