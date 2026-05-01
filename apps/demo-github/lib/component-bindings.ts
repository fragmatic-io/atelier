// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Demo-app-specific `ComponentBinding`s. Three custom components ship in
 * `apps/demo-github/components/` and need to be referenceable from
 * manifests by name (so `<RenderNode>` can find a factory when it walks
 * the layout tree):
 *
 *   - `IssueQueue` — the rich `/today` queue surface (optimistic archive,
 *     hover-card mentions, bulk-close with verbal confirmation).
 *   - `RateLimitStatusBar` — `<StatusBar>` driven by the GitHub client's
 *     cached rate-limit snapshot.
 *   - `Wordmark` — the Octant brand lockup (octagon + wordmark).
 *
 * The runtime registers these alongside `COMPONENT_BINDINGS` (the
 * baseline catalog). Manifests today use only baseline names; these
 * custom bindings are live so future manifests can opt in by referencing
 * them directly without touching providers wiring.
 */

import type { ComponentBinding } from '@cir/runtime';
import { IssueQueue } from '@/components/IssueQueue';
import { RateLimitStatusBar } from '@/components/RateLimitStatusBar';
import { Wordmark } from '@/components/Wordmark';

export const IssueQueueBinding: ComponentBinding = {
  id: 'IssueQueue',
  factory: IssueQueue as ComponentBinding['factory'],
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
  RateLimitStatusBar: RateLimitStatusBarBinding,
  Wordmark: WordmarkBinding,
});
