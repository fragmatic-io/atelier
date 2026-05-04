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
  it('renders a Radix combobox trigger with the selected option', () => {
    render(<Select label="Fruit" options={OPTS} value="a" onChange={() => undefined} />);
    const trigger = screen.getByRole('combobox', { name: 'Fruit' });
    expect(trigger.textContent).toContain('Apple');
  });

  it('reflects value as selected trigger text', () => {
    render(<Select label="Fruit" options={OPTS} value="b" onChange={() => undefined} />);
    expect(screen.getByRole('combobox', { name: 'Fruit' }).textContent).toContain('Banana');
  });

  it('fires onChange with the new value', async () => {
    function Harness(): ReactNode {
      const [v, setV] = useState('a');
      return <Select label="Fruit" options={OPTS} value={v} onChange={setV} />;
    }
    render(<Harness />);
    const trigger = screen.getByRole('combobox', { name: 'Fruit' });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' });
    fireEvent.click(await screen.findByRole('option', { name: 'Cherry' }));
    expect(screen.getByRole('combobox', { name: 'Fruit' }).textContent).toContain('Cherry');
  });

  it('binding id matches', () => {
    expect(SelectBinding.id).toBe('Select');
  });
});
