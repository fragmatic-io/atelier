// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Markdown, MarkdownBinding } from '../src/components/Markdown.js';

describe('Markdown', () => {
  it('parses markdown into HTML elements (gfm enabled)', () => {
    const md = '# Hello\n\n**bold** and _italic_ and ~~strike~~.';
    const { container } = render(<Markdown content={md} />);
    expect(container.querySelector('h1')?.textContent).toBe('Hello');
    expect(container.querySelector('strong')?.textContent).toBe('bold');
    expect(container.querySelector('em')?.textContent).toBe('italic');
    // GFM strikethrough renders as <del>
    expect(container.querySelector('del')?.textContent).toBe('strike');
  });

  it('renders gfm tables', () => {
    const md = '| a | b |\n| - | - |\n| 1 | 2 |';
    const { container } = render(<Markdown content={md} />);
    expect(container.querySelector('table')).toBeTruthy();
    expect(container.querySelectorAll('th')).toHaveLength(2);
    expect(container.querySelectorAll('td')).toHaveLength(2);
  });

  it('strips raw HTML and dangerous attributes via rehype-sanitize', () => {
    const md = 'before <img src=x onerror="alert(1)" /> after';
    const { container } = render(<Markdown content={md} />);
    // No img element should survive sanitization (raw HTML is stripped by
    // react-markdown's default + rehype-sanitize doubly).
    expect(container.querySelector('img')).toBeNull();
    // No script tag
    expect(container.querySelector('script')).toBeNull();
    // Text content should still be present
    expect(container.textContent).toContain('before');
    expect(container.textContent).toContain('after');
  });

  it('strips javascript: URLs from links', () => {
    const md = '[click me](javascript:alert(1))';
    const { container } = render(<Markdown content={md} />);
    const link = container.querySelector('a');
    // rehype-sanitize drops the unsafe href entirely.
    expect(link?.getAttribute('href')).toBeFalsy();
  });

  it('marks external links with rel=noopener noreferrer and target=_blank', () => {
    const md = 'see [docs](https://cir.dev/docs)';
    const { container } = render(<Markdown content={md} />);
    const link = container.querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://cir.dev/docs');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('does not add target=_blank to relative links', () => {
    const md = 'see [home](/about)';
    const { container } = render(<Markdown content={md} />);
    const link = container.querySelector('a');
    expect(link?.getAttribute('target')).toBeNull();
  });

  it('handles long content without crashing', () => {
    const long = 'lorem ipsum '.repeat(1_000);
    const { container } = render(<Markdown content={long} />);
    expect(container.textContent?.length).toBeGreaterThan(10_000);
  });

  it('binding id matches', () => {
    expect(MarkdownBinding.id).toBe('Markdown');
  });
});
