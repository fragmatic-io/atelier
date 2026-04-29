// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { DiffView, DiffViewBinding, diffViewTextRender } from '../src/components/DiffView.js';

const HUNKS = [
  { kind: 'context' as const, line: 'unchanged', oldNumber: 1, newNumber: 1 },
  { kind: 'remove' as const, line: 'old line', oldNumber: 2 },
  { kind: 'add' as const, line: 'new line', newNumber: 2 },
  { kind: 'add' as const, line: 'extra', newNumber: 3 },
];

describe('DiffView', () => {
  it('renders one row per hunk with data-kind', () => {
    const { container } = render(<DiffView hunks={HUNKS} />);
    const rows = container.querySelectorAll('[data-cir-part="diff-row"]');
    expect(rows.length).toBe(4);
    expect(rows[0]?.getAttribute('data-kind')).toBe('context');
    expect(rows[1]?.getAttribute('data-kind')).toBe('remove');
    expect(rows[2]?.getAttribute('data-kind')).toBe('add');
  });

  it('prefixes add / remove / context with +, -, space', () => {
    const { container } = render(<DiffView hunks={HUNKS} />);
    const markers = container.querySelectorAll('[data-cir-part="diff-marker"]');
    expect(markers[0]?.textContent).toBe(' ');
    expect(markers[1]?.textContent).toBe('-');
    expect(markers[2]?.textContent).toBe('+');
  });

  it('renders old / new line numbers when present', () => {
    const { container } = render(<DiffView hunks={HUNKS} />);
    const olds = container.querySelectorAll('[data-cir-part="diff-old-num"]');
    const news = container.querySelectorAll('[data-cir-part="diff-new-num"]');
    expect(olds[0]?.textContent).toBe('1');
    expect(olds[2]?.textContent).toBe('');
    expect(news[1]?.textContent).toBe('');
    expect(news[2]?.textContent).toBe('2');
  });

  it('renders the line content', () => {
    const { container } = render(<DiffView hunks={HUNKS} />);
    const lines = container.querySelectorAll('[data-cir-part="diff-line"]');
    expect(lines[0]?.textContent).toBe('unchanged');
    expect(lines[2]?.textContent).toBe('new line');
  });

  it('text-render reports +adds / -removes', () => {
    expect(diffViewTextRender({ hunks: HUNKS })).toBe('[DiffView: +2 -1]');
  });

  it('binding id matches', () => {
    expect(DiffViewBinding.id).toBe('DiffView');
  });
});
