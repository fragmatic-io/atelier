// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
/**
 * Markdown — sanitized renderer.
 *
 * Uses `react-markdown` with `remark-gfm` (tables, task-lists, strikethrough,
 * autolinks) and `rehype-sanitize` against the conservative default schema
 * (`defaultSchema` from `hast-util-sanitize`). That schema:
 *   - allows safe HTML tags (p, h1-h6, ul/ol/li, code, pre, table, etc.)
 *   - strips `<script>`, event-handler attrs, and `javascript:` URLs
 *   - permits `http`, `https`, `mailto`, and relative URLs only
 *
 * External links get `rel="noopener noreferrer"` and `target="_blank"` via
 * a small `components` override. We do NOT allow raw HTML pass-through —
 * react-markdown's default already strips it.
 *
 * Trade-off: this is intentionally conservative. If a host needs richer
 * rendering (e.g. embedded MDX, syntax-highlighted code blocks), they can
 * compose their own component and register it in their own catalog.
 */
import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import type { ComponentBinding } from '@cir/runtime';

export interface MarkdownProps {
  content: string;
  className?: string;
}

export function Markdown({ content, className }: MarkdownProps): ReactNode {
  return (
    <div data-cir-component="Markdown" className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          a: ({ href, children, ...rest }) => {
            const external = typeof href === 'string' && /^https?:/i.test(href);
            return (
              <a
                href={href}
                {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                {...rest}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

Markdown.displayName = 'Markdown';

export function markdownTextRender(props: MarkdownProps): string {
  return props.content;
}

export const MarkdownBinding: ComponentBinding = {
  id: 'Markdown',
  factory: Markdown,
};
