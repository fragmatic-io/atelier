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
    const tabButtons = screen.getAllByRole('tab');
    expect(tabButtons.length).toBe(3);
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
    const first = screen.getByRole('tab', { name: 'One' });
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(screen.getByText('panel-two')).toBeTruthy();
  });

  it('arrow-left wraps to last', () => {
    render(<Tabs tabs={TABS} />);
    const first = screen.getByRole('tab', { name: 'One' });
    fireEvent.keyDown(first, { key: 'ArrowLeft' });
    expect(screen.getByText('panel-three')).toBeTruthy();
  });

  it('Home/End jump to first/last', () => {
    render(<Tabs tabs={TABS} defaultActiveId="two" />);
    const second = screen.getByRole('tab', { name: 'Two' });
    fireEvent.keyDown(second, { key: 'End' });
    expect(screen.getByText('panel-three')).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Three' }), { key: 'Home' });
    expect(screen.getByText('panel-one')).toBeTruthy();
  });

  it('binding id matches', () => {
    expect(TabsBinding.id).toBe('Tabs');
  });
});
