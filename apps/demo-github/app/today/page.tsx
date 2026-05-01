// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';

/**
 * `/today` — the decision queue, rendered through the manifest pipeline.
 *
 * The page is a thin shell over `<CirRoute>`. The runtime resolves the
 * manifest declared in `lib/manifests.ts#todayManifest` (via
 * `manifestForRoute('/today')`), validates it against the baseline policy
 * set, and walks the layout tree with `<RenderNode>`. The manifest's
 * `<Queue>` (baseline) is bound to `github.issue.list` and dispatches
 * archive / close through the action registry — no host-side React for
 * the queue surface any more (the `<IssueQueue>` custom retired in the
 * marketplace pivot, leaving Octant at zero custom bindings).
 *
 * Pre-MD-C this file imported `<IssueQueue>` directly as JSX, which
 * undermined the CIR thesis: every page is a manifest the runtime renders.
 * See MD-C in `/Users/vid/cir/docs/wave-progress.md` for the rationale.
 */

import { CirRoute } from '@cir/react';

export default function TodayPage(): React.JSX.Element {
  return <CirRoute path="/today" />;
}
