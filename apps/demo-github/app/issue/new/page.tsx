// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';

/**
 * `/issue/new` — compact issue creation form, rendered through the
 * manifest pipeline. See `lib/manifests.ts#newIssueManifest`.
 *
 * The manifest declares a `<Form>` with the `submit.capability:
 * github.issue.create` binding. `confirmation: 'modal'` gates the
 * destructive (`post` side-effect) capability; the ambient `<UndoToast>`
 * surfaces the `issue.close` rollback when the rule fires.
 */

import { CirRoute } from '@atelier/react';

export default function NewIssuePage(): React.JSX.Element {
  return <CirRoute path="/issue/new" />;
}
