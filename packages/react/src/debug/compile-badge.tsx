// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';

/**
 * `<CompileBadge>` — small inline badge that surfaces, per-route, where
 * the current manifest came from and how much it cost.
 *
 *   🟢 served · 142s ago · 0 tok       (cache hit)
 *   🟡 compiled · gemini-2.5-pro · 8.4k tok · 1.8s   (fresh compile)
 *   ⚪ fallback · 0 tok                  (hand-written manifest)
 *
 * Drive it from the resolver's last `manifest.compiled` / `manifest.served`
 * audit event, or from a `ResolveResult` returned by a server endpoint.
 */

import { useEffect, useState } from 'react';
import type { AuditEvent } from '@cir/schemas';
import type { StreamingAuditSink } from '@cir/runtime';

export interface CompileBadgeProps {
  /** Filter by manifest_id; omit to show the latest event regardless. */
  manifest_id?: string;
  sink: StreamingAuditSink;
  /** Hide the badge entirely (useful in production builds). */
  hidden?: boolean;
}

interface BadgeState {
  type: 'served' | 'compiled' | 'fallback' | 'unknown';
  model?: string;
  tokens: number;
  age_ms: number;
  duration_ms?: number;
}

function deriveState(events: readonly AuditEvent[], manifest_id?: string): BadgeState {
  // Walk newest-first.
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i]!;
    if (manifest_id && e.manifest_id !== manifest_id) continue;
    if (e.type === 'manifest.served') {
      return {
        type: 'served',
        tokens: 0,
        age_ms: Date.now() - new Date(e.timestamp).getTime(),
      };
    }
    if (e.type === 'manifest.compiled') {
      return {
        type: 'compiled',
        tokens: e.token_cost ?? 0,
        age_ms: Date.now() - new Date(e.timestamp).getTime(),
      };
    }
  }
  return { type: 'unknown', tokens: 0, age_ms: 0 };
}

function formatTokens(n: number): string {
  if (n === 0) return '0';
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1)}k`;
}

function formatAge(ms: number): string {
  if (ms < 1000) return 'now';
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  return `${Math.floor(ms / 3_600_000)}h ago`;
}

const ICON: Record<BadgeState['type'], string> = {
  served: '🟢',
  compiled: '🟡',
  fallback: '⚪',
  unknown: '⚫',
};

export function CompileBadge(props: CompileBadgeProps): React.JSX.Element | null {
  const { sink, manifest_id, hidden } = props;
  const [state, setState] = useState<BadgeState>(() => deriveState(sink.recent(), manifest_id));

  useEffect(() => {
    const update = (): void => {
      setState(deriveState(sink.recent(), manifest_id));
    };
    update();
    const unsub = sink.subscribe(update);
    // Re-tick the age every 5s so "just now" rolls forward to "5s ago".
    const interval = setInterval(update, 5_000);
    return () => {
      unsub();
      clearInterval(interval);
    };
  }, [sink, manifest_id]);

  if (hidden) return null;
  if (state.type === 'unknown') return null;

  const detail =
    state.type === 'compiled'
      ? `compiled · ${formatTokens(state.tokens)} tok`
      : `served · ${formatAge(state.age_ms)} · 0 tok`;

  return (
    <span
      data-cir-component="CompileBadge"
      data-cir-state={state.type}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 11,
        fontFamily: 'ui-monospace, SFMono-Regular, monospace',
        background: '#f3f4f6',
        color: '#374151',
      }}
      title={`${state.type} (manifest ${manifest_id ?? 'latest'})`}
    >
      {ICON[state.type]} {detail}
    </span>
  );
}
