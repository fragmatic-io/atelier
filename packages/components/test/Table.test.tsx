// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Table, TableBinding } from '../src/components/Table.js';

const COLUMNS = [
  { key: 'name', header: 'Name' },
  { key: 'role', header: 'Role' },
];

const ROWS = [
  { name: 'Ada', role: 'Engineer' },
  { name: 'Lin', role: 'Designer' },
];

describe('Table', () => {
  it('renders headers and rows', () => {
    render(<Table columns={COLUMNS} rows={ROWS} />);
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Role' })).toBeTruthy();
    expect(screen.getByText('Ada')).toBeTruthy();
    expect(screen.getByText('Designer')).toBeTruthy();
  });

  it('renders the caption when provided', () => {
    render(<Table columns={COLUMNS} rows={ROWS} caption="People" />);
    // <caption> is exposed as a descendant of the table; assert via text.
    expect(screen.getByText('People')).toBeTruthy();
  });

  it('renders default empty state when rows is empty', () => {
    render(<Table columns={COLUMNS} rows={[]} />);
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.getByText('No data')).toBeTruthy();
  });

  it('renders custom empty slot when rows is empty', () => {
    render(<Table columns={COLUMNS} rows={[]} empty={<div>nothing here</div>} />);
    expect(screen.getByText('nothing here')).toBeTruthy();
  });

  it('handles missing cell values without crashing', () => {
    const sparse: { name: string }[] = [{ name: 'Solo' }];
    render(<Table columns={COLUMNS} rows={sparse} />);
    expect(screen.getByText('Solo')).toBeTruthy();
  });

  it('binding id matches', () => {
    expect(TableBinding.id).toBe('Table');
  });
});
