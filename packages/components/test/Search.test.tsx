// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Search, SearchBinding } from '../src/components/Search.js';

describe('Search', () => {
  it('renders a form[role=search] with input + label', () => {
    render(<Search value="" onChange={() => undefined} label="Search items" />);
    const form = screen.getByRole('search');
    expect(form).toBeTruthy();
    expect(form.getAttribute('data-cir-component')).toBe('Search');
    const input = screen.getByLabelText<HTMLInputElement>('Search items');
    expect(input.type).toBe('search');
  });

  it('uses default label "Search" when none is provided', () => {
    render(<Search value="" onChange={() => undefined} />);
    expect(screen.getByLabelText('Search')).toBeTruthy();
  });

  it('emits onChange as the user types', () => {
    const onChange = vi.fn();
    render(<Search value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'tea' } });
    expect(onChange).toHaveBeenCalledWith('tea');
  });

  it('emits onSubmit when the form submits (Enter)', () => {
    const onSubmit = vi.fn();
    render(<Search value="tea" onChange={() => undefined} onSubmit={onSubmit} />);
    fireEvent.submit(screen.getByRole('search'));
    expect(onSubmit).toHaveBeenCalledWith('tea');
  });

  it('does not error if onSubmit is omitted', () => {
    render(<Search value="tea" onChange={() => undefined} />);
    expect(() => {
      fireEvent.submit(screen.getByRole('search'));
    }).not.toThrow();
  });

  it('clearable button appears only when value is non-empty', () => {
    const { rerender } = render(<Search value="" onChange={() => undefined} />);
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
    rerender(<Search value="tea" onChange={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeTruthy();
  });

  it('clear button calls onChange("") and is suppressed when clearable=false', () => {
    const onChange = vi.fn();
    const { rerender } = render(<Search value="x" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(onChange).toHaveBeenCalledWith('');
    rerender(<Search value="x" onChange={onChange} clearable={false} />);
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
  });

  it('honours placeholder', () => {
    render(<Search value="" onChange={() => undefined} placeholder="Find…" />);
    expect(screen.getByLabelText<HTMLInputElement>('Search').placeholder).toBe('Find…');
  });

  it('binding id matches', () => {
    expect(SearchBinding.id).toBe('Search');
  });
});
