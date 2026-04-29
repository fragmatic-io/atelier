// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState, EmptyStateBinding } from '../src/components/EmptyState.js';

describe('EmptyState', () => {
  it('renders the title inside a status region', () => {
    render(<EmptyState title="Nothing here" />);
    const status = screen.getByRole('status');
    expect(status).toBeTruthy();
    expect(screen.getByText('Nothing here')).toBeTruthy();
  });

  it('renders the description when provided', () => {
    render(<EmptyState title="t" description="try a different filter" />);
    expect(screen.getByText('try a different filter')).toBeTruthy();
  });

  it('renders the action slot when provided', () => {
    render(<EmptyState title="t" action={<button type="button">Add one</button>} />);
    expect(screen.getByRole('button', { name: 'Add one' })).toBeTruthy();
  });

  it('binding id matches', () => {
    expect(EmptyStateBinding.id).toBe('EmptyState');
  });
});
