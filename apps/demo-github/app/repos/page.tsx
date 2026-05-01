// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';

/**
 * `/repos` — the repository browser, rendered through the manifest
 * pipeline.
 *
 * Thin `<CirRoute>` shell. The manifest in `lib/manifests.ts#reposManifest`
 * declares a `<Table>` bound to `github.repo.list` with `hoverCard: true`
 * and an `actions: ['github.issue.create']` deep-link to `/issue/new`.
 * The runtime composes the table, filter bar, status / rate-limit chips,
 * and empty/loading/error siblings from the manifest tree.
 */

import { CirRoute } from '@cir/react';

export default function ReposPage(): React.JSX.Element {
  return <CirRoute path="/repos" />;
}
