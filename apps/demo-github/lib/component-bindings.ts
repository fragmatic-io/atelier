// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Octant demo — host-side `ComponentBinding`s.
 *
 * Marketplace pivot complete: Octant now ships **zero** manifest-referenced
 * custom bindings, joining Aurora at zero. Five customs were retired:
 *
 *   - `RepoTable` → baseline `<Table>` (columns declared in the manifest).
 *   - `RateLimitStatusBar` → baseline `<StatusBar>` bound to
 *     `github.api.rate_limit`.
 *   - `OctantHeader` → `<Stack>` of `<Logo>` (octagon glyph + wordmark) +
 *     `<NavBar>` + `<StatusBar>`. Pure baseline composition.
 *   - `Wordmark` → `<Logo>` baseline (glyph + wordmark lockup).
 *   - `IssueQueue` → baseline `<Queue>` with declarative per-row `actions`
 *     and per-item `emphasis: 'high'` for salient rows. The bespoke
 *     hover-card mention previews + multi-select are deferred — see the
 *     commit body for the trade-off rationale (`docs/ethos.md` principle
 *     #11 explicitly endorses accepting plainer baseline rendering over
 *     entrenching a per-host binding).
 *
 * Manifest-referenced components live entirely in `@cir/components`; the
 * `marketplace-pressure` eval gate enforces that count == 0 going forward.
 */

import type { ComponentBinding } from '@cir/runtime';

/**
 * Custom bindings the demo registers on top of `COMPONENT_BINDINGS`.
 * Empty post-marketplace-pivot — the runtime registry IS precisely the
 * framework baseline. Future custom bindings (only when a domain shape
 * genuinely earns one — see `docs/ethos.md` principle #11) get added here
 * and the `marketplace-pressure` eval gate is updated alongside.
 */
export const DEMO_GITHUB_BINDINGS: Readonly<Record<string, ComponentBinding>> = Object.freeze({});
