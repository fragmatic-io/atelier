// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Accordion, AccordionBinding } from '../src/components/Accordion.js';

const ITEMS = [
  { id: 'a', header: 'Header A', content: <div>body-a</div> },
  { id: 'b', header: 'Header B', content: <div>body-b</div> },
];

describe('Accordion', () => {
  it('renders one <details> element per item', () => {
    const { container } = render(<Accordion items={ITEMS} />);
    expect(container.querySelectorAll('details').length).toBe(2);
  });

  it('items default to closed', () => {
    const { container } = render(<Accordion items={ITEMS} />);
    const all = container.querySelectorAll('details');
    expect(all[0]?.open).toBe(false);
    expect(all[1]?.open).toBe(false);
  });

  it('honours defaultOpen', () => {
    const { container } = render(<Accordion items={ITEMS} defaultOpen={['b']} />);
    const all = container.querySelectorAll('details');
    expect(all[0]?.open).toBe(false);
    expect(all[1]?.open).toBe(true);
  });

  it('opens an item via click on its summary (single mode)', () => {
    const { container } = render(<Accordion items={ITEMS} />);
    const all = container.querySelectorAll('details');
    const first = all[0]!;
    first.open = true;
    fireEvent(first, new Event('toggle', { bubbles: false }));
    expect(first.open).toBe(true);
  });

  it('single mode auto-closes other items when one opens', () => {
    const { container } = render(<Accordion items={ITEMS} defaultOpen={['a']} />);
    const all = container.querySelectorAll('details');
    const second = all[1]!;
    second.open = true;
    fireEvent(second, new Event('toggle', { bubbles: false }));
    expect(all[0]?.open).toBe(false);
    expect(all[1]?.open).toBe(true);
  });

  it('multiple mode allows several open at once', () => {
    const { container } = render(<Accordion multiple items={ITEMS} defaultOpen={['a']} />);
    const all = container.querySelectorAll('details');
    const second = all[1]!;
    second.open = true;
    fireEvent(second, new Event('toggle', { bubbles: false }));
    expect(all[0]?.open).toBe(true);
    expect(all[1]?.open).toBe(true);
  });

  it('exposes data-multiple attr', () => {
    const { container } = render(<Accordion multiple items={ITEMS} />);
    expect(
      container.querySelector('[data-cir-component="Accordion"]')?.getAttribute('data-multiple'),
    ).toBe('true');
  });

  it('renders headers and bodies', () => {
    render(<Accordion items={ITEMS} defaultOpen={['a']} />);
    expect(screen.getByText('Header A')).toBeTruthy();
    expect(screen.getByText('body-a')).toBeTruthy();
  });

  it('binding id matches', () => {
    expect(AccordionBinding.id).toBe('Accordion');
  });
});
