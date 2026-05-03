// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * ActivityFeed — Wave 11 / Cnt-9. A vertical timeline of typed events with
 * collapse-by-default diff + structured-payload disclosures. Mirrors the
 * shape Linear / Stripe ship in their activity / events logs.
 *
 * Each event carries:
 *   - `type` (machine label, e.g. `status_changed`) + `label` (human label).
 *   - Optional `actor` (avatar + name) and an ISO `timestamp`.
 *   - Optional `diff` — a `DiffHunk[]` rendered inline through `<DiffView>`.
 *   - Optional `payload` — an arbitrary structured value rendered as a
 *     pretty-printed JSON tree (Stripe's events log uses the same affordance).
 *   - Optional `group` — adjacent events with the same group key collapse
 *     into a single row labelled "X $label N times".
 *
 * Collapse policy: diff + payload start collapsed. `expandDiffsByDefault`
 * flips the default for diffs only; payload always starts collapsed (the
 * payload is typically large and high-signal-on-demand only). Both can be
 * toggled per-row.
 *
 * Pagination: when `onLoadMore` is provided, the component watches its own
 * scroll viewport and fires the callback once when the user scrolls within
 * `LOAD_MORE_THRESHOLD_PX` of the bottom. Re-firing waits for the parent's
 * promise to resolve so a single threshold crossing fires at most once.
 *
 * Stateless about ordering: the caller hands events in render order (typically
 * newest first). The component does not sort or de-duplicate — manifest
 * authors keep the contract obvious.
 */
import { useCallback, useRef, useState, type ReactNode } from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import { DiffView, type DiffHunk, type LegacyDiffRow } from './DiffView.js';
import { cn, activityFeedVariantClass, type ActivityFeedVariant } from './_variants.js';

/**
 * `<DiffView>` accepts both the post-Cnt-2 hunk shape and the pre-Cnt-2 flat
 * row shape; we re-export the same union here so manifest authors can pass
 * either to an event's `diff` field without redirecting through DiffView.
 */
export type ActivityDiff = DiffHunk | LegacyDiffRow;

/** Distance from the bottom (px) at which `onLoadMore` fires. */
export const LOAD_MORE_THRESHOLD_PX = 64;

export interface ActivityActor {
  id: string;
  name: string;
  avatarUrl?: string;
}

export interface ActivityEvent {
  id: string;
  /** Event type (e.g. 'status_changed', 'label_added'). */
  type: string;
  /** Human-readable label. */
  label: string;
  actor?: ActivityActor;
  timestamp: string; // ISO
  /** Optional diff for collapse-on-click expansion. */
  diff?: readonly ActivityDiff[];
  /** Optional structured payload (Stripe-style JSON tree). */
  payload?: unknown;
  /** Optional grouping key — adjacent same-`group` events collapse into a stack. */
  group?: string;
}

export interface ActivityFeedProps {
  events: readonly ActivityEvent[];
  /** When provided, fetched additional events (pagination). */
  onLoadMore?: () => Promise<void> | void;
  /** Default expanded state for diffs. */
  expandDiffsByDefault?: boolean;
  className?: string;
  variant?: ActivityFeedVariant;
}

/**
 * Internal grouping pass — adjacent events sharing a `group` key collapse
 * into a single bucket. Buckets with one entry render as a regular row;
 * buckets with N>1 render the head event with an "N more" suffix and stack
 * the tails as compact sub-rows.
 *
 * Events without a `group` are never collapsed (each becomes a one-entry
 * bucket) so the caller can opt out per-row by simply omitting the field.
 */
interface ActivityGroup {
  key: string;
  /** Same as the events' `group` when defined; undefined otherwise. */
  group?: string;
  events: readonly ActivityEvent[];
}

export function groupAdjacentEvents(events: readonly ActivityEvent[]): readonly ActivityGroup[] {
  const out: ActivityGroup[] = [];
  for (const event of events) {
    const last = out[out.length - 1];
    if (event.group !== undefined && last !== undefined && last.group === event.group) {
      out[out.length - 1] = {
        key: last.key,
        group: last.group,
        events: [...last.events, event],
      };
    } else {
      out.push({
        key: event.id,
        ...(event.group !== undefined ? { group: event.group } : {}),
        events: [event],
      });
    }
  }
  return out;
}

/**
 * Pretty-print arbitrary JSON. We avoid the rich JSON tree primitive because
 * the components package ships zero CSS — a `<pre>` of `JSON.stringify(..., 2)`
 * is the honest baseline; hosts that want a collapsible tree replace the
 * payload renderer at the host level.
 */
function formatPayload(payload: unknown): string {
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

interface RowProps {
  event: ActivityEvent;
  expandDiffsByDefault: boolean;
  /** Suffix appended to the label when this row stands in for a group. */
  countSuffix?: string;
}

function ActivityRow({ event, expandDiffsByDefault, countSuffix }: RowProps): ReactNode {
  const [diffOpen, setDiffOpen] = useState<boolean>(expandDiffsByDefault);
  const [payloadOpen, setPayloadOpen] = useState<boolean>(false);

  const hasDiff = event.diff !== undefined && event.diff.length > 0;
  const hasPayload = event.payload !== undefined;

  return (
    <li
      data-cir-part="activity-row"
      data-event-id={event.id}
      data-event-type={event.type}
      style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}
    >
      {event.actor !== undefined ? (
        <span data-cir-part="activity-avatar" aria-hidden="true">
          {event.actor.avatarUrl !== undefined ? (
            <img
              src={event.actor.avatarUrl}
              alt=""
              data-cir-part="activity-avatar-img"
              style={{ width: 24, height: 24, borderRadius: '50%' }}
            />
          ) : (
            <span
              data-cir-part="activity-avatar-fallback"
              style={{
                display: 'inline-block',
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: '#e5e7eb',
                textAlign: 'center',
                lineHeight: '24px',
                fontSize: 12,
              }}
            >
              {event.actor.name.slice(0, 1).toUpperCase()}
            </span>
          )}
        </span>
      ) : null}
      <div data-cir-part="activity-body" style={{ flex: 1, minWidth: 0 }}>
        <div data-cir-part="activity-header">
          {event.actor !== undefined ? (
            <span data-cir-part="activity-actor">{event.actor.name}</span>
          ) : null}{' '}
          <span data-cir-part="activity-label">{event.label}</span>
          {countSuffix !== undefined ? (
            <span data-cir-part="activity-group-count"> {countSuffix}</span>
          ) : null}{' '}
          <time data-cir-part="activity-timestamp" dateTime={event.timestamp}>
            {event.timestamp}
          </time>
        </div>
        {hasDiff ? (
          <div data-cir-part="activity-diff-region">
            <button
              type="button"
              data-cir-part="activity-diff-toggle"
              aria-expanded={diffOpen}
              onClick={() => {
                setDiffOpen((p) => !p);
              }}
            >
              {diffOpen ? 'Hide diff' : 'View diff'}
            </button>
            {diffOpen ? (
              <div data-cir-part="activity-diff-body">
                <DiffView hunks={event.diff!} />
              </div>
            ) : null}
          </div>
        ) : null}
        {hasPayload ? (
          <div data-cir-part="activity-payload-region">
            <button
              type="button"
              data-cir-part="activity-payload-toggle"
              aria-expanded={payloadOpen}
              onClick={() => {
                setPayloadOpen((p) => !p);
              }}
            >
              {payloadOpen ? 'Hide payload' : 'Show payload'}
            </button>
            {payloadOpen ? (
              <pre
                data-cir-part="activity-payload-body"
                style={{
                  margin: 0,
                  fontFamily: 'ui-monospace, monospace',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {formatPayload(event.payload)}
              </pre>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

export function ActivityFeed({
  events,
  onLoadMore,
  expandDiffsByDefault = false,
  className,
  variant = 'default',
}: ActivityFeedProps): ReactNode {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inFlightRef = useRef(false);

  const handleScroll = useCallback(() => {
    if (!onLoadMore) return;
    const el = scrollRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
    if (inFlightRef.current) return;
    if (distanceFromBottom > LOAD_MORE_THRESHOLD_PX) return;
    inFlightRef.current = true;
    void Promise.resolve(onLoadMore()).finally(() => {
      inFlightRef.current = false;
    });
  }, [onLoadMore]);

  const groups = groupAdjacentEvents(events);

  return (
    <div
      ref={scrollRef}
      data-cir-component="ActivityFeed"
      data-variant={variant}
      className={cn(activityFeedVariantClass[variant], className)}
      onScroll={onLoadMore ? handleScroll : undefined}
      style={onLoadMore ? { overflowY: 'auto' } : undefined}
    >
      <ol data-cir-part="activity-list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {groups.map((group) => {
          const head = group.events[0];
          if (head === undefined) return null;
          const tail = group.events.slice(1);
          const countSuffix =
            tail.length > 0 ? `(${String(group.events.length)} times)` : undefined;
          return (
            <div
              key={group.key}
              data-cir-part="activity-group"
              data-group-size={String(group.events.length)}
              {...(group.group !== undefined ? { 'data-group-key': group.group } : {})}
            >
              <ActivityRow
                event={head}
                expandDiffsByDefault={expandDiffsByDefault}
                {...(countSuffix !== undefined ? { countSuffix } : {})}
              />
              {tail.length > 0 ? (
                <ol
                  data-cir-part="activity-group-tail"
                  style={{ listStyle: 'none', margin: 0, paddingLeft: 32 }}
                >
                  {tail.map((event) => (
                    <ActivityRow
                      key={event.id}
                      event={event}
                      expandDiffsByDefault={expandDiffsByDefault}
                    />
                  ))}
                </ol>
              ) : null}
            </div>
          );
        })}
      </ol>
    </div>
  );
}

ActivityFeed.displayName = 'ActivityFeed';

export function activityFeedTextRender(props: ActivityFeedProps): string {
  return `[ActivityFeed: ${String(props.events.length)} events]`;
}

export const ActivityFeedBinding: ComponentBinding = {
  id: 'ActivityFeed',
  factory: ActivityFeed,
};
