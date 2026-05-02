// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';

/**
 * `/issue/[id]` — issue detail view, rendered through the manifest
 * pipeline. See `lib/manifests.ts#issueDetailManifest`.
 *
 * The manifest declares a `<DetailView>` bound to `github.issue.get`, a
 * `<Timeline>` of comment events, and an action bar where the destructive
 * `github.issue.close` Button sits as a sibling of its `github.issue.reopen`
 * rollback (so `reversibility_surfaced` is satisfied at the layout level).
 */

import { use } from 'react';
import { CirRoute } from '@atelier/react';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function IssueDetailPage({ params }: PageProps): React.JSX.Element {
  const { id } = use(params);
  return <CirRoute path={`/issue/${id}`} />;
}
