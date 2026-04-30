// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Tabs, TabsBinding } from '../src/components/Tabs.js';

const TABS = [
  { id: 'one', label: 'One', content: <div>panel-one</div> },
  { id: 'two', label: 'Two', content: <div>panel-two</div> },
  { id: 'three', label: 'Three', content: <div>panel-three</div> },
];

describe('Tabs', () => {
  it('renders a tablist with one button per tab', () => {
    render(<Tabs tabs={TABS} />);
    expect(screen.getByRole('tablist')).toBeTruthy();
    expect(screen.getAllByRole('tab').length).toBe(3);
  });
  it('selects the first tab by default and renders its panel', () => {
    render(<Tabs tabs={TABS} />);
    expect(screen.getByText('panel-one')).toBeTruthy();
    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
    expect(tabs[1]?.getAttribute('aria-selected')).toBe('false');
  });
  it('honours defaultActiveId', () => {
    render(<Tabs tabs={TABS} defaultActiveId="two" />);
    expect(screen.getByText('panel-two')).toBeTruthy();
    const tabs = screen.getAllByRole('tab');
    expect(tabs[1]?.getAttribute('aria-selected')).toBe('true');
  });
  it('switches panels when a tab is clicked', () => {
    render(<Tabs tabs={TABS} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Two' }));
    expect(screen.getByText('panel-two')).toBeTruthy();
    expect(screen.queryByText('panel-one')).toBeNull();
  });
  it('arrow-right cycles selection forward', () => {
    render(<Tabs tabs={TABS} />);
    fireEvent.keyDown(screen.getByRole('tab', { name: 'One' }), { key: 'ArrowRight' });
    expect(screen.getByText('panel-two')).toBeTruthy();
  });
  it('arrow-left wraps to last', () => {
    render(<Tabs tabs={TABS} />);
    fireEvent.keyDown(screen.getByRole('tab', { name: 'One' }), { key: 'ArrowLeft' });
    expect(screen.getByText('panel-three')).toBeTruthy();
  });
  it('Home/End jump to first/last', () => {
    render(<Tabs tabs={TABS} defaultActiveId="two" />);
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Two' }), { key: 'End' });
    expect(screen.getByText('panel-three')).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Three' }), { key: 'Home' });
    expect(screen.getByText('panel-one')).toBeTruthy();
  });
  it('binding id matches', () => {
    expect(TabsBinding.id).toBe('Tabs');
  });
  // -- Wave 6 / P-10 variant assertions --
  it('defaults to variant=ghost', () => {
    const { container } = render(<Tabs tabs={TABS} />);
    expect(
      container.querySelector('[data-cir-component="Tabs"]')?.getAttribute('data-variant'),
    ).toBe('ghost');
  });
  it('reflects each variant on data-variant', () => {
    for (const v of ['bordered', 'elevated', 'ghost', 'tinted'] as const) {
      const { container, unmount } = render(<Tabs tabs={TABS} variant={v} />);
      expect(
        container.querySelector('[data-cir-component="Tabs"]')?.getAttribute('data-variant'),
      ).toBe(v);
      unmount();
    }
  });
  it('applies the bordered variant utility class', () => {
    const { container } = render(<Tabs tabs={TABS} variant="bordered" />);
    const root = container.querySelector('[data-cir-component="Tabs"]') as HTMLElement;
    expect(root.className).toContain('border');
  });
});
