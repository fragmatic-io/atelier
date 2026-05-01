// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';

/**
 * `/inbox` — notifications surface using the inbox-zero skill. Rendered
 * through the manifest pipeline; see `lib/manifests.ts#inboxManifest`.
 *
 * The manifest binds `github.issue.list` filtered to issues that mention
 * the current user, sorted by `updated_at desc`. Optimistic archive is
 * surfaced via `actions: ['github.issue.archive']` and the ambient
 * `<UndoToast>` sibling.
 */

import { CirRoute } from '@cir/react';

export default function InboxPage(): React.JSX.Element {
  return <CirRoute path="/inbox" />;
}
