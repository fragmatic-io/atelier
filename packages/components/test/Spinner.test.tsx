// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Spinner, SpinnerBinding } from '../src/components/Spinner.js';

describe('Spinner', () => {
  it('renders a default loading label inside a status output', () => {
    render(<Spinner />);
    const status = screen.getByRole('status');
    expect(status.tagName).toBe('OUTPUT');
    expect(status.textContent).toBe('Loading…');
  });

  it('renders a custom label', () => {
    render(<Spinner label="Please wait" />);
    expect(screen.getByRole('status').textContent).toBe('Please wait');
  });

  it('keeps label in the DOM but visually hidden when srOnly', () => {
    const { container } = render(<Spinner label="Loading" srOnly />);
    const span = container.querySelector('span');
    expect(span?.textContent).toBe('Loading');
    expect(span?.style.position).toBe('absolute');
    expect(span?.style.width).toBe('1px');
  });

  it('does not apply sr-only style when srOnly is false', () => {
    const { container } = render(<Spinner label="Loading" />);
    const span = container.querySelector('span') as HTMLElement;
    // Position should not be absolute when not srOnly
    expect(span.style.position).toBe('');
  });

  it('binding id matches', () => {
    expect(SpinnerBinding.id).toBe('Spinner');
  });
});
