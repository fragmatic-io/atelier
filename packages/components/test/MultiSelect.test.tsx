// @vitest-environment happy-dom
import './setup.js';
import { useState, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MultiSelect, MultiSelectBinding } from '../src/components/MultiSelect.js';

const OPTIONS = [
  { value: 'a', label: 'Apple' },
  { value: 'b', label: 'Banana' },
  { value: 'c', label: 'Cherry' },
];

describe('MultiSelect', () => {
  it('renders label + a multi <select> with one <option> per choice', () => {
    render(<MultiSelect label="Fruit" options={OPTIONS} values={[]} onChange={() => undefined} />);
    const select = screen.getByLabelText<HTMLSelectElement>('Fruit');
    expect(select.tagName).toBe('SELECT');
    expect(select.multiple).toBe(true);
    expect(select.querySelectorAll('option').length).toBe(3);
  });

  it('reflects the values prop in the DOM', () => {
    render(
      <MultiSelect
        label="Fruit"
        options={OPTIONS}
        values={['a', 'c']}
        onChange={() => undefined}
      />,
    );
    const select = screen.getByLabelText<HTMLSelectElement>('Fruit');
    const selected = Array.from(select.selectedOptions).map((o) => o.value);
    expect(selected.sort()).toEqual(['a', 'c']);
  });

  it('emits the next array of values via onChange', () => {
    function Harness(): ReactNode {
      const [v, setV] = useState<readonly string[]>(['a']);
      return <MultiSelect label="Fruit" options={OPTIONS} values={v} onChange={setV} />;
    }
    render(<Harness />);
    const select = screen.getByLabelText<HTMLSelectElement>('Fruit');
    Array.from(select.options).forEach((o) => {
      o.selected = o.value === 'b' || o.value === 'c';
    });
    fireEvent.change(select);
    const selected = Array.from(select.selectedOptions).map((o) => o.value);
    expect(selected.sort()).toEqual(['b', 'c']);
  });

  it('binding id matches', () => {
    expect(MultiSelectBinding.id).toBe('MultiSelect');
  });
});
