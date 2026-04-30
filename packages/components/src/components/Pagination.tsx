// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Pagination — controlled 1-indexed page picker. Renders Prev / Next buttons
 * plus a numbered list with ellipsis truncation:
 *
 *     1 … 4 5 6 … 10
 *
 * `siblingCount` controls how many neighbours of the current page are shown
 * on each side (default 1). The first and last page are always shown to
 * keep "jump to start/end" reachable in one click. Renders a
 * `<nav aria-label="Pagination">` for screen readers.
 *
 * Stateless: the parent drives `currentPage` and reacts to `onPageChange`.
 */
import type { ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';
import { cn, navigationVariantClass, type NavigationVariant } from './_variants.js';

export type PaginationVariant = NavigationVariant;

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (next: number) => void;
  siblingCount?: number;
  className?: string;
  variant?: PaginationVariant;
}

type PageEntry = number | 'ellipsis-left' | 'ellipsis-right';

function buildRange(current: number, total: number, siblingCount: number): readonly PageEntry[] {
  if (total <= 0) return [];
  const first = 1;
  const last = total;
  const left = Math.max(current - siblingCount, first);
  const right = Math.min(current + siblingCount, last);

  const out: PageEntry[] = [];
  out.push(first);
  if (left > first + 1) {
    out.push('ellipsis-left');
  } else if (left === first + 1) {
    out.push(first + 1);
  }
  for (let p = Math.max(left, first + 1); p <= Math.min(right, last - 1); p++) {
    if (!out.includes(p)) out.push(p);
  }
  if (right < last - 1) {
    out.push('ellipsis-right');
  } else if (right === last - 1 && !out.includes(last - 1)) {
    out.push(last - 1);
  }
  if (last !== first) out.push(last);
  return out;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  siblingCount = 1,
  className,
  variant = 'default',
}: PaginationProps): ReactNode {
  const entries = buildRange(currentPage, totalPages, siblingCount);
  const prevDisabled = currentPage <= 1;
  const nextDisabled = currentPage >= totalPages;
  return (
    <nav
      aria-label="Pagination"
      data-cir-component="Pagination"
      data-variant={variant}
      className={cn(navigationVariantClass[variant], className)}
    >
      <ul
        data-cir-part="pagination-list"
        style={{ display: 'flex', gap: '4px', listStyle: 'none', margin: 0, padding: 0 }}
      >
        <li>
          <button
            type="button"
            data-cir-part="pagination-prev"
            disabled={prevDisabled}
            aria-label="Previous page"
            onClick={() => {
              if (!prevDisabled) onPageChange(currentPage - 1);
            }}
          >
            Prev
          </button>
        </li>
        {entries.map((entry, i) => {
          if (entry === 'ellipsis-left' || entry === 'ellipsis-right') {
            return (
              <li key={`${entry}-${String(i)}`} data-cir-part="pagination-ellipsis">
                <span aria-hidden="true">…</span>
              </li>
            );
          }
          const isCurrent = entry === currentPage;
          return (
            <li key={`page-${String(entry)}`}>
              <button
                type="button"
                data-cir-part="pagination-page"
                data-current={isCurrent ? 'true' : 'false'}
                aria-current={isCurrent ? 'page' : undefined}
                aria-label={`Page ${String(entry)}`}
                onClick={() => {
                  if (!isCurrent) onPageChange(entry);
                }}
              >
                {entry}
              </button>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            data-cir-part="pagination-next"
            disabled={nextDisabled}
            aria-label="Next page"
            onClick={() => {
              if (!nextDisabled) onPageChange(currentPage + 1);
            }}
          >
            Next
          </button>
        </li>
      </ul>
    </nav>
  );
}

Pagination.displayName = 'Pagination';

export function paginationTextRender(props: PaginationProps): string {
  return `[Pagination: page ${String(props.currentPage)} of ${String(props.totalPages)}]`;
}

export const PaginationBinding: ComponentBinding = {
  id: 'Pagination',
  factory: Pagination,
};
