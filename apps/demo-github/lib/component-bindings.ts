// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Demo-app-specific `ComponentBinding`s. The custom components ship in
 * `apps/demo-github/components/` and need to be referenceable from
 * manifests by name (so `<RenderNode>` can find a factory when it walks
 * the layout tree):
 *
 *   - `IssueQueue` — the rich `/today` queue surface (optimistic archive,
 *     hover-card mentions, bulk-close with verbal confirmation).
 *     `compositionRole: 'list'` so the policy engine treats it the same
 *     as a baseline `<List>` for the long-list-hierarchy and
 *     empty/loading/error obligations.
 *   - `RepoTable` — the dense `/repos` table with hover-card previews on
 *     each row's name and an inline "Create issue" affordance.
 *     `compositionRole: 'table'` for the same reason.
 *   - `OctantHeader` — the persistent app chrome (wordmark + nav +
 *     small rate-limit chip). No composition role — it's a leaf chrome
 *     component, not a long list.
 *   - `RateLimitStatusBar` — `<StatusBar>` driven by the GitHub client's
 *     cached rate-limit snapshot. Kept for legacy manifests.
 *   - `Wordmark` — the Octant brand lockup (octagon + wordmark).
 *
 * The runtime registers these alongside `COMPONENT_BINDINGS` (the
 * baseline catalog) AND `cir-providers.tsx` derives the
 * `composition_roles` map for `validateManifest()` from these bindings
 * via `compositionRolesFromBindings()`.
 */

import type { ComponentBinding } from '@cir/runtime';
import { IssueQueue } from '../components/IssueQueue';
import { OctantHeader } from '../components/OctantHeader';
import { RateLimitStatusBar } from '../components/RateLimitStatusBar';
import { RepoTable } from '../components/RepoTable';
import { Wordmark } from '../components/Wordmark';

export const IssueQueueBinding: ComponentBinding = {
  id: 'IssueQueue',
  factory: IssueQueue as ComponentBinding['factory'],
  compositionRole: 'list',
};

export const RepoTableBinding: ComponentBinding = {
  id: 'RepoTable',
  factory: RepoTable as ComponentBinding['factory'],
  compositionRole: 'table',
};

export const OctantHeaderBinding: ComponentBinding = {
  id: 'OctantHeader',
  factory: OctantHeader as ComponentBinding['factory'],
};

export const RateLimitStatusBarBinding: ComponentBinding = {
  id: 'RateLimitStatusBar',
  factory: RateLimitStatusBar as ComponentBinding['factory'],
};

export const WordmarkBinding: ComponentBinding = {
  id: 'Wordmark',
  factory: Wordmark as ComponentBinding['factory'],
};

/**
 * All custom bindings the demo registers on top of `COMPONENT_BINDINGS`.
 * Spread into `MapComponentRegistry` after the baseline so manifests can
 * reference any of these names in `LayoutNode.component`.
 */
export const DEMO_GITHUB_BINDINGS: Readonly<Record<string, ComponentBinding>> = Object.freeze({
  IssueQueue: IssueQueueBinding,
  RepoTable: RepoTableBinding,
  OctantHeader: OctantHeaderBinding,
  RateLimitStatusBar: RateLimitStatusBarBinding,
  Wordmark: WordmarkBinding,
});
