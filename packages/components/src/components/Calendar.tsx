// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';
/**
 * Calendar — month-view date picker. Hand-built grid (no date library) so
 * the component carries no extra dependency surface. Renders a `<table
 * role="grid">` with weekday headers + one cell per day in the visible
 * month, padded with empty cells before the first weekday.
 *
 * Selection / month state are owned by the host: the component is
 * effectively pure (one `useMemo` for the grid). Click a day → emit
 * `onChange(iso)`. Prev / Next buttons → emit `onMonthChange(iso)`.
 *
 * Locale: weekdays start on Sunday for now (US convention). Phase 6 can
 * accept a `firstDayOfWeek` prop and Intl-formatted weekday names without
 * altering the binding contract.
 */
import { useMemo, type ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';

export type CalendarTone = 'default' | 'accent' | 'muted';

export interface CalendarHighlight {
  date: string;
  tone?: CalendarTone;
}

export interface CalendarProps {
  value?: string;
  onChange?: (date: string) => void;
  /** YYYY-MM. Defaults to the value's month, then current month. */
  month?: string;
  onMonthChange?: (month: string) => void;
  highlights?: readonly CalendarHighlight[];
  ariaLabel: string;
  className?: string;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const pad = (n: number): string => (n < 10 ? `0${String(n)}` : String(n));

function parseMonth(month: string): { y: number; m: number } | undefined {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return undefined;
  const y = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return undefined;
  return { y, m };
}

function defaultMonth(value: string | undefined): string {
  if (value !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value.slice(0, 7);
  const now = new Date();
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}`;
}

function shiftMonth(month: string, delta: number): string {
  const parsed = parseMonth(month);
  if (!parsed) return month;
  // Use Date to handle wrap-around at year boundaries.
  const d = new Date(parsed.y, parsed.m - 1 + delta, 1);
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}`;
}

interface CalendarCell {
  iso: string;
  day: number;
}

function buildGrid(month: string): CalendarCell[][] {
  const parsed = parseMonth(month);
  if (!parsed) return [];
  const { y, m } = parsed;
  const first = new Date(y, m - 1, 1);
  const startWeekday = first.getDay(); // 0=Sun
  const daysInMonth = new Date(y, m, 0).getDate();
  const cells: (CalendarCell | null)[] = [];
  for (let i = 0; i < startWeekday; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) {
    cells.push({ iso: `${String(y)}-${pad(m)}-${pad(d)}`, day: d });
  }
  // Pad to multiple of 7.
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: CalendarCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7) as CalendarCell[]);
  }
  return weeks;
}

export function Calendar({
  value,
  onChange,
  month,
  onMonthChange,
  highlights,
  ariaLabel,
  className,
}: CalendarProps): ReactNode {
  const activeMonth = month ?? defaultMonth(value);
  const grid = useMemo(() => buildGrid(activeMonth), [activeMonth]);
  const highlightMap = useMemo(() => {
    const m = new Map<string, CalendarTone>();
    for (const h of highlights ?? []) m.set(h.date, h.tone ?? 'default');
    return m;
  }, [highlights]);

  const headerLabel = (() => {
    const parsed = parseMonth(activeMonth);
    if (!parsed) return activeMonth;
    const d = new Date(parsed.y, parsed.m - 1, 1);
    return `${d.toLocaleString(undefined, { month: 'long' })} ${String(parsed.y)}`;
  })();

  return (
    <div data-cir-component="Calendar" data-month={activeMonth} className={className}>
      <header data-cir-part="calendar-header">
        <button
          type="button"
          data-cir-part="calendar-prev"
          aria-label="Previous month"
          onClick={() => {
            onMonthChange?.(shiftMonth(activeMonth, -1));
          }}
        >
          ‹
        </button>
        <h2 data-cir-part="calendar-title" aria-live="polite">
          {headerLabel}
        </h2>
        <button
          type="button"
          data-cir-part="calendar-next"
          aria-label="Next month"
          onClick={() => {
            onMonthChange?.(shiftMonth(activeMonth, 1));
          }}
        >
          ›
        </button>
      </header>
      <table role="grid" aria-label={ariaLabel} data-cir-part="calendar-grid">
        <thead>
          <tr>
            {WEEKDAYS.map((w) => (
              <th key={w} scope="col" data-cir-part="calendar-weekday">
                {w}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.map((week, wi) => (
            <tr key={wi} data-cir-part="calendar-week">
              {week.map((cell, ci) => {
                if (!cell) {
                  return (
                    <td
                      key={`empty-${String(wi)}-${String(ci)}`}
                      data-cir-part="calendar-empty"
                      aria-hidden="true"
                    />
                  );
                }
                const tone = highlightMap.get(cell.iso);
                const selected = value === cell.iso;
                return (
                  <td
                    key={cell.iso}
                    role="gridcell"
                    data-cir-part="calendar-day"
                    data-tone={tone ?? ''}
                    data-selected={selected ? 'true' : 'false'}
                    aria-selected={selected ? 'true' : undefined}
                  >
                    <button
                      type="button"
                      data-cir-part="calendar-day-button"
                      data-date={cell.iso}
                      onClick={() => {
                        onChange?.(cell.iso);
                      }}
                    >
                      {String(cell.day)}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

Calendar.displayName = 'Calendar';

export function calendarTextRender(props: CalendarProps): string {
  const m = props.month ?? defaultMonth(props.value);
  return `[Calendar: ${m}${props.value !== undefined ? ` selected ${props.value}` : ''}]`;
}

export const CalendarBinding: ComponentBinding = {
  id: 'Calendar',
  factory: Calendar,
};
