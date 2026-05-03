// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  RichText,
  RichTextBinding,
  detectFirstUrlForPaste,
  sanitizeRichTextHtml,
} from '../src/components/RichText.js';
import type { EmbedDisplay } from '../src/embeds/resolver.js';
import type { EmbedRegistry } from '../src/embeds/registry.js';

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

// -- Wave 11 / Int-15 — smart paste integration -------------------------------

interface FakeRegistryScript {
  display?: EmbedDisplay;
  unresolved?: boolean;
  reject?: boolean;
  delayMs?: number;
}

function makeRegistry(script: FakeRegistryScript): EmbedRegistry & { calls: string[] } {
  const calls: string[] = [];
  return {
    add(): void {
      /* unused */
    },
    calls,
    resolve(url: string) {
      calls.push(url);
      const make = (): Promise<{ provider: string; display: EmbedDisplay } | null> => {
        if (script.reject === true) return Promise.reject(new Error('boom'));
        if (script.unresolved === true) return Promise.resolve(null);
        if (script.display !== undefined) {
          return Promise.resolve({ provider: 'fake', display: script.display });
        }
        return Promise.resolve(null);
      };
      if (script.delayMs === undefined || script.delayMs <= 0) return make();
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          make().then(resolve, reject);
        }, script.delayMs);
      });
    },
  };
}

describe('RichText pasteSmart integration', () => {
  it('fires onUnfurl when a pasted URL resolves through the registry', async () => {
    const display: EmbedDisplay = { kind: 'video', iframeSrc: 'https://x/embed' };
    const registry = makeRegistry({ display });
    const onUnfurl = vi.fn();
    render(
      <RichText
        value=""
        onChange={() => undefined}
        label="Body"
        pasteSmart={{ embedRegistry: registry, onUnfurl }}
      />,
    );
    const editor = document.querySelector('[data-cir-part="richtext-editor"]')!;
    fireEvent.paste(editor, {
      clipboardData: {
        getData: (type: string) => (type === 'text/plain' ? 'see https://example.com' : ''),
      },
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(registry.calls).toEqual(['https://example.com']);
    expect(onUnfurl).toHaveBeenCalledOnce();
    expect(onUnfurl.mock.calls[0]?.[0]).toEqual({
      url: 'https://example.com',
      display,
    });
  });

  it('does NOT fire onUnfurl when no URL is in the clipboard', () => {
    const registry = makeRegistry({ display: { kind: 'card', title: 'never' } });
    const onUnfurl = vi.fn();
    render(
      <RichText
        value=""
        onChange={() => undefined}
        label="Body"
        pasteSmart={{ embedRegistry: registry, onUnfurl }}
      />,
    );
    const editor = document.querySelector('[data-cir-part="richtext-editor"]')!;
    fireEvent.paste(editor, {
      clipboardData: { getData: () => 'plain text without urls' },
    });
    expect(registry.calls).toEqual([]);
    expect(onUnfurl).not.toHaveBeenCalled();
  });

  it('does NOT fire onUnfurl when registry returns null', async () => {
    const registry = makeRegistry({ unresolved: true });
    const onUnfurl = vi.fn();
    render(
      <RichText
        value=""
        onChange={() => undefined}
        label="Body"
        pasteSmart={{ embedRegistry: registry, onUnfurl }}
      />,
    );
    const editor = document.querySelector('[data-cir-part="richtext-editor"]')!;
    fireEvent.paste(editor, {
      clipboardData: { getData: () => 'https://nope.example.com' },
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(registry.calls).toEqual(['https://nope.example.com']);
    expect(onUnfurl).not.toHaveBeenCalled();
  });

  it('does NOT fire onUnfurl when registry rejects', async () => {
    const registry = makeRegistry({ reject: true });
    const onUnfurl = vi.fn();
    render(
      <RichText
        value=""
        onChange={() => undefined}
        label="Body"
        pasteSmart={{ embedRegistry: registry, onUnfurl }}
      />,
    );
    const editor = document.querySelector('[data-cir-part="richtext-editor"]')!;
    fireEvent.paste(editor, {
      clipboardData: { getData: () => 'https://boom.example.com' },
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(onUnfurl).not.toHaveBeenCalled();
  });

  it('skips unfurl when pasteSmart prop is omitted', () => {
    const registry = makeRegistry({ display: { kind: 'card', title: 'x' } });
    const onUnfurl = vi.fn();
    render(<RichText value="" onChange={() => undefined} label="Body" />);
    const editor = document.querySelector('[data-cir-part="richtext-editor"]')!;
    fireEvent.paste(editor, {
      clipboardData: { getData: () => 'https://example.com' },
    });
    expect(registry.calls).toEqual([]);
    expect(onUnfurl).not.toHaveBeenCalled();
  });

  it('skips unfurl when unfurlTimeoutMs is 0', () => {
    const registry = makeRegistry({ display: { kind: 'card', title: 'x' } });
    const onUnfurl = vi.fn();
    render(
      <RichText
        value=""
        onChange={() => undefined}
        label="Body"
        pasteSmart={{ embedRegistry: registry, onUnfurl, unfurlTimeoutMs: 0 }}
      />,
    );
    const editor = document.querySelector('[data-cir-part="richtext-editor"]')!;
    fireEvent.paste(editor, {
      clipboardData: { getData: () => 'https://example.com' },
    });
    expect(registry.calls).toEqual([]);
    expect(onUnfurl).not.toHaveBeenCalled();
  });

  it('swallows host onUnfurl errors so the editor stays alive', async () => {
    const display: EmbedDisplay = { kind: 'card', title: 'ok' };
    const registry = makeRegistry({ display });
    const onUnfurl = vi.fn(() => {
      throw new Error('host boom');
    });
    render(
      <RichText
        value=""
        onChange={() => undefined}
        label="Body"
        pasteSmart={{ embedRegistry: registry, onUnfurl }}
      />,
    );
    const editor = document.querySelector('[data-cir-part="richtext-editor"]')!;
    expect(() => {
      fireEvent.paste(editor, {
        clipboardData: { getData: () => 'https://example.com' },
      });
    }).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    expect(onUnfurl).toHaveBeenCalledOnce();
  });
});

describe('detectFirstUrlForPaste', () => {
  it('extracts the first URL from prose', () => {
    expect(detectFirstUrlForPaste('see https://x.io and y')).toBe('https://x.io');
  });
  it('returns null when no URL is present', () => {
    expect(detectFirstUrlForPaste('hello')).toBeNull();
  });
  it('strips trailing punctuation', () => {
    expect(detectFirstUrlForPaste('https://x.io.')).toBe('https://x.io');
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
