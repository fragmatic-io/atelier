// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  FilterQueryBar,
  FilterQueryBarBinding,
  filterQueryBarTextRender,
  parseFilterQuery,
  type FilterField,
} from '../src/components/FilterQueryBar.js';

const fields: FilterField[] = [
  { key: 'assignee', values: ['me', 'joe'] },
  { key: 'priority', values: ['high', 'medium', 'low'] },
  { key: 'status', values: ['open', 'closed'] },
  { key: 'count' },
];

describe('parseFilterQuery (pure parser)', () => {
  it('parses field:value as eq', () => {
    const r = parseFilterQuery('assignee:me', fields);
    expect(r.filters).toEqual([{ field: 'assignee', op: 'eq', value: 'me', raw: 'assignee:me' }]);
    expect(r.remainingText).toBe('');
  });

  it('parses field:!value as ne', () => {
    const r = parseFilterQuery('status:!closed', fields);
    expect(r.filters[0]!.op).toBe('ne');
    expect(r.filters[0]!.value).toBe('closed');
  });

  it('parses field:>n as gt', () => {
    const r = parseFilterQuery('count:>3', fields);
    expect(r.filters[0]!.op).toBe('gt');
    expect(r.filters[0]!.value).toBe('3');
  });

  it('parses field:<n as lt', () => {
    const r = parseFilterQuery('count:<3', fields);
    expect(r.filters[0]!.op).toBe('lt');
    expect(r.filters[0]!.value).toBe('3');
  });

  it('parses field:~text as contains', () => {
    const r = parseFilterQuery('assignee:~jo', fields);
    expect(r.filters[0]!.op).toBe('contains');
    expect(r.filters[0]!.value).toBe('jo');
  });

  it('parses field:a,b as in with array value', () => {
    const r = parseFilterQuery('priority:high,medium', fields);
    expect(r.filters[0]!.op).toBe('in');
    expect(r.filters[0]!.value).toEqual(['high', 'medium']);
  });

  it('keeps unknown fields as remainingText', () => {
    const r = parseFilterQuery('foo:bar', fields);
    expect(r.filters).toEqual([]);
    expect(r.remainingText).toBe('foo:bar');
  });

  it('strips quotes around values', () => {
    const r = parseFilterQuery('assignee:"Joe Smith"', fields);
    expect(r.filters[0]!.value).toBe('Joe Smith');
  });

  it('returns empty result for empty query', () => {
    const r = parseFilterQuery('', fields);
    expect(r.filters).toEqual([]);
    expect(r.remainingText).toBe('');
  });

  it('mixes structured + free text', () => {
    const r = parseFilterQuery('assignee:me search words priority:high', fields);
    expect(r.filters.length).toBe(2);
    expect(r.remainingText).toBe('search words');
  });
});

describe('<FilterQueryBar>', () => {
  it('promotes a field:value token into a chip when whitespace seals it', () => {
    const onChange = vi.fn();
    render(<FilterQueryBar fields={fields} onChange={onChange} />);
    const input = screen.getByLabelText('Filter query input');
    fireEvent.change(input, { target: { value: 'assignee:me ' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0]).toEqual([
      { field: 'assignee', op: 'eq', value: 'me', raw: 'assignee:me' },
    ]);
    // Chip rendered.
    expect(screen.getAllByText('assignee:me')).toHaveLength(1);
  });

  it('Backspace at start of empty input removes the last chip', () => {
    const onChange = vi.fn();
    render(
      <FilterQueryBar
        fields={fields}
        defaultValue={[
          { field: 'assignee', op: 'eq', value: 'me', raw: 'assignee:me' },
          { field: 'priority', op: 'eq', value: 'high', raw: 'priority:high' },
        ]}
        onChange={onChange}
      />,
    );
    const input = screen.getByLabelText('Filter query input');
    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0]).toEqual([
      { field: 'assignee', op: 'eq', value: 'me', raw: 'assignee:me' },
    ]);
  });

  it('clicking a chip × removes the chip', () => {
    const onChange = vi.fn();
    render(
      <FilterQueryBar
        fields={fields}
        defaultValue={[{ field: 'assignee', op: 'eq', value: 'me', raw: 'assignee:me' }]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByLabelText('Remove filter assignee:me'));
    expect(onChange.mock.calls[0]![0]).toEqual([]);
  });

  it('Enter promotes a field:value token without trailing space', () => {
    const onChange = vi.fn();
    render(<FilterQueryBar fields={fields} onChange={onChange} />);
    const input = screen.getByLabelText('Filter query input');
    fireEvent.change(input, { target: { value: 'priority:high' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange.mock.calls.at(-1)![0]).toEqual([
      { field: 'priority', op: 'eq', value: 'high', raw: 'priority:high' },
    ]);
  });

  it('emits onTextChange with residual free text', () => {
    const onTextChange = vi.fn();
    render(<FilterQueryBar fields={fields} onTextChange={onTextChange} />);
    const input = screen.getByLabelText('Filter query input');
    fireEvent.change(input, { target: { value: 'free typing' } });
    expect(onTextChange).toHaveBeenCalled();
    expect(onTextChange.mock.calls.at(-1)![0]).toBe('free typing');
  });

  it('exposes configured field grammar via data-cir-fields', () => {
    const { container } = render(<FilterQueryBar fields={fields} />);
    const root = container.querySelector('[data-cir-component="FilterQueryBar"]');
    expect(root?.getAttribute('data-cir-fields')).toBe('assignee,count,priority,status');
  });

  it('text-render formatter reports filter count', () => {
    expect(filterQueryBarTextRender({ fields })).toBe('[FilterQueryBar: 0 active filters]');
    expect(
      filterQueryBarTextRender({
        fields,
        defaultValue: [{ field: 'a', op: 'eq', value: 'x', raw: 'a:x' }],
      }),
    ).toBe('[FilterQueryBar: 1 active filters]');
  });

  it('binding registers the FilterQueryBar id', () => {
    expect(FilterQueryBarBinding.id).toBe('FilterQueryBar');
    expect(FilterQueryBarBinding.factory).toBe(FilterQueryBar);
  });
});
