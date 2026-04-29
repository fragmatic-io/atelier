// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { CodeView, CodeViewBinding, codeViewTextRender } from '../src/components/CodeView.js';

const SNIPPET = `function add(a, b) {\n  return a + b;\n}`;

describe('CodeView', () => {
  it('renders <pre><code> with the verbatim code', () => {
    const { container } = render(<CodeView code={SNIPPET} />);
    const code = container.querySelector('code[data-cir-part="codeview-code"]');
    expect(code?.textContent).toBe(SNIPPET);
  });

  it('defaults data-language to plain', () => {
    const { container } = render(<CodeView code="x" />);
    expect(
      container.querySelector('[data-cir-component="CodeView"]')?.getAttribute('data-language'),
    ).toBe('plain');
  });

  it('passes through the language prop', () => {
    const { container } = render(<CodeView code="x" language="typescript" />);
    expect(
      container.querySelector('[data-cir-component="CodeView"]')?.getAttribute('data-language'),
    ).toBe('typescript');
  });

  it('omits line numbers by default', () => {
    const { container } = render(<CodeView code={SNIPPET} />);
    expect(container.querySelector('[data-cir-part="codeview-line-numbers"]')).toBeNull();
  });

  it('renders one line number per line when enabled', () => {
    const { container } = render(<CodeView code={SNIPPET} showLineNumbers />);
    const ol = container.querySelector('ol[data-cir-part="codeview-line-numbers"]');
    expect(ol).toBeTruthy();
    expect(ol?.querySelectorAll('li').length).toBe(3);
  });

  it('text-render reports language and line count', () => {
    expect(codeViewTextRender({ code: SNIPPET, language: 'js' })).toBe('[CodeView: js (3 lines)]');
    expect(codeViewTextRender({ code: 'x' })).toBe('[CodeView: plain (1 lines)]');
  });

  it('binding id matches', () => {
    expect(CodeViewBinding.id).toBe('CodeView');
  });
});
