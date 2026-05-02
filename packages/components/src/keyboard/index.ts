// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Keyboard adapter — Wave 11 / Int-3.
 *
 * `<KeyboardProvider>`, hooks, and the `KeyboardContext`. Lives in
 * `@atelier/components` (alongside `<CommandPalette>` and the `IconResolver`)
 * so the baseline component library doesn't need a runtime dependency on
 * `@atelier/react`. The Atelier React adapter (`@atelier/react`) re-exports this
 * surface for convenience so hosts can `import { KeyboardProvider } from
 * '@atelier/react'` without knowing the precise package layout.
 */
export { KeyboardContext, useKeyboardServicesFromContext } from './context.js';
export { KeyboardProvider, type KeyboardProviderProps } from './provider.js';
export {
  useKeyboard,
  useKeyboardAction,
  useKeyboardActions,
  useKeyboardRegistry,
} from './hooks.js';
