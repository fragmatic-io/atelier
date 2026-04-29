// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';

/**
 * `<DebugPanel>` — a floating dev-only panel showing live audit events,
 * cache stats, and token spend. Subscribes to a `StreamingAuditSink` from
 * `@cir/runtime` and re-renders on every emit.
 *
 * Render this somewhere inside `<CirRuntime>` and pass it the streaming
 * sink (the same one wired into `services.audit`). The panel is hidden by
 * default; toggle with `defaultOpen` or programmatically.
 *
 * Color coding:
 *   green  — manifest.served (cache hit, no LLM call)
 *   amber  — manifest.compiled (cold compile or recompile)
 *   blue   — action.executed
 *   red    — *.denied / *.violated / errors
 */

import { useEffect, useState } from 'react';
import type { AuditEvent } from '@cir/schemas';
import type { StreamingAuditSink } from '@cir/runtime';

export interface DebugPanelProps {
  sink: StreamingAuditSink;
  defaultOpen?: boolean;
  /**
   * Optional override for the panel position. Default 'bottom-right'.
   * The panel renders fixed inside the viewport.
   */
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  /** Max events to render at once. Default 30 (newest first). */
  maxEvents?: number;
}

interface Stats {
  total: number;
  compiled: number;
  served: number;
  cache_hit_rate: number;
  total_tokens: number;
}

const POSITION_STYLE: Record<NonNullable<DebugPanelProps['position']>, React.CSSProperties> = {
  'bottom-right': { bottom: 16, right: 16 },
  'bottom-left': { bottom: 16, left: 16 },
  'top-right': { top: 16, right: 16 },
  'top-left': { top: 16, left: 16 },
};

const EVENT_COLOR: Record<string, string> = {
  'manifest.served': '#10b981', // green
  'manifest.compiled': '#f59e0b', // amber
  'action.executed': '#3b82f6', // blue
  'action.denied': '#ef4444', // red
  'policy.violated': '#ef4444',
  'capability.changed': '#8b5cf6', // violet
  'intent.changed': '#8b5cf6',
};

function colorFor(type: string): string {
  return EVENT_COLOR[type] ?? '#6b7280';
}

function formatToken(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1)}k`;
}

export function DebugPanel(props: DebugPanelProps): React.JSX.Element {
  const { sink, defaultOpen = false, position = 'bottom-right', maxEvents = 30 } = props;
  const [open, setOpen] = useState(defaultOpen);
  const [events, setEvents] = useState<readonly AuditEvent[]>(() => sink.recent());
  const [stats, setStats] = useState<Stats>(() => sink.stats());

  useEffect(() => {
    const unsub = sink.subscribe(() => {
      setEvents(sink.recent());
      setStats(sink.stats());
    });
    return unsub;
  }, [sink]);

  const baseStyle: React.CSSProperties = {
    position: 'fixed',
    zIndex: 100,
    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
    fontSize: 12,
    color: '#1f2937',
    ...POSITION_STYLE[position],
  };

  if (!open) {
    return (
      <div data-cir-component="DebugPanel" data-cir-collapsed style={baseStyle}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            background: '#111827',
            color: 'white',
            padding: '8px 12px',
            borderRadius: 6,
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >
          🛠️ CIR · {Math.round(stats.cache_hit_rate * 100)}% hit · {formatToken(stats.total_tokens)}{' '}
          tok
        </button>
      </div>
    );
  }

  const newest = events.slice(-maxEvents).reverse();

  return (
    <div
      data-cir-component="DebugPanel"
      data-cir-open
      style={{
        ...baseStyle,
        width: 380,
        background: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          background: '#111827',
          color: 'white',
          padding: '8px 12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <strong>CIR debug · cache + audit</strong>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close"
          style={{
            background: 'transparent',
            color: 'white',
            border: 'none',
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          ×
        </button>
      </div>
      <div
        style={{
          padding: '8px 12px',
          background: '#f9fafb',
          borderBottom: '1px solid #e5e7eb',
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 8,
        }}
      >
        <Stat label="hit rate" value={`${Math.round(stats.cache_hit_rate * 100)}%`} />
        <Stat label="served" value={String(stats.served)} />
        <Stat label="compiled" value={String(stats.compiled)} />
        <Stat label="tokens" value={formatToken(stats.total_tokens)} />
      </div>
      <div style={{ maxHeight: 300, overflowY: 'auto' }}>
        {newest.length === 0 ? (
          <div style={{ padding: 16, color: '#9ca3af', textAlign: 'center' }}>
            No events yet — interact with the page.
          </div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {newest.map((e) => (
              <li
                key={e.event_id}
                style={{
                  padding: '6px 12px',
                  borderBottom: '1px solid #f3f4f6',
                  display: 'flex',
                  gap: 8,
                  alignItems: 'baseline',
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: colorFor(e.type),
                    flexShrink: 0,
                    marginTop: 4,
                  }}
                />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>{e.type}</div>
                  <div style={{ color: '#6b7280', fontSize: 11, fontFamily: 'monospace' }}>
                    {e.manifest_id ?? '—'}
                    {e.token_cost ? ` · ${formatToken(e.token_cost)} tok` : ''}
                  </div>
                </div>
                <span style={{ color: '#9ca3af', fontSize: 10, whiteSpace: 'nowrap' }}>
                  {timeAgo(e.timestamp)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div>
      <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 1000) return 'now';
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  return `${Math.floor(ms / 3_600_000)}h`;
}
