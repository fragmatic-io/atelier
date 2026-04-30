// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatThread, ChatThreadBinding } from '../src/components/ChatThread.js';

const MESSAGES = [
  { id: 'm1', role: 'user' as const, content: 'hi' },
  {
    id: 'm2',
    role: 'assistant' as const,
    content: 'hello there',
    timestamp: '2026-04-29T10:00:00Z',
  },
  { id: 'm3', role: 'system' as const, content: 'system note', pending: true },
];

describe('ChatThread', () => {
  it('renders a log with aria-label', () => {
    render(<ChatThread messages={MESSAGES} />);
    expect(screen.getByRole('log', { name: 'Conversation' })).toBeTruthy();
  });

  it('renders one message per item', () => {
    render(<ChatThread messages={MESSAGES} />);
    expect(document.querySelectorAll('[data-cir-part="chat-message"]').length).toBe(3);
  });

  it('reflects role via data-role', () => {
    render(<ChatThread messages={MESSAGES} />);
    const items = document.querySelectorAll('[data-cir-part="chat-message"]');
    expect(items[0]?.getAttribute('data-role')).toBe('user');
    expect(items[1]?.getAttribute('data-role')).toBe('assistant');
    expect(items[2]?.getAttribute('data-role')).toBe('system');
  });

  it('marks pending messages via data-pending', () => {
    render(<ChatThread messages={MESSAGES} />);
    const items = document.querySelectorAll('[data-cir-part="chat-message"]');
    expect(items[0]?.getAttribute('data-pending')).toBe('false');
    expect(items[2]?.getAttribute('data-pending')).toBe('true');
  });

  it('renders timestamps as <time> with dateTime', () => {
    render(<ChatThread messages={MESSAGES} />);
    const t = document.querySelector('[data-cir-part="chat-timestamp"]') as HTMLTimeElement;
    expect(t.tagName).toBe('TIME');
    expect(t.getAttribute('datetime')).toBe('2026-04-29T10:00:00Z');
  });

  it('omits the <time> element when no timestamp', () => {
    render(<ChatThread messages={[{ id: 'a', role: 'user', content: 'hi' }]} />);
    expect(document.querySelector('[data-cir-part="chat-timestamp"]')).toBeNull();
  });

  it('autoScroll defaults to true and scrolls to bottom on update', () => {
    const { rerender, container } = render(<ChatThread messages={MESSAGES} />);
    const ol = container.querySelector('ol[data-cir-component="ChatThread"]') as HTMLOListElement;
    // happy-dom doesn't run layout — fake scrollHeight so the effect can land.
    Object.defineProperty(ol, 'scrollHeight', { configurable: true, value: 1000 });
    rerender(
      <ChatThread
        messages={[...MESSAGES, { id: 'm4', role: 'user' as const, content: 'another' }]}
      />,
    );
    expect(ol.scrollTop).toBe(1000);
  });

  it('autoScroll=false leaves scrollTop alone', () => {
    const { rerender, container } = render(<ChatThread messages={MESSAGES} autoScroll={false} />);
    const ol = container.querySelector('ol[data-cir-component="ChatThread"]') as HTMLOListElement;
    Object.defineProperty(ol, 'scrollHeight', { configurable: true, value: 999 });
    rerender(
      <ChatThread
        autoScroll={false}
        messages={[...MESSAGES, { id: 'mx', role: 'user' as const, content: 'x' }]}
      />,
    );
    expect(ol.scrollTop).toBe(0);
  });

  it('renders custom aria-label', () => {
    render(<ChatThread messages={MESSAGES} aria-label="Support chat" />);
    expect(screen.getByRole('log', { name: 'Support chat' })).toBeTruthy();
  });

  it('binding id matches', () => {
    expect(ChatThreadBinding.id).toBe('ChatThread');
  });

  // -- Vis-4 variant tests ---------------------------------------------------
  it('defaults to variant=default and emits data-variant', () => {
    render(<ChatThread messages={MESSAGES} />);
    const log = screen.getByRole('log');
    expect(log.getAttribute('data-variant')).toBe('default');
    expect(log.className).toContain('gap-3');
  });
  it('reflects variant=compact class', () => {
    render(<ChatThread messages={MESSAGES} variant="compact" />);
    const log = screen.getByRole('log');
    expect(log.className).toContain('gap-1');
  });
  it('reflects variant=split class', () => {
    render(<ChatThread messages={MESSAGES} variant="split" />);
    const log = screen.getByRole('log');
    expect(log.getAttribute('data-variant')).toBe('split');
  });
});
