// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FilterBar, FilterBarBinding } from '../src/components/FilterBar.js';

describe('FilterBar', () => {
  it('renders one control per filter', () => {
    render(
      <FilterBar
        filters={[
          { id: 'q', label: 'Query', type: 'search', value: '' },
          {
            id: 'status',
            label: 'Status',
            type: 'select',
            options: [
              { value: 'open', label: 'Open' },
              { value: 'done', label: 'Done' },
            ],
            value: 'open',
          },
          { id: 'mine', label: 'Only mine', type: 'toggle', value: false },
        ]}
        onChange={() => undefined}
      />,
    );
    expect(document.querySelectorAll('[data-cir-part="filter-item"]').length).toBe(3);
    expect(screen.getByLabelText('Query')).toBeTruthy();
    expect(screen.getByLabelText('Status')).toBeTruthy();
    expect(screen.getByLabelText('Only mine')).toBeTruthy();
  });

  it('emits onChange with id and string value for select', () => {
    const onChange = vi.fn();
    render(
      <FilterBar
        filters={[
          {
            id: 'status',
            label: 'Status',
            type: 'select',
            options: [
              { value: 'open', label: 'Open' },
              { value: 'done', label: 'Done' },
            ],
            value: 'open',
          },
        ]}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'done' } });
    expect(onChange).toHaveBeenCalledWith('status', 'done');
  });

  it('emits onChange with id and boolean for toggle', () => {
    const onChange = vi.fn();
    render(
      <FilterBar
        filters={[{ id: 'mine', label: 'Only mine', type: 'toggle', value: false }]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByLabelText('Only mine'));
    expect(onChange).toHaveBeenCalledWith('mine', true);
  });

  it('emits onChange with id and string for search', () => {
    const onChange = vi.fn();
    render(
      <FilterBar
        filters={[{ id: 'q', label: 'Query', type: 'search', value: '' }]}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText('Query'), { target: { value: 'apple' } });
    expect(onChange).toHaveBeenCalledWith('q', 'apple');
  });

  it('suppresses native form submission', () => {
    render(
      <FilterBar
        filters={[{ id: 'q', label: 'Query', type: 'search', value: '' }]}
        onChange={() => undefined}
      />,
    );
    const form = screen.getByRole('search');
    const ev = new Event('submit', { bubbles: true, cancelable: true });
    form.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it('binding id matches', () => {
    expect(FilterBarBinding.id).toBe('FilterBar');
  });
});
