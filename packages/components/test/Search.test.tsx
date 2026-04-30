// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Search, SearchBinding } from '../src/components/Search.js';

describe('Search', () => {
  it('renders <form role=search> with the input and label', () => {
    render(<Search value="" onChange={() => undefined} />);
    expect(screen.getByRole('search')).toBeTruthy();
    expect(screen.getByLabelText('Search')).toBeTruthy();
  });
  it('fires onChange with the new value', () => {
    const onChange = vi.fn();
    render(<Search value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'q' } });
    expect(onChange).toHaveBeenCalledWith('q');
  });
  it('shows a clear button only when value is non-empty', () => {
    const { rerender } = render(<Search value="" onChange={() => undefined} />);
    expect(screen.queryByLabelText('Clear search')).toBeNull();
    rerender(<Search value="abc" onChange={() => undefined} />);
    expect(screen.getByLabelText('Clear search')).toBeTruthy();
  });
  it('binding id matches', () => {
    expect(SearchBinding.id).toBe('Search');
  });
  // -- Wave 6 / P-10 variant assertions --
  it('defaults to variant=default', () => {
    render(<Search value="" onChange={() => undefined} />);
    expect(screen.getByRole('search').getAttribute('data-variant')).toBe('default');
  });
  it('reflects each variant on data-variant', () => {
    for (const v of ['default', 'embedded'] as const) {
      const { unmount } = render(<Search value="" onChange={() => undefined} variant={v} />);
      expect(screen.getByRole('search').getAttribute('data-variant')).toBe(v);
      unmount();
    }
  });
  it('applies the embedded variant class (no chrome)', () => {
    render(<Search value="" onChange={() => undefined} variant="embedded" />);
    expect(screen.getByRole('search').className).toContain('bg-transparent');
  });
});
