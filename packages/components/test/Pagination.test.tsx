// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Pagination, PaginationBinding } from '../src/components/Pagination.js';

describe('Pagination', () => {
  it('renders <nav aria-label="Pagination">', () => {
    render(<Pagination currentPage={1} totalPages={3} onPageChange={() => undefined} />);
    expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeTruthy();
  });

  it('disables Prev on the first page and Next on the last', () => {
    render(<Pagination currentPage={1} totalPages={3} onPageChange={() => undefined} />);
    expect(screen.getByLabelText<HTMLButtonElement>('Previous page').disabled).toBe(true);
    expect(screen.getByLabelText<HTMLButtonElement>('Next page').disabled).toBe(false);
  });

  it('marks the current page button with aria-current="page"', () => {
    render(<Pagination currentPage={3} totalPages={5} onPageChange={() => undefined} />);
    const current = screen.getByLabelText('Page 3');
    expect(current.getAttribute('aria-current')).toBe('page');
    expect(current.getAttribute('data-current')).toBe('true');
  });

  it('truncates with ellipses for large ranges (1 … 4 5 6 … 10)', () => {
    const { container } = render(
      <Pagination currentPage={5} totalPages={10} onPageChange={() => undefined} />,
    );
    const ellipses = container.querySelectorAll('[data-cir-part="pagination-ellipsis"]');
    expect(ellipses.length).toBe(2);
    expect(screen.getByLabelText('Page 1')).toBeTruthy();
    expect(screen.getByLabelText('Page 10')).toBeTruthy();
    expect(screen.getByLabelText('Page 4')).toBeTruthy();
    expect(screen.getByLabelText('Page 5')).toBeTruthy();
    expect(screen.getByLabelText('Page 6')).toBeTruthy();
  });

  it('Prev / Next buttons fire onPageChange with the correct page', () => {
    const calls: number[] = [];
    render(
      <Pagination
        currentPage={3}
        totalPages={5}
        onPageChange={(p) => {
          calls.push(p);
        }}
      />,
    );
    fireEvent.click(screen.getByLabelText('Previous page'));
    fireEvent.click(screen.getByLabelText('Next page'));
    expect(calls).toEqual([2, 4]);
  });

  it('clicking a page number fires onPageChange', () => {
    const calls: number[] = [];
    render(
      <Pagination
        currentPage={1}
        totalPages={3}
        onPageChange={(p) => {
          calls.push(p);
        }}
      />,
    );
    fireEvent.click(screen.getByLabelText('Page 2'));
    expect(calls).toEqual([2]);
  });

  it('clicking the current page does not fire onPageChange', () => {
    const calls: number[] = [];
    render(
      <Pagination
        currentPage={2}
        totalPages={3}
        onPageChange={(p) => {
          calls.push(p);
        }}
      />,
    );
    fireEvent.click(screen.getByLabelText('Page 2'));
    expect(calls.length).toBe(0);
  });

  it('binding id matches', () => {
    expect(PaginationBinding.id).toBe('Pagination');
  });
});
