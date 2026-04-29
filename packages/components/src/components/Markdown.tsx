// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
/**
 * Markdown — Phase 4b stub. Renders the source content verbatim inside a
 * `<pre>` so whitespace is preserved and there's no accidental HTML
 * injection. Intentionally has NO markdown parser dependency at this phase.
 *
 * Phase 5 swap-in: we'll evaluate `react-markdown` (or `marked` + a custom
 * renderer) once the security model around DOMPurify, raw HTML pass-through,
 * and link target sanitization is decided. Until then, treating markdown as
 * preformatted text is safe and forward-compatible (consumers of this 4b
 * surface get the raw string; 4c demo can opt into a rich renderer).
 */
import type { ReactNode } from 'react';
import type { ComponentBinding } from '@cir/runtime';

export interface MarkdownProps {
  content: string;
  className?: string;
}

export function Markdown({ content, className }: MarkdownProps): ReactNode {
  // PHASE-5-TODO: replace with react-markdown + DOMPurify once policy lands.
  return (
    <pre
      data-cir-component="Markdown"
      data-cir-phase="4b-stub"
      className={className}
      style={{ whiteSpace: 'pre-wrap', margin: 0 }}
    >
      {content}
    </pre>
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
