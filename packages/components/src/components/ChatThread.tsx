// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';
/**
 * ChatThread — ordered list of conversation messages. Each message is
 * rendered as a `<li>` carrying `data-role` (user / assistant / system) and
 * `data-pending` for in-flight messages. Styling is the host's job —
 * Phase 4c CSS will paint role-aligned bubbles and pulse pending ones.
 *
 * Auto-scroll: a `useEffect` drives the container to its bottom every time
 * the messages array length changes. Hosts that want to pin to a specific
 * message (e.g. opening a thread mid-history) can pass `autoScroll={false}`
 * and own scroll via a ref into the rendered `<ol>`.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';
import { cn, chatThreadVariantClass, type ChatThreadVariant } from './_variants.js';

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: ReactNode;
  timestamp?: string;
  pending?: boolean;
}

export interface ChatThreadProps {
  messages: readonly ChatMessage[];
  autoScroll?: boolean;
  className?: string;
  'aria-label'?: string;
  variant?: ChatThreadVariant;
}

export function ChatThread({
  messages,
  autoScroll = true,
  className,
  'aria-label': ariaLabel = 'Conversation',
  variant = 'default',
}: ChatThreadProps): ReactNode {
  const listRef = useRef<HTMLOListElement | null>(null);

  useEffect(() => {
    if (!autoScroll) return;
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [autoScroll, messages.length]);

  return (
    <ol
      ref={listRef}
      role="log"
      aria-label={ariaLabel}
      aria-live="polite"
      data-cir-component="ChatThread"
      data-auto-scroll={autoScroll ? 'true' : 'false'}
      data-variant={variant}
      className={cn(chatThreadVariantClass[variant], className)}
      style={{ listStyle: 'none', margin: 0, padding: 0, overflowY: 'auto' }}
    >
      {messages.map((m) => (
        <li
          key={m.id}
          data-cir-part="chat-message"
          data-role={m.role}
          data-pending={m.pending === true ? 'true' : 'false'}
        >
          <div data-cir-part="chat-bubble">
            <div data-cir-part="chat-content">{m.content}</div>
            {m.timestamp !== undefined ? (
              <time data-cir-part="chat-timestamp" dateTime={m.timestamp}>
                {m.timestamp}
              </time>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

ChatThread.displayName = 'ChatThread';

export function chatThreadTextRender(props: ChatThreadProps): string {
  return `[ChatThread: ${String(props.messages.length)} messages]`;
}

export const ChatThreadBinding: ComponentBinding = {
  id: 'ChatThread',
  factory: ChatThread,
};
