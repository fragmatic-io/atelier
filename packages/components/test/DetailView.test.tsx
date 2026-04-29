// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DetailView, DetailViewBinding } from '../src/components/DetailView.js';

const FIELDS = [
  { label: 'Name', value: 'Ada Lovelace' },
  { label: 'Role', value: 'Mathematician' },
];

describe('DetailView', () => {
  it('renders a <dl> with one <dt>/<dd> pair per field', () => {
    const { container } = render(<DetailView fields={FIELDS} />);
    expect(container.querySelector('dl')).toBeTruthy();
    expect(container.querySelectorAll('dt').length).toBe(2);
    expect(container.querySelectorAll('dd').length).toBe(2);
  });

  it('renders the labels and values', () => {
    render(<DetailView fields={FIELDS} />);
    expect(screen.getByText('Name')).toBeTruthy();
    expect(screen.getByText('Ada Lovelace')).toBeTruthy();
    expect(screen.getByText('Role')).toBeTruthy();
  });

  it('density defaults to normal and dense flips to dense', () => {
    const { container, rerender } = render(<DetailView fields={FIELDS} />);
    expect(container.querySelector('dl')?.getAttribute('data-density')).toBe('normal');
    rerender(<DetailView fields={FIELDS} dense />);
    expect(container.querySelector('dl')?.getAttribute('data-density')).toBe('dense');
  });

  it('handles ReactNode values', () => {
    render(<DetailView fields={[{ label: 'Status', value: <strong>active</strong> }]} />);
    expect(screen.getByText('active').tagName).toBe('STRONG');
  });

  it('binding id matches', () => {
    expect(DetailViewBinding.id).toBe('DetailView');
  });
});
