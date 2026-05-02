// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Keyboard adapter — Wave 11 / Int-3.
 *
 * `<KeyboardProvider>`, hooks, and the `KeyboardContext`. Lives in
 * `@cir/components` (alongside `<CommandPalette>` and the `IconResolver`)
 * so the baseline component library doesn't need a runtime dependency on
 * `@cir/react`. The CIR React adapter (`@cir/react`) re-exports this
 * surface for convenience so hosts can `import { KeyboardProvider } from
 * '@cir/react'` without knowing the precise package layout.
 */
export { KeyboardContext, useKeyboardServicesFromContext } from './context.js';
export { KeyboardProvider, type KeyboardProviderProps } from './provider.js';
export {
  useKeyboard,
  useKeyboardAction,
  useKeyboardActions,
  useKeyboardRegistry,
} from './hooks.js';
