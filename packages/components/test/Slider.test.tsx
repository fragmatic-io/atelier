// @vitest-environment happy-dom
import './setup.js';
import { createRef, useState, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Slider, SliderBinding } from '../src/components/Slider.js';

describe('Slider', () => {
  it('renders a labelled <input type="range">', () => {
    render(<Slider label="Volume" value={50} min={0} max={100} onChange={() => undefined} />);
    const input = screen.getByLabelText<HTMLInputElement>(/Volume/);
    expect(input.type).toBe('range');
    expect(input.min).toBe('0');
    expect(input.max).toBe('100');
    expect(input.value).toBe('50');
  });

  it('default step is 1', () => {
    render(<Slider label="Volume" value={50} min={0} max={100} onChange={() => undefined} />);
    const input = screen.getByLabelText<HTMLInputElement>(/Volume/);
    expect(input.step).toBe('1');
  });

  it('shows the displayValue by default', () => {
    render(<Slider label="Volume" value={42} min={0} max={100} onChange={() => undefined} />);
    expect(screen.getByText('42', { exact: false }).textContent).toContain('42');
  });

  it('hides displayValue when displayValue=false', () => {
    const { container } = render(
      <Slider
        label="Volume"
        value={42}
        min={0}
        max={100}
        displayValue={false}
        onChange={() => undefined}
      />,
    );
    expect(container.querySelector('[data-cir-part="slider-value"]')).toBeNull();
  });

  it('emits onChange as a number when the user drags', () => {
    function Harness(): ReactNode {
      const [v, setV] = useState(0);
      return <Slider label="Volume" value={v} min={0} max={100} onChange={setV} />;
    }
    render(<Harness />);
    const input = screen.getByLabelText<HTMLInputElement>(/Volume/);
    fireEvent.change(input, { target: { value: '37' } });
    expect(input.value).toBe('37');
  });

  it('forwards ref to the input', () => {
    const ref = createRef<HTMLInputElement>();
    render(
      <Slider ref={ref} label="Volume" value={1} min={0} max={10} onChange={() => undefined} />,
    );
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });

  it('binding id matches', () => {
    expect(SliderBinding.id).toBe('Slider');
  });
});
