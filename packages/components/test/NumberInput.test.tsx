// @vitest-environment happy-dom
import './setup.js';
import { createRef, useState, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NumberInput, NumberInputBinding } from '../src/components/NumberInput.js';

describe('NumberInput', () => {
  it('binds the label to the input via for/id', () => {
    render(<NumberInput label="Qty" value={0} onChange={() => undefined} />);
    const input = screen.getByLabelText<HTMLInputElement>('Qty');
    expect(input.id).toBeTruthy();
    expect(input.type).toBe('number');
    expect(input.getAttribute('inputmode')).toBe('decimal');
  });

  it('forwards min/max/step to the underlying input', () => {
    render(
      <NumberInput label="Qty" value={5} min={0} max={100} step={5} onChange={() => undefined} />,
    );
    const input = screen.getByLabelText<HTMLInputElement>('Qty');
    expect(input.min).toBe('0');
    expect(input.max).toBe('100');
    expect(input.step).toBe('5');
  });

  it('default step is 1', () => {
    render(<NumberInput label="Qty" value={5} onChange={() => undefined} />);
    const input = screen.getByLabelText<HTMLInputElement>('Qty');
    expect(input.step).toBe('1');
  });

  it('emits a number when the user types a valid number', () => {
    function Harness(): ReactNode {
      const [v, setV] = useState<number | ''>(0);
      return <NumberInput label="Qty" value={v} onChange={setV} />;
    }
    render(<Harness />);
    const input = screen.getByLabelText<HTMLInputElement>('Qty');
    fireEvent.change(input, { target: { value: '42' } });
    expect(input.value).toBe('42');
  });

  it("emits '' when the user clears the field", () => {
    let last: number | '' = 7;
    render(
      <NumberInput
        label="Qty"
        value={7}
        onChange={(v) => {
          last = v;
        }}
      />,
    );
    const input = screen.getByLabelText<HTMLInputElement>('Qty');
    fireEvent.change(input, { target: { value: '' } });
    expect(last).toBe('');
  });

  it('renders helperText and error', () => {
    render(
      <NumberInput
        label="Qty"
        value={1}
        onChange={() => undefined}
        helperText="non-negative"
        error="too low"
      />,
    );
    const input = screen.getByLabelText<HTMLInputElement>('Qty');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('non-negative')).toBeTruthy();
    expect(screen.getByText('too low')).toBeTruthy();
  });

  it('forwards ref to the underlying input', () => {
    const ref = createRef<HTMLInputElement>();
    render(<NumberInput ref={ref} label="Qty" value={0} onChange={() => undefined} />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });

  it('binding id matches', () => {
    expect(NumberInputBinding.id).toBe('NumberInput');
  });
});
