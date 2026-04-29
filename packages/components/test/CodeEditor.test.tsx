// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CodeEditor, CodeEditorBinding } from '../src/components/CodeEditor.js';

describe('CodeEditor', () => {
  it('renders a textarea with the value', () => {
    render(<CodeEditor value="const x = 1;" onChange={() => undefined} label="Code" />);
    const ta = screen.getByLabelText<HTMLTextAreaElement>('Code');
    expect(ta.value).toBe('const x = 1;');
  });

  it('emits onChange when the textarea is typed into', () => {
    const onChange = vi.fn();
    render(<CodeEditor value="" onChange={onChange} label="Code" />);
    const ta = screen.getByLabelText<HTMLTextAreaElement>('Code');
    fireEvent.change(ta, { target: { value: 'abc' } });
    expect(onChange).toHaveBeenCalledWith('abc');
  });

  it('Tab inserts two spaces, not focus shift', () => {
    const onChange = vi.fn();
    render(<CodeEditor value="ab" onChange={onChange} label="Code" />);
    const ta = screen.getByLabelText<HTMLTextAreaElement>('Code');
    ta.focus();
    ta.selectionStart = ta.selectionEnd = 2;
    fireEvent.keyDown(ta, { key: 'Tab' });
    expect(onChange).toHaveBeenCalledWith('ab  ');
  });

  it('Tab is a no-op when readOnly', () => {
    const onChange = vi.fn();
    render(<CodeEditor value="ab" onChange={onChange} label="Code" readOnly />);
    const ta = screen.getByLabelText<HTMLTextAreaElement>('Code');
    fireEvent.keyDown(ta, { key: 'Tab' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('forwards language as data-language', () => {
    const { container } = render(
      <CodeEditor value="" onChange={() => undefined} label="Code" language="ts" />,
    );
    expect(
      container.querySelector('[data-cir-component="CodeEditor"]')?.getAttribute('data-language'),
    ).toBe('ts');
  });

  it('does not render gutter by default', () => {
    render(<CodeEditor value="a\nb" onChange={() => undefined} label="Code" />);
    expect(document.querySelector('[data-cir-part="codeeditor-gutter"]')).toBeNull();
  });

  it('renders gutter with one entry per line when showLineNumbers', () => {
    render(
      <CodeEditor
        value={'one\ntwo\nthree'}
        onChange={() => undefined}
        label="Code"
        showLineNumbers
      />,
    );
    expect(document.querySelectorAll('[data-cir-part="codeeditor-line"]').length).toBe(3);
  });

  it('gutter shows one line for empty value', () => {
    render(<CodeEditor value="" onChange={() => undefined} label="Code" showLineNumbers />);
    expect(document.querySelectorAll('[data-cir-part="codeeditor-line"]').length).toBe(1);
  });

  it('forwards readOnly to the textarea', () => {
    render(<CodeEditor value="x" onChange={() => undefined} label="Code" readOnly />);
    expect(screen.getByLabelText<HTMLTextAreaElement>('Code').readOnly).toBe(true);
  });

  it('forwards placeholder', () => {
    render(
      <CodeEditor value="" onChange={() => undefined} label="Code" placeholder="Type code…" />,
    );
    expect(screen.getByLabelText<HTMLTextAreaElement>('Code').placeholder).toBe('Type code…');
  });

  it('binding id matches', () => {
    expect(CodeEditorBinding.id).toBe('CodeEditor');
  });
});
