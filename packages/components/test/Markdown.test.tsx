// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Markdown, MarkdownBinding } from '../src/components/Markdown.js';

describe('Markdown', () => {
  it('renders content verbatim (no parsing in 4b)', () => {
    const md = '# Hello\n**bold** _italic_';
    const { container } = render(<Markdown content={md} />);
    const pre = container.querySelector('pre');
    expect(pre).toBeTruthy();
    expect(pre?.textContent).toBe(md);
    // No parsed elements should be present.
    expect(container.querySelector('strong')).toBeNull();
    expect(container.querySelector('em')).toBeNull();
    expect(container.querySelector('h1')).toBeNull();
  });

  it('handles long content without crashing', () => {
    const long = 'x'.repeat(10_000);
    const { container } = render(<Markdown content={long} />);
    expect(container.querySelector('pre')?.textContent?.length).toBe(10_000);
  });

  it('binding id matches', () => {
    expect(MarkdownBinding.id).toBe('Markdown');
  });
});
