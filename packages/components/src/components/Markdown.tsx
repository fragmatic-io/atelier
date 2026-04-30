// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Markdown — sanitized renderer. Variants (Wave 6 / P-10): bordered,
 * elevated, ghost (default), tinted.
 */
import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import type { ComponentBinding } from '@cir/runtime';
import { cn, contentVariantClass, type ContentVariant } from './_variants.js';

export type MarkdownVariant = ContentVariant;

export interface MarkdownProps {
  content: string;
  variant?: MarkdownVariant;
  className?: string;
}

export function Markdown({ content, variant = 'ghost', className }: MarkdownProps): ReactNode {
  return (
    <div
      data-cir-component="Markdown"
      data-variant={variant}
      className={cn(contentVariantClass[variant], className)}
    >
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
export const MarkdownBinding: ComponentBinding = { id: 'Markdown', factory: Markdown };
