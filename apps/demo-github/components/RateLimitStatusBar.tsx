// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';

/**
 * `RateLimitStatusBar` — a `<StatusBar>` driven by the GitHub client's
 * cached rate-limit snapshot. Polls every 10 seconds (cheap, no network
 * — the snapshot updates whenever a real call happens; polling just
 * pulls the latest cached value into React state).
 *
 * Three buckets: operational (green), degraded (yellow when <25 %
 * remaining), incident (red when 0 remaining or <10 %). Pairs with
 * `lib/github-client.ts` `classifyRateLimit`.
 */

import { useEffect, useState } from 'react';
import { StatusBar } from '@cir/components';
import { getRateLimitState, type RateLimitState } from '../lib/github-client';

function format(state: RateLimitState): { message: string; detail: string } {
  if (state.last_updated === 0) {
    return {
      message: 'GitHub API · operational',
      detail: 'Authenticated rate-limit window resets hourly.',
    };
  }
  const message = `GitHub API · ${String(state.remaining)} / ${String(state.limit)}`;
  const reset = state.reset_at > 0 ? new Date(state.reset_at * 1000).toLocaleTimeString() : 'soon';
  const detail =
    state.status === 'operational'
      ? `Plenty of headroom. Window resets at ${reset}.`
      : state.status === 'degraded'
        ? `Approaching limit. Window resets at ${reset}.`
        : `Rate limit exhausted. Window resets at ${reset}.`;
  return { message, detail };
}

export function RateLimitStatusBar(): React.JSX.Element {
  const [state, setState] = useState<RateLimitState>(getRateLimitState());

  useEffect(() => {
    const id = setInterval(() => {
      setState(getRateLimitState());
    }, 10_000);
    return () => clearInterval(id);
  }, []);

  const { message, detail } = format(state);

  return (
    <StatusBar
      status={
        state.status === 'operational'
          ? 'operational'
          : state.status === 'degraded'
            ? 'degraded'
            : 'incident'
      }
      message={message}
      detail={detail}
      variant="compact"
      href="/settings/github"
    />
  );
}
