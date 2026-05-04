// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';

/**
 * `/admin/audit` — live audit-stream viewer for the developer.
 *
 * Subscribes to `/api/cir/audit/stream` (the SSE endpoint shipped in Wave 7c)
 * and renders incoming events with:
 *   - Color-coded type chips (green: compile.* / manifest.*, red: policy.violated /
 *     action.denied, cyan: action.executed and friends, gray: anything else).
 *   - Filter chips for the most useful event types. Filters compose
 *     client-side; the SSE endpoint also supports `?type=` server-side.
 *   - Auto-scroll, with a "Pause" toggle to freeze the feed.
 *   - Skeleton placeholders before the first event arrives, so the
 *     viewer doesn't render an empty box while the stream warms up.
 *
 * Production builds gate the route at the chrome (the "Audit" link in
 * `Chrome.tsx` is dev-only). The page itself remains accessible (Next.js
 * App Router has no straightforward way to drop a route at build time
 * without a custom routing layer); production deployments rely on the
 * navigation being hidden + the route being uninteresting without a
 * dev StreamingAuditSink.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Container, Skeleton, Stack } from '@atelier/components';
import type { AuditEvent, AuditEventType } from '@atelier/schemas';

/**
 * Event type → color class. Tailwind 4 utility classes; non-Tailwind hosts
 * can re-skin via `[data-event-type=...]` selectors.
 */
