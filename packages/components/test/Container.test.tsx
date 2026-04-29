// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Container, ContainerBinding, CONTAINER_MAX_WIDTH } from '../src/components/Container.js';

describe('Container', () => {
  it('renders <main role="main"> with children', () => {
    render(<Container>content</Container>);
    const main = screen.getByRole('main');
    expect(main.tagName).toBe('MAIN');
    expect(main.textContent).toBe('content');
  });

  it('defaults to md max-width', () => {
    render(<Container>x</Container>);
    const main = screen.getByRole('main');
    expect(main.getAttribute('data-max-width')).toBe('md');
    expect(main.style.maxWidth).toBe(CONTAINER_MAX_WIDTH.md);
  });

  it('maps each maxWidth token to the canonical px value', () => {
    for (const key of Object.keys(CONTAINER_MAX_WIDTH) as (keyof typeof CONTAINER_MAX_WIDTH)[]) {
      const { unmount } = render(<Container maxWidth={key}>x</Container>);
      expect(screen.getByRole('main').style.maxWidth).toBe(CONTAINER_MAX_WIDTH[key]);
      unmount();
    }
  });

  it('supports padding="none"', () => {
    render(<Container padding="none">x</Container>);
    expect(screen.getByRole('main').style.padding).toBe('0px');
  });

  it('supports padding="sm"', () => {
    render(<Container padding="sm">x</Container>);
    expect(screen.getByRole('main').style.padding).toBe('8px');
  });

  it('binding id matches', () => {
    expect(ContainerBinding.id).toBe('Container');
  });
});
