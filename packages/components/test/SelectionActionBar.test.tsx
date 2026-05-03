// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, act } from '@testing-library/react';
import {
  SelectionActionBar,
  SelectionActionBarBinding,
  selectionActionBarTextRender,
  DEFAULT_AI_SELECTION_ACTIONS,
  type SelectionAction,
} from '../src/components/SelectionActionBar.js';

/**
 * Drive a selection inside `el` covering all of its text. happy-dom
 * supports the basic `getSelection()` / `Range` API so the bar's
 * selectionchange handler fires and the toolbar mounts.
 */
function selectAllText(el: HTMLElement): void {
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  if (!sel) throw new Error('window.getSelection() returned null');
  sel.removeAllRanges();
  sel.addRange(range);
  document.dispatchEvent(new Event('selectionchange'));
}

describe('<SelectionActionBar>', () => {
  beforeEach(() => {
    const sel = window.getSelection();
    sel?.removeAllRanges();
  });

  it('renders nothing when there is no selection', () => {
    const { container } = render(
      <div data-cir-ai-selectable="true">
        <SelectionActionBar />
      </div>,
    );
    expect(container.querySelector('[data-cir-component="SelectionActionBar"]')).toBeNull();
  });

  it('mounts the toolbar when text inside the scoped container is selected', () => {
    render(
      <div data-cir-ai-selectable="true">
        <p data-testid="prose">hello world</p>
        <SelectionActionBar />
      </div>,
    );
    act(() => selectAllText(screen.getByTestId('prose')));
    expect(screen.getByRole('toolbar', { name: 'AI actions for selection' })).toBeTruthy();
  });

  it('renders all 4 default actions', () => {
    render(
      <div data-cir-ai-selectable="true">
        <p data-testid="prose">selected text</p>
        <SelectionActionBar />
      </div>,
    );
    act(() => selectAllText(screen.getByTestId('prose')));
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBe(4);
    const labels = buttons.map((b) => b.textContent?.trim());
    expect(labels).toContain('Summarize');
    expect(labels).toContain('Improve');
    expect(labels).toContain('Translate');
    expect(labels).toContain('Ask AI');
  });

  it('clicking an action dispatches with { text, surface }', () => {
    const dispatcher = vi.fn().mockResolvedValue(undefined);
    render(
      <div data-cir-ai-selectable="true">
        <p data-testid="prose">hello there</p>
        <SelectionActionBar dispatcher={dispatcher} surface="thread" />
      </div>,
    );
    act(() => selectAllText(screen.getByTestId('prose')));
    fireEvent.click(screen.getByRole('button', { name: /Summarize/ }));
    expect(dispatcher).toHaveBeenCalledTimes(1);
    expect(dispatcher).toHaveBeenCalledWith('ai.summarize', {
      text: 'hello there',
      surface: 'thread',
    });
  });

  it('also calls onAction alongside the dispatch', () => {
    const onAction = vi.fn();
    render(
      <div data-cir-ai-selectable="true">
        <p data-testid="prose">test</p>
        <SelectionActionBar onAction={onAction} />
      </div>,
    );
    act(() => selectAllText(screen.getByTestId('prose')));
    fireEvent.click(screen.getByRole('button', { name: /Improve/ }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect((onAction.mock.calls[0]![0] as SelectionAction).capability).toBe('ai.improve');
  });

  it('respects per-action `visible` predicate', () => {
    const actions: SelectionAction[] = [
      { capability: 'ai.summarize', label: 'Summarize' },
      {
        capability: 'ai.improve',
        label: 'Improve',
        visible: ({ text }) => text.length > 100,
      },
    ];
    render(
      <div data-cir-ai-selectable="true">
        <p data-testid="prose">short</p>
        <SelectionActionBar actions={actions} />
      </div>,
    );
    act(() => selectAllText(screen.getByTestId('prose')));
    expect(screen.queryByRole('button', { name: /Improve/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Summarize/ })).toBeTruthy();
  });

  it('Escape dismisses the toolbar', () => {
    render(
      <div data-cir-ai-selectable="true">
        <p data-testid="prose">selected</p>
        <SelectionActionBar />
      </div>,
    );
    act(() => selectAllText(screen.getByTestId('prose')));
    expect(screen.getByRole('toolbar')).toBeTruthy();
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  it('Enter triggers the first visible action', () => {
    const dispatcher = vi.fn().mockResolvedValue(undefined);
    render(
      <div data-cir-ai-selectable="true">
        <p data-testid="prose">x</p>
        <SelectionActionBar dispatcher={dispatcher} />
      </div>,
    );
    act(() => selectAllText(screen.getByTestId('prose')));
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    });
    expect(dispatcher).toHaveBeenCalledTimes(1);
    expect(dispatcher.mock.calls[0]![0]).toBe('ai.summarize');
  });

  it('does not surface for selections OUTSIDE the scoped subtree', () => {
    render(
      <>
        <p data-testid="outside-prose">outside text</p>
        <div data-cir-ai-selectable="true">
          <p data-testid="inside-prose">inside text</p>
          <SelectionActionBar />
        </div>
      </>,
    );
    act(() => selectAllText(screen.getByTestId('outside-prose')));
    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  it('text-render formatter reports action count', () => {
    expect(selectionActionBarTextRender({})).toBe('[SelectionActionBar: 4 actions]');
    expect(selectionActionBarTextRender({ actions: [{ capability: 'a', label: 'A' }] })).toBe(
      '[SelectionActionBar: 1 actions]',
    );
  });

  it('binding registers the SelectionActionBar id', () => {
    expect(SelectionActionBarBinding.id).toBe('SelectionActionBar');
    expect(SelectionActionBarBinding.factory).toBe(SelectionActionBar);
  });

  it('default-actions list ships exactly 4 entries', () => {
    expect(DEFAULT_AI_SELECTION_ACTIONS.length).toBe(4);
    expect(DEFAULT_AI_SELECTION_ACTIONS.map((a) => a.capability)).toEqual([
      'ai.summarize',
      'ai.improve',
      'ai.translate',
      'ai.ask',
    ]);
  });
});
