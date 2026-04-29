// @vitest-environment happy-dom
import './setup.js';
import { useState, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Select, SelectBinding } from '../src/components/Select.js';

const OPTS = [
  { value: 'a', label: 'Apple' },
  { value: 'b', label: 'Banana' },
  { value: 'c', label: 'Cherry' },
];

describe('Select', () => {
  it('renders all options', () => {
    render(<Select label="Fruit" options={OPTS} value="a" onChange={() => undefined} />);
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('reflects value as selected option', () => {
    render(<Select label="Fruit" options={OPTS} value="b" onChange={() => undefined} />);
    const select = screen.getByLabelText<HTMLSelectElement>('Fruit');
    expect(select.value).toBe('b');
  });

  it('fires onChange with the new value', () => {
    function Harness(): ReactNode {
      const [v, setV] = useState('a');
      return <Select label="Fruit" options={OPTS} value={v} onChange={setV} />;
    }
    render(<Harness />);
    const select = screen.getByLabelText<HTMLSelectElement>('Fruit');
    fireEvent.change(select, { target: { value: 'c' } });
    expect(select.value).toBe('c');
  });

  it('binding id matches', () => {
    expect(SelectBinding.id).toBe('Select');
  });
});
