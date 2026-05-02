// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Aurora demo — host-side React components.
 *
 * Marketplace pivot (this commit): Aurora ships **zero** manifest-referenced
 * custom bindings. The four old domain bindings (`DecisionQueue`,
 * `TaskQueue`, `ThreadView`, `UndoBar`) are gone:
 *
 *   - `DecisionQueue` / `TaskQueue` → `<Queue>` baseline + per-row `actions`
 *     (declarative; runtime wires `onAction(actionId, item)` through the
 *     dispatcher).
 *   - `ThreadView` → pure `<Stack>` + `<NavBar>` + `<ButtonGroup>` +
 *     `<ChatThread>` composition.
 *   - `UndoBar` → `AmbientUndoBar` mounted at the React root (declared via
 *     `UNDO_TOAST_AMBIENT_SATISFIER` on the policy context, which satisfies
 *     `reversibility_surfaced` for every route the runtime serves).
 *
 * This file therefore exports **runtime-ambient** chrome (`Chrome`, the
 * `<AmbientUndoBar>`, the optional `<CartAddButton>` widget) only.
 * Manifest-referenced components live entirely in `@atelier/components`. The
 * `marketplace-pressure` eval gate enforces that count == 0 going forward.
 */
import type { ComponentBinding } from '@atelier/runtime';

// Wave 7a / Int-4 — optional optimistic-UI demo widget, never referenced
// from a manifest. Hosts drop it anywhere under `<CirRuntime>`.
export { CartAddButton, type CartAddButtonProps } from './CartAddButton';

// Chrome — persistent shell (status pill + color-mode toggle + dev links)
// mounted by `app/layout.tsx`. Not a `ComponentBinding`; it's a host-side
// React tree, never referenced by a manifest.
export { Chrome, applyColorMode, nextColorMode, readColorMode } from './Chrome';

// AmbientUndoBar — the runtime-ambient undo affordance. Mounted in
// `atelier-providers.tsx` outside the manifest tree. The companion
// `UNDO_TOAST_AMBIENT_SATISFIER` declaration on the policy context tells
// the validator that `reversibility_surfaced` is satisfied app-wide.
export { UndoBar as AmbientUndoBar } from './UndoBar';

// AmbientCommandPalette — Wave 11 / Int-3. Mounted in `atelier-providers.tsx`
// outside the manifest tree. Auto-discovers commands from the
// `<KeyboardProvider>` registry; Cmd+K opens it from anywhere.
export { AmbientCommandPalette } from './AmbientCommandPalette';

/**
 * Aurora ships **zero** manifest-referenced custom bindings. The merge in
 * `atelier-providers.tsx` is `{ ...COMPONENT_BINDINGS, ...DEMO_BINDINGS }`;
 * with this map empty, the runtime registry is precisely the framework
 * baseline. Future custom bindings (only when a domain shape genuinely
 * earns one — see `docs/ethos.md` principle #11) get added here and the
 * `marketplace-pressure` eval gate is updated alongside.
 */
export const DEMO_BINDINGS: Record<string, ComponentBinding> = {};
