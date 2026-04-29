// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Drawer, DrawerBinding } from '../src/components/Drawer.js';

describe('Drawer', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <Drawer open={false} onClose={() => undefined}>
        body
      </Drawer>,
    );
    expect(container.querySelector('[data-cir-component="Drawer"]')).toBeNull();
  });

  it('renders aside with title when open', () => {
    render(
      <Drawer open title="Filters" onClose={() => undefined}>
        body
      </Drawer>,
    );
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeTruthy();
    expect(screen.getByText('Filters')).toBeTruthy();
    expect(screen.getByText('body')).toBeTruthy();
  });

  it('default side is right', () => {
    const { container } = render(
      <Drawer open onClose={() => undefined}>
        x
      </Drawer>,
    );
    expect(
      container.querySelector('[data-cir-component="Drawer"]')?.getAttribute('data-cir-side'),
    ).toBe('right');
  });

  it('reflects side as data-cir-side attr', () => {
    const { container } = render(
      <Drawer open side="left" onClose={() => undefined}>
        x
      </Drawer>,
    );
    expect(
      container.querySelector('[data-cir-component="Drawer"]')?.getAttribute('data-cir-side'),
    ).toBe('left');
  });

  it('Escape closes', () => {
    const onClose = vi.fn();
    render(
      <Drawer open onClose={onClose}>
        x
      </Drawer>,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose on Escape when closed', () => {
    const onClose = vi.fn();
    render(
      <Drawer open={false} onClose={onClose}>
        x
      </Drawer>,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('clicking the backdrop closes', () => {
    const onClose = vi.fn();
    const { container } = render(
      <Drawer open onClose={onClose}>
        x
      </Drawer>,
    );
    const backdrop = container.querySelector('[data-cir-part="drawer-backdrop"]')!;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('binding id matches', () => {
    expect(DrawerBinding.id).toBe('Drawer');
  });
});