const EVENT_COLOR: Readonly<Record<string, string>> = {
  'manifest.compiled': 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  'manifest.served': 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300',
  'manifest.invalidated': 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  'manifest.rolled_back':
    'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  'action.executed': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300',
  'action.denied': 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  'action.optimistic_applied': 'bg-cyan-50 text-cyan-700 dark:bg-cyan-900/20 dark:text-cyan-300',
  'action.optimistic_rolled_back':
    'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  'action.undoable_window_open': 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300',
  'action.undone': 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  'action.undo_window_expired': 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  'policy.evaluated': 'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300',
  'policy.violated': 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  'compile.budget_used': 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300',
  'compile.budget_exceeded': 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

/** Default filter chips. Hosts can switch any of them off. */
const DEFAULT_FILTERS: readonly { id: AuditEventType; label: string }[] = [
  { id: 'manifest.compiled', label: 'compile.ok' },
  { id: 'manifest.served', label: 'manifest.served' },
  { id: 'action.executed', label: 'action.executed' },
  { id: 'policy.violated', label: 'policy.violated' },
  { id: 'manifest.invalidated', label: 'invalidated' },
];

/** Cap the in-memory event buffer so a long-running tab doesn't OOM. */
const MAX_EVENTS = 500;

function colorFor(type: string): string {
  return EVENT_COLOR[type] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
}

interface FeedItem {
  key: string;
  event: AuditEvent;
}

export default function AdminAuditPage(): React.JSX.Element {
  const [events, setEvents] = useState<readonly FeedItem[]>([]);
  const [paused, setPaused] = useState(false);
  const [activeFilters, setActiveFilters] = useState<ReadonlySet<string>>(
    () => new Set(DEFAULT_FILTERS.map((f) => f.id)),
  );
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  // Subscribe to the SSE endpoint. We use the native EventSource so we get
  // auto-reconnect + proper backoff for free; the audit-stream helper at
  // `lib/audit-stream.ts` already writes valid SSE frames.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let counter = 0;
    let cancelled = false;
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/cir/audit/stream');
    } catch (err) {
      setError((err as Error).message);
      return;
    }
    const handler = (raw: MessageEvent): void => {
      if (cancelled || pausedRef.current) return;
      try {
        const parsed = JSON.parse(raw.data as string) as AuditEvent;
        const item: FeedItem = { key: `${parsed.event_id}:${String(counter++)}`, event: parsed };
        setEvents((prev) => {
          const next = [...prev, item];
          if (next.length > MAX_EVENTS) return next.slice(next.length - MAX_EVENTS);
          return next;
        });
      } catch {
        // Malformed frame — skip silently. The CLI tailer does the same.
      }
    };
    es.onopen = (): void => {
      setConnected(true);
      setError(null);
    };
    es.onerror = (): void => {
      // Don't surface — EventSource will reconnect on its own.
      setConnected(false);
    };
    // Subscribe to every known type so we receive them all and filter
    // client-side. This means flipping a filter chip is instant — we don't
    // tear down and re-establish the SSE connection.
    const KNOWN_TYPES: readonly string[] = [
      'manifest.compiled',
      'manifest.served',
      'manifest.invalidated',
      'manifest.rolled_back',
      'action.executed',
      'action.denied',
      'action.optimistic_applied',
      'action.optimistic_rolled_back',
      'action.undoable_window_open',
      'action.undone',
      'action.undo_window_expired',
      'policy.evaluated',
      'policy.violated',
      'compile.budget_used',
      'compile.budget_exceeded',
      'intent.changed',
      'capability.changed',
      'skill.changed',
      'component.changed',
    ];
    for (const t of KNOWN_TYPES) {
      es.addEventListener(t, handler);
    }
    return (): void => {
      cancelled = true;
      es?.close();
    };
  }, []);

  const visible = useMemo(
    () => events.filter((e) => activeFilters.has(e.event.type)),
    [events, activeFilters],
  );

  // Auto-scroll to the bottom on new events, unless paused.
  const tailRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (paused) return;
    const el = tailRef.current;
    if (el !== null) el.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [visible.length, paused]);

  const toggleFilter = useCallback((id: string) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <Container maxWidth="lg" padding="md">
      <Stack direction="vertical" gap="md">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Live audit stream</h1>
          <button
            type="button"
            onClick={() => {
              setPaused((p) => !p);
            }}
            data-testid="audit-pause"
            className="rounded-md border border-gray-200 dark:border-gray-700 px-2 py-1 text-sm text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            {paused ? 'Resume' : 'Pause'}
          </button>
        </div>

        {error !== null ? (
          <Alert severity="error" title="Couldn't reach audit stream">
            {error}
          </Alert>
        ) : null}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {DEFAULT_FILTERS.map((f) => {
            const on = activeFilters.has(f.id);
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  toggleFilter(f.id);
                }}
                data-testid={`audit-filter-${f.id}`}
                className={`rounded-full px-3 py-1 text-xs border ${
                  on
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700'
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        <div
          data-testid="audit-feed"
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            padding: 12,
            maxHeight: '60vh',
            overflowY: 'auto',
            background: 'var(--cir-audit-bg, transparent)',
          }}
        >
          {events.length === 0 && !connected ? (
            <Stack direction="vertical" gap="sm">
              <Skeleton shape="text-line" />
              <Skeleton shape="text-line" />
              <Skeleton shape="text-line" />
            </Stack>
          ) : visible.length === 0 ? (
            <p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>
              No matching events yet — toggle a filter chip or click around the demo.
            </p>
          ) : (
            <ul
              data-testid="audit-list"
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              {visible.map((item) => (
                <li
                  key={item.key}
                  data-event-type={item.event.type}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}
                >
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-mono ${colorFor(item.event.type)}`}
                  >
                    {item.event.type}
                  </span>
                  <span style={{ fontSize: 12, fontFamily: 'ui-monospace, monospace', flex: 1 }}>
                    {item.event.timestamp}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      fontFamily: 'ui-monospace, monospace',
                      color: '#6b7280',
                    }}
                  >
                    {item.event.event_id}
                  </span>
                </li>
              ))}
              <div ref={tailRef} />
            </ul>
          )}
        </div>
        <p style={{ color: '#6b7280', fontSize: 12, margin: 0 }}>
          {connected ? 'Connected.' : 'Reconnecting…'} {events.length} event(s) buffered (max{' '}
          {MAX_EVENTS}).
        </p>
      </Stack>
    </Container>
  );
}
