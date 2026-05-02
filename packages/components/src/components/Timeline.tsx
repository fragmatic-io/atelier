// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Timeline — vertical event timeline rendered as an `<ol>` with one `<li>`
 * per entry. Each entry surfaces a date, a connector dot, and the entry
 * body. Stateless: callers compute ordering and `status` ahead of render.
 *
 * `status` is mirrored as `data-status` so a Phase 4c CSS layer can paint
 * past / current / future markers distinctly. We intentionally do not
 * timestamp-parse `date` — host code formats however it likes (relative
 * "2d ago", absolute, locale-aware) and passes the resulting string in.
 */
import type { ReactNode } from 'react';
import type { ComponentBinding } from '@atelier/runtime';
import { cn, timelineVariantClass, type TimelineVariant } from './_variants.js';

export type TimelineStatus = 'past' | 'current' | 'future';

export interface TimelineEntry {
  id: string;
  date: string;
  title: string;
  body?: ReactNode;
  status?: TimelineStatus;
}

export interface TimelineProps {
  entries: readonly TimelineEntry[];
  className?: string;
  variant?: TimelineVariant;
}

export function Timeline({ entries, className, variant = 'default' }: TimelineProps): ReactNode {
  return (
    <ol
      data-cir-component="Timeline"
      data-variant={variant}
      className={cn(timelineVariantClass[variant], className)}
    >
      {entries.map((entry) => (
        <li
          key={entry.id}
          data-cir-part="timeline-entry"
          data-status={entry.status ?? 'past'}
          aria-current={entry.status === 'current' ? 'step' : undefined}
        >
          <time data-cir-part="timeline-date">{entry.date}</time>
          <span data-cir-part="timeline-marker" aria-hidden="true" />
          <div data-cir-part="timeline-content">
            <h3 data-cir-part="timeline-title">{entry.title}</h3>
            {entry.body !== undefined ? (
              <div data-cir-part="timeline-body">{entry.body}</div>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

Timeline.displayName = 'Timeline';

export function timelineTextRender(props: TimelineProps): string {
  return `[Timeline: ${String(props.entries.length)} entries]`;
}

export const TimelineBinding: ComponentBinding = {
  id: 'Timeline',
  factory: Timeline,
};
