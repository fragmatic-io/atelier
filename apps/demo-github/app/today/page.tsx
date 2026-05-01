// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';

/**
 * `/today` — the decision queue, rendered through the manifest pipeline.
 *
 * The page is a thin shell over `<CirRoute>`. The runtime resolves the
 * manifest declared in `lib/manifests.ts#todayManifest` (via
 * `manifestForRoute('/today')`), validates it against the baseline policy
 * set, and walks the layout tree with `<RenderNode>`. Custom components
 * (`IssueQueue`, `RateLimitStatusBar`, `Wordmark`) are registered as
 * `ComponentBinding`s in `lib/component-bindings.ts` so manifests can
 * reference them by name alongside the baseline catalog.
 *
 * Pre-conversion this file imported `<IssueQueue>` directly as JSX, which
 * undermined the CIR thesis: every page is a manifest the runtime renders.
 * See MD-C in `/Users/vid/cir/docs/wave-progress.md` for the rationale.
 */

import { CirRoute } from '@cir/react';

export default function TodayPage(): React.JSX.Element {
  return <CirRoute path="/today" />;
}
