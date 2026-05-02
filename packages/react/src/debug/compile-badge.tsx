// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

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
 *
 * Phase 1.5 — `compiler_model` + `duration_ms` are read off the
 * `manifest.compiled` audit event so the badge shows `compiled ·
 * gemini-2.5-pro · 8.4k tok · 1.8s` instead of just `compiled · 0 tok`.
 * The `fallback` state fires when the model name is `fallback-hand-written`
 * (the FallbackCompiler's id) so the user can tell at a glance whether
 * the LLM ran or the safety net caught it. See `docs/ethos.md` #5.
 */

import { useEffect, useState } from 'react';
import type { AuditEvent } from '@atelier/schemas';
import type { StreamingAuditSink } from '@atelier/runtime';

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
  // First pass: prefer events carrying `compiler_model` (set by the
  // server-side resolver in Phase 1.5 + bridged into the local sink by
  // each demo's fetch wrapper). Without a model the event is a stale
  // local emit — useful as a last-resort fallback but not as authoritative
  // as the bridged server data.
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i]!;
    if (manifest_id && e.manifest_id !== manifest_id) continue;
    if (e.compiler_model === undefined) continue;
    const model = e.compiler_model;
    const isFallback = model === 'fallback-hand-written';
    if (e.type === 'manifest.served') {
      return {
        type: 'served',
        ...(model !== undefined ? { model } : {}),
        tokens: e.token_cost ?? 0,
        age_ms: Date.now() - new Date(e.timestamp).getTime(),
      };
    }
    if (e.type === 'manifest.compiled') {
      return {
        type: isFallback ? 'fallback' : 'compiled',
        model,
        tokens: e.token_cost ?? 0,
        age_ms: Date.now() - new Date(e.timestamp).getTime(),
        ...(e.duration_ms !== undefined ? { duration_ms: e.duration_ms } : {}),
      };
    }
  }
  // Second pass: any compiled/served event, model-less. Ordered newest-first.
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i]!;
    if (manifest_id && e.manifest_id !== manifest_id) continue;
    if (e.type === 'manifest.served') {
      return { type: 'served', tokens: 0, age_ms: Date.now() - new Date(e.timestamp).getTime() };
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

  const modelLabel = state.model
    ? state.model.replace(/^gemini-/, '').replace(/^fallback-hand-written$/, 'fallback')
    : '';
  const tokenLabel = `${formatTokens(state.tokens)} tok`;
  const durationLabel = state.duration_ms
    ? state.duration_ms < 1000
      ? `${String(state.duration_ms)}ms`
      : `${(state.duration_ms / 1000).toFixed(1)}s`
    : '';
  const detail =
    state.type === 'compiled'
      ? [`compiled`, modelLabel, tokenLabel, durationLabel].filter(Boolean).join(' · ')
      : state.type === 'fallback'
        ? [`fallback`, tokenLabel, durationLabel].filter(Boolean).join(' · ')
        : // served: surface the originating compiler model when known so the
          // user can tell what produced the cached manifest.
          [`served`, modelLabel, formatAge(state.age_ms), '0 tok'].filter(Boolean).join(' · ');

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
