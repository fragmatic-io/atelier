// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Kanban — static board layout. Renders `columns` as a horizontal flex of
 * `<section>`s, each containing an `<ul>` of clickable `<article>` cards.
 * Drag-and-drop is intentionally out of scope for Phase 5c — implementing
 * it correctly requires `dnd-kit` (or @hello-pangea/dnd, or HTML5
 * drag-and-drop with a lot of glue). Phase 6 should add a controlled
 * variant that accepts an `onCardMove` callback and pulls in dnd-kit
 * behind a feature flag, keeping the static layout untouched for hosts
 * that just need to display state.
 *
 * `onCardClick` fires for any clickable card; passing `undefined` keeps
 * cards as visual articles (still focusable for a screen reader, but no
 * interactive role).
 */
import type { ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';
import { cn, kanbanVariantClass, type KanbanVariant } from './_variants.js';

export interface KanbanCard {
  id: string;
  title: string;
  body?: ReactNode;
  meta?: ReactNode;
}

export interface KanbanColumn {
  id: string;
  title: string;
  cards: readonly KanbanCard[];
}

export interface KanbanProps {
  columns: readonly KanbanColumn[];
  onCardClick?: (cardId: string, columnId: string) => void;
  className?: string;
  'aria-label'?: string;
  variant?: KanbanVariant;
}

export function Kanban({
  columns,
  onCardClick,
  className,
  'aria-label': ariaLabel = 'Kanban board',
  variant = 'default',
}: KanbanProps): ReactNode {
  const interactive = onCardClick !== undefined;
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      data-cir-component="Kanban"
      data-variant={variant}
      className={cn(kanbanVariantClass[variant], className)}
      style={{ display: 'flex', gap: '12px', overflowX: 'auto' }}
    >
      {columns.map((col) => (
        <section
          key={col.id}
          data-cir-part="kanban-column"
          aria-label={col.title}
          style={{ minWidth: '240px' }}
        >
          <header data-cir-part="kanban-column-header">
            <h3 data-cir-part="kanban-column-title">{col.title}</h3>
            <span data-cir-part="kanban-column-count">{String(col.cards.length)}</span>
          </header>
          <ul data-cir-part="kanban-cards" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {col.cards.map((card) => (
              <li key={card.id} data-cir-part="kanban-card-wrap">
                <article
                  data-cir-part="kanban-card"
                  data-card-id={card.id}
                  role={interactive ? 'button' : undefined}
                  tabIndex={interactive ? 0 : undefined}
                  onClick={
                    interactive
                      ? () => {
                          onCardClick(card.id, col.id);
                        }
                      : undefined
                  }
                  onKeyDown={
                    interactive
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onCardClick(card.id, col.id);
                          }
                        }
                      : undefined
                  }
                >
                  <h4 data-cir-part="kanban-card-title">{card.title}</h4>
                  {card.body !== undefined ? (
                    <div data-cir-part="kanban-card-body">{card.body}</div>
                  ) : null}
                  {card.meta !== undefined ? (
                    <footer data-cir-part="kanban-card-meta">{card.meta}</footer>
                  ) : null}
                </article>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

Kanban.displayName = 'Kanban';

export function kanbanTextRender(props: KanbanProps): string {
  const total = props.columns.reduce((sum, c) => sum + c.cards.length, 0);
  return `[Kanban: ${String(props.columns.length)} columns, ${String(total)} cards]`;
}

export const KanbanBinding: ComponentBinding = {
  id: 'Kanban',
  factory: Kanban,
};
