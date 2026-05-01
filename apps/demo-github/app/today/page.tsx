// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';

/**
 * `/today` — the decision queue. The route renders a chrome of
 * status / KPI / queue and embeds the `IssueQueue` component which
 * carries the optimistic-archive, hover-card, and bulk-action
 * affordances.
 *
 * The `/today` queue is the showcase's biggest moment — see
 * `apps/demo-github/README.md` for the walkthrough.
 */

import { Stack } from '@cir/components';
import { IssueQueue } from '@/components/IssueQueue';
import { RateLimitStatusBar } from '@/components/RateLimitStatusBar';

export default function TodayPage(): React.JSX.Element {
  return (
    <main className="max-w-screen-lg mx-auto px-4 py-6">
      <Stack direction="vertical" gap="lg">
        <RateLimitStatusBar />
        <h1 className="text-xl font-semibold">Today</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Issues sorted by salience. The top three get hierarchy emphasis; archive is optimistic
          with a 5-second undo. Hover any <span className="text-fuchsia-600">#NNN</span> reference
          for a card preview.
        </p>
        <IssueQueue />
      </Stack>
    </main>
  );
}
