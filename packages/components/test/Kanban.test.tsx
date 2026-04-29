// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Kanban, KanbanBinding } from '../src/components/Kanban.js';

const COLUMNS = [
  {
    id: 'todo',
    title: 'To Do',
    cards: [
      { id: 'a', title: 'Write spec' },
      { id: 'b', title: 'Review PR', body: 'open since Mon' },
    ],
  },
  {
    id: 'doing',
    title: 'Doing',
    cards: [{ id: 'c', title: 'Build', meta: 'due Fri' }],
  },
  { id: 'done', title: 'Done', cards: [] },
];

describe('Kanban', () => {
  it('renders one section per column', () => {
    render(<Kanban columns={COLUMNS} />);
    expect(document.querySelectorAll('[data-cir-part="kanban-column"]').length).toBe(3);
  });

  it('renders the per-column card count', () => {
    render(<Kanban columns={COLUMNS} />);
    const counts = document.querySelectorAll('[data-cir-part="kanban-column-count"]');
    expect(counts[0]?.textContent).toBe('2');
    expect(counts[1]?.textContent).toBe('1');
    expect(counts[2]?.textContent).toBe('0');
  });

  it('renders all cards across columns', () => {
    render(<Kanban columns={COLUMNS} />);
    expect(document.querySelectorAll('[data-cir-part="kanban-card"]').length).toBe(3);
  });

  it('renders body and meta when provided', () => {
    render(<Kanban columns={COLUMNS} />);
    expect(screen.getByText('open since Mon')).toBeTruthy();
    expect(screen.getByText('due Fri')).toBeTruthy();
  });

  it('cards are non-interactive when onCardClick is omitted', () => {
    render(<Kanban columns={COLUMNS} />);
    const card = document.querySelector('[data-cir-part="kanban-card"]');
    expect(card?.getAttribute('role')).toBeNull();
    expect(card?.getAttribute('tabindex')).toBeNull();
  });

  it('cards become buttons when onCardClick is provided', () => {
    render(<Kanban columns={COLUMNS} onCardClick={() => undefined} />);
    const card = document.querySelector('[data-cir-part="kanban-card"]');
    expect(card?.getAttribute('role')).toBe('button');
    expect(card?.getAttribute('tabindex')).toBe('0');
  });

  it('clicking a card calls onCardClick with cardId and columnId', () => {
    const onCardClick = vi.fn();
    render(<Kanban columns={COLUMNS} onCardClick={onCardClick} />);
    fireEvent.click(document.querySelector('[data-card-id="b"]')!);
    expect(onCardClick).toHaveBeenCalledWith('b', 'todo');
  });

  it('Enter and Space activate a card via keyboard', () => {
    const onCardClick = vi.fn();
    render(<Kanban columns={COLUMNS} onCardClick={onCardClick} />);
    const card = document.querySelector('[data-card-id="c"]')!;
    fireEvent.keyDown(card, { key: 'Enter' });
    fireEvent.keyDown(card, { key: ' ' });
    expect(onCardClick).toHaveBeenCalledTimes(2);
    expect(onCardClick).toHaveBeenLastCalledWith('c', 'doing');
  });

  it('non-activation keys are ignored', () => {
    const onCardClick = vi.fn();
    render(<Kanban columns={COLUMNS} onCardClick={onCardClick} />);
    const card = document.querySelector('[data-card-id="a"]')!;
    fireEvent.keyDown(card, { key: 'a' });
    expect(onCardClick).not.toHaveBeenCalled();
  });

  it('binding id matches', () => {
    expect(KanbanBinding.id).toBe('Kanban');
  });
});
