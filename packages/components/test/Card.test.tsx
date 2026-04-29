// @vitest-environment happy-dom
import './setup.js';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card, CardBinding } from '../src/components/Card.js';

describe('Card', () => {
  it('renders children', () => {
    render(<Card>hello body</Card>);
    expect(screen.getByText('hello body')).toBeTruthy();
  });

  it('renders title heading when title is set', () => {
    render(<Card title="My card">body</Card>);
    expect(screen.getByRole('heading', { level: 3, name: 'My card' })).toBeTruthy();
  });

  it('renders the actions slot', () => {
    render(
      <Card title="t" actions={<button type="button">act</button>}>
        body
      </Card>,
    );
    expect(screen.getByRole('button', { name: 'act' })).toBeTruthy();
  });

  it('omits the header entirely when no title and no actions', () => {
    const { container } = render(<Card>just body</Card>);
    expect(container.querySelector('header')).toBeNull();
  });

  it('forwards ref to the underlying section', () => {
    const ref = createRef<HTMLElement>();
    render(<Card ref={ref}>body</Card>);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName).toBe('SECTION');
  });

  it('binding id matches', () => {
    expect(CardBinding.id).toBe('Card');
  });
});
