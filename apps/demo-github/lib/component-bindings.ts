// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Octant demo — host-side `ComponentBinding`s.
 *
 * Marketplace pivot (this commit): four custom bindings retired by
 * collapsing onto baseline composition.
 *
 *   - `RepoTable` → baseline `<Table>` (columns declared in the manifest).
 *   - `RateLimitStatusBar` → baseline `<StatusBar>` bound to
 *     `github.api.rate_limit`.
 *   - `OctantHeader` → `<Stack>` of `<Logo>` (octagon glyph + wordmark) +
 *     `<NavBar>` + `<StatusBar>`. Pure baseline composition.
 *   - `Wordmark` → `<Logo>` baseline (glyph + wordmark lockup).
 *
 * What stays (one custom binding):
 *
 *   - `IssueQueue` — the rich queue surface with optimistic archive,
 *     hover-card mentions, salience hierarchy, and bulk actions. The
 *     marketplace plan calls for collapsing this onto `<Queue>` in a
 *     follow-up commit (it's the proof-point use case for the new
 *     baseline primitive); keeping it here for now so the github demo's
 *     interaction model is preserved while we soak the migration on
 *     Aurora first.
 *
 * The runtime registers `IssueQueue` alongside `COMPONENT_BINDINGS` (the
 * baseline catalog) AND `cir-providers.tsx` derives the
 * `composition_roles` map for `validateManifest()` from these bindings via
 * `compositionRolesFromBindings()`.
 */

import type { ComponentBinding } from '@cir/runtime';
import { IssueQueue } from '../components/IssueQueue';

export const IssueQueueBinding: ComponentBinding = {
  id: 'IssueQueue',
  factory: IssueQueue as ComponentBinding['factory'],
  compositionRole: 'list',
};

/**
 * Custom bindings the demo registers on top of `COMPONENT_BINDINGS`.
 * Spread into `MapComponentRegistry` after the baseline so manifests can
 * reference any of these names in `LayoutNode.component`.
 *
 * The `marketplace-pressure` eval gate caps this set's size so future
 * regressions ("just add another custom") are surfaced.
 */
export const DEMO_GITHUB_BINDINGS: Readonly<Record<string, ComponentBinding>> = Object.freeze({
  IssueQueue: IssueQueueBinding,
});
