// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Public re-exports for the dev-only debug surface.
 *
 * Imported by host apps under `@atelier/react/debug` (see the subpath export in
 * `packages/react/package.json`). The `cir init` template wires
 * `<DebugPanel>` into `app/layout.tsx` behind a `process.env.NODE_ENV ===
 * 'development'` gate; production bundles never include this module.
 *
 * Pair with `cir dev --tail` for terminal-side observability of the same
 * audit stream.
 */

export { CompileBadge, type CompileBadgeProps } from './compile-badge.js';
export { DebugPanel, type DebugPanelProps } from './debug-panel.js';
