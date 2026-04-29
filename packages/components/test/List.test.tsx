// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { List, ListBinding } from '../src/components/List.js';

describe('List', () => {
  it('renders a <ul> with one <li> per item', () => {
    const { container } = render(<List items={['a', 'b', 'c']} renderItem={(s) => s} />);
    expect(container.querySelector('ul')).toBeTruthy();
    expect(container.querySelectorAll('li').length).toBe(3);
  });

  it('passes item and index to renderItem', () => {
    render(
      <List
        items={[10, 20, 30]}
        renderItem={(n, i) => (
          <span>
            {String(i)}-{String(n)}
          </span>
        )}
      />,
    );
    expect(screen.getByText('0-10')).toBeTruthy();
    expect(screen.getByText('2-30')).toBeTruthy();
  });

  it('renders the empty slot when items is empty', () => {
    render(<List items={[]} renderItem={(s) => s as string} empty={<span>nothing here</span>} />);
    expect(screen.getByText('nothing here')).toBeTruthy();
  });

  it('renders a data-cir-empty wrapper when items is empty (no <ul>)', () => {
    const { container } = render(<List items={[]} renderItem={(s) => s as string} />);
    expect(container.querySelector('ul')).toBeNull();
    expect(container.querySelector('[data-cir-empty="true"]')).toBeTruthy();
  });

  it('exposes data-bordered attr', () => {
    const { container } = render(<List bordered items={['x']} renderItem={(s) => s} />);
    expect(container.querySelector('ul')?.getAttribute('data-bordered')).toBe('true');
  });

  it('binding id matches', () => {
    expect(ListBinding.id).toBe('List');
  });
});
