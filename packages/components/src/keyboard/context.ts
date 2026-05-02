// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * `KeyboardContext` — React context that carries `@atelier/keyboard` services
 * down the tree. Wave 11 / Int-3.
 *
 * Lives in `@atelier/components` (not `@atelier/react`) for the same reason the
 * `IconResolverContext` does: the `<CommandPalette>` baseline component
 * needs to read it without forcing `@atelier/components` to depend on
 * `@atelier/react` (which depends on `@atelier/components` transitively for
 * tests). Hosts wire the provider via `<KeyboardProvider>` from
 * `@atelier/react`; that provider sets THIS context.
 *
 * The default value is `null` so consumers can detect a missing provider
 * and degrade gracefully — `<CommandPalette>` falls back to its `commands`
 * prop when no provider is in scope.
 */
import { createContext, useContext } from 'react';
import type { KeyboardServices } from '@atelier/keyboard';

export const KeyboardContext = createContext<KeyboardServices | null>(null);

/** Reads the context. Returns `null` when no provider is in scope. */
export function useKeyboardServicesFromContext(): KeyboardServices | null {
  return useContext(KeyboardContext);
}
