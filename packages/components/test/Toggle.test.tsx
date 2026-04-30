// @vitest-environment happy-dom
import './setup.js';
import { createRef, useState, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Toggle, ToggleBinding } from '../src/components/Toggle.js';

describe('Toggle', () => {
  it('renders a <button role="switch"> with aria-checked', () => {
    render(<Toggle label="Notifications" checked={false} onChange={() => undefined} />);
    const sw = screen.getByRole('switch');
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect(sw.getAttribute('data-checked')).toBe('false');
  });

  it('reflects checked=true via aria-checked and data-checked', () => {
    render(<Toggle label="Notifications" checked={true} onChange={() => undefined} />);
    const sw = screen.getByRole('switch');
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(sw.getAttribute('data-checked')).toBe('true');
  });

  it('clicking the switch fires onChange with the negation', () => {
    function Harness(): ReactNode {
      const [c, setC] = useState(false);
      return <Toggle label="Notifications" checked={c} onChange={setC} />;
    }
    render(<Harness />);
    const sw = screen.getByRole('switch');
    expect(sw.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(sw);
    expect(sw.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(sw);
    expect(sw.getAttribute('aria-checked')).toBe('false');
  });

  it('label is associated via aria-labelledby', () => {
    render(<Toggle label="Notifications" checked={false} onChange={() => undefined} />);
    const sw = screen.getByRole('switch');
    const labelledBy = sw.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)?.textContent).toBe('Notifications');
  });

  it('forwards ref to the switch button', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Toggle ref={ref} label="Notifications" checked={false} onChange={() => undefined} />);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it('binding id matches', () => {
    expect(ToggleBinding.id).toBe('Toggle');
  });

  // -- Vis-4 variant tests ---------------------------------------------------
  it('defaults to variant=default and emits data-variant', () => {
    const { container } = render(
      <Toggle label="Notifications" checked={false} onChange={() => undefined} />,
    );
    const root = container.querySelector('[data-cir-component="Toggle"]');
    expect(root?.getAttribute('data-variant')).toBe('default');
  });
  it('reflects variant=embedded on data-variant', () => {
    const { container } = render(
      <Toggle
        label="Notifications"
        checked={false}
        onChange={() => undefined}
        variant="embedded"
      />,
    );
    const root = container.querySelector('[data-cir-component="Toggle"]');
    expect(root?.getAttribute('data-variant')).toBe('embedded');
    expect(root?.className).toContain('bg-transparent');
  });
  it('reflects variant=minimal class', () => {
    const { container } = render(
      <Toggle label="Notifications" checked={false} onChange={() => undefined} variant="minimal" />,
    );
    const root = container.querySelector('[data-cir-component="Toggle"]');
    expect(root?.className).toContain('border-b');
  });
});
