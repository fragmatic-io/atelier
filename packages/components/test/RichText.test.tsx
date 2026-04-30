// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RichText, RichTextBinding, sanitizeRichTextHtml } from '../src/components/RichText.js';

describe('RichText', () => {
  it('seeds the editor with the initial value', () => {
    render(<RichText value="<p>hello</p>" onChange={() => undefined} label="Body" />);
    const editor = document.querySelector('[data-cir-part="richtext-editor"]')!;
    expect(editor.innerHTML).toBe('<p>hello</p>');
  });

  it('renders the label', () => {
    render(<RichText value="" onChange={() => undefined} label="Notes" />);
    expect(screen.getByText('Notes')).toBeTruthy();
  });

  it('emits sanitised HTML on input', () => {
    const onChange = vi.fn();
    render(<RichText value="" onChange={onChange} label="Body" />);
    const editor = document.querySelector('[data-cir-part="richtext-editor"]')!;
    editor.innerHTML = '<b>hi</b><script>alert(1)</script>';
    fireEvent.input(editor);
    const got = onChange.mock.calls[0]?.[0] as string;
    expect(got).toContain('<b>hi</b>');
    expect(got).not.toContain('<script>');
  });

  it('renders default toolbar with all four buttons', () => {
    render(<RichText value="" onChange={() => undefined} label="Body" />);
    expect(document.querySelector('[data-cir-part="richtext-bold"]')).toBeTruthy();
    expect(document.querySelector('[data-cir-part="richtext-italic"]')).toBeTruthy();
    expect(document.querySelector('[data-cir-part="richtext-link"]')).toBeTruthy();
    expect(document.querySelector('[data-cir-part="richtext-bullet"]')).toBeTruthy();
  });

  it('honours a restricted toolbar prop', () => {
    render(
      <RichText value="" onChange={() => undefined} label="Body" toolbar={['bold', 'italic']} />,
    );
    expect(document.querySelector('[data-cir-part="richtext-bold"]')).toBeTruthy();
    expect(document.querySelector('[data-cir-part="richtext-italic"]')).toBeTruthy();
    expect(document.querySelector('[data-cir-part="richtext-link"]')).toBeNull();
    expect(document.querySelector('[data-cir-part="richtext-bullet"]')).toBeNull();
  });

  it('hides the toolbar when toolbar=[]', () => {
    render(<RichText value="" onChange={() => undefined} label="Body" toolbar={[]} />);
    expect(document.querySelector('[data-cir-part="richtext-toolbar"]')).toBeNull();
  });

  it('toolbar buttons trigger execCommand and re-emit sanitised value', () => {
    const exec = vi.fn().mockReturnValue(true);
    // Mock execCommand on the document.
    (document as unknown as { execCommand: typeof exec }).execCommand = exec;
    const onChange = vi.fn();
    render(<RichText value="" onChange={onChange} label="Body" />);
    fireEvent.click(document.querySelector('[data-cir-part="richtext-bold"]')!);
    expect(exec).toHaveBeenCalledWith('bold', false, undefined);
    fireEvent.click(document.querySelector('[data-cir-part="richtext-italic"]')!);
    expect(exec).toHaveBeenCalledWith('italic', false, undefined);
    fireEvent.click(document.querySelector('[data-cir-part="richtext-bullet"]')!);
    expect(exec).toHaveBeenCalledWith('insertUnorderedList', false, undefined);
    expect(onChange).toHaveBeenCalled();
  });

  it('link button prompts for a URL and calls createLink', () => {
    const exec = vi.fn().mockReturnValue(true);
    (document as unknown as { execCommand: typeof exec }).execCommand = exec;
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('https://example.com');
    render(<RichText value="" onChange={() => undefined} label="Body" />);
    fireEvent.click(document.querySelector('[data-cir-part="richtext-link"]')!);
    expect(exec).toHaveBeenCalledWith('createLink', false, 'https://example.com');
    promptSpy.mockRestore();
  });

  it('link button cancels when prompt returns empty', () => {
    const exec = vi.fn().mockReturnValue(true);
    (document as unknown as { execCommand: typeof exec }).execCommand = exec;
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('');
    render(<RichText value="" onChange={() => undefined} label="Body" />);
    fireEvent.click(document.querySelector('[data-cir-part="richtext-link"]')!);
    expect(exec).not.toHaveBeenCalledWith('createLink', false, expect.any(String));
    promptSpy.mockRestore();
  });

  it('forwards ariaDescribedBy', () => {
    render(
      <RichText value="" onChange={() => undefined} label="Body" ariaDescribedBy="helper-id" />,
    );
    const editor = document.querySelector('[data-cir-part="richtext-editor"]')!;
    expect(editor.getAttribute('aria-describedby')).toBe('helper-id');
  });

  it('binding id matches', () => {
    expect(RichTextBinding.id).toBe('RichText');
  });

  // -- Vis-4 variant tests ---------------------------------------------------
  it('defaults to variant=default and emits data-variant', () => {
    const { container } = render(<RichText value="" onChange={() => undefined} label="Body" />);
    const root = container.querySelector('[data-cir-component="RichText"]');
    expect(root?.getAttribute('data-variant')).toBe('default');
  });
  it('reflects variant=embedded class', () => {
    const { container } = render(
      <RichText value="" onChange={() => undefined} label="Body" variant="embedded" />,
    );
    const root = container.querySelector('[data-cir-component="RichText"]');
    expect(root?.className).toContain('bg-transparent');
  });
  it('reflects variant=minimal class', () => {
    const { container } = render(
      <RichText value="" onChange={() => undefined} label="Body" variant="minimal" />,
    );
    const root = container.querySelector('[data-cir-component="RichText"]');
    expect(root?.className).toContain('border-b');
  });
});

describe('sanitizeRichTextHtml', () => {
  it('keeps allowed tags', () => {
    const out = sanitizeRichTextHtml('<b>bold</b><i>it</i><a href="http://x">l</a>');
    expect(out).toContain('<b>bold</b>');
    expect(out).toContain('<i>it</i>');
    expect(out).toContain('href="http://x"');
  });

  it('drops disallowed tags but keeps their text', () => {
    const out = sanitizeRichTextHtml('<script>alert(1)</script>hi<img src="x">');
    expect(out).not.toContain('<script>');
    expect(out).not.toContain('<img');
    expect(out).toContain('alert(1)');
    expect(out).toContain('hi');
  });

  it('strips javascript: hrefs', () => {
    const out = sanitizeRichTextHtml('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toContain('javascript:');
  });

  it('strips arbitrary attributes', () => {
    const out = sanitizeRichTextHtml('<b onclick="x" class="y">hi</b>');
    expect(out).not.toContain('onclick');
    expect(out).not.toContain('class');
    expect(out).toContain('<b>hi</b>');
  });
});
