// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Markdown, MarkdownBinding } from '../src/components/Markdown.js';
import type { EmbedRegistry } from '../src/embeds/registry.js';
import type { EmbedDisplay } from '../src/embeds/resolver.js';
import type { MentionResolver } from '../src/mentions/resolver.js';

describe('Markdown', () => {
  it('renders bold text', () => {
    const { container } = render(<Markdown content="**hello**" />);
    expect(container.querySelector('strong')?.textContent).toBe('hello');
  });
  it('renders external links with target=_blank', () => {
    render(<Markdown content="[ext](https://example.com)" />);
    const a = screen.getByRole('link', { name: 'ext' });
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
  });
  it('relative links do not get target=_blank', () => {
    render(<Markdown content="[rel](/path)" />);
    const a = screen.getByRole('link', { name: 'rel' });
    expect(a.getAttribute('target')).toBeNull();
  });
  it('binding id matches', () => {
    expect(MarkdownBinding.id).toBe('Markdown');
  });

  // -- Wave 11 / Cnt-5 — spacing variant axis --
  it('defaults to variant=default (Cnt-5 spacing axis)', () => {
    const { container } = render(<Markdown content="hi" />);
    expect(
      container.querySelector('[data-cir-component="Markdown"]')?.getAttribute('data-variant'),
    ).toBe('default');
  });

  it('reflects each spacing variant on data-variant', () => {
    for (const v of ['default', 'tight', 'loose'] as const) {
      const { container, unmount } = render(<Markdown content="x" variant={v} />);
      expect(
        container.querySelector('[data-cir-component="Markdown"]')?.getAttribute('data-variant'),
      ).toBe(v);
      unmount();
    }
  });

  it('tight + default share the same paragraph-spacing CSS variable', () => {
    const { container: cT } = render(<Markdown content="x" variant="tight" />);
    const { container: cD } = render(<Markdown content="x" variant="default" />);
    const tight = (
      cT.querySelector('[data-cir-component="Markdown"]') as HTMLElement
    ).style.getPropertyValue('--atelier-prose-spacing-paragraph');
    const def = (
      cD.querySelector('[data-cir-component="Markdown"]') as HTMLElement
    ).style.getPropertyValue('--atelier-prose-spacing-paragraph');
    expect(tight).toBe('0.5em');
    expect(def).toBe(tight);
  });

  it('loose variant uses larger paragraph spacing than tight', () => {
    const { container: cL } = render(<Markdown content="x" variant="loose" />);
    const { container: cT } = render(<Markdown content="x" variant="tight" />);
    const loose = (
      cL.querySelector('[data-cir-component="Markdown"]') as HTMLElement
    ).style.getPropertyValue('--atelier-prose-spacing-paragraph');
    const tight = (
      cT.querySelector('[data-cir-component="Markdown"]') as HTMLElement
    ).style.getPropertyValue('--atelier-prose-spacing-paragraph');
    expect(loose).toBe('1em');
    expect(tight).toBe('0.5em');
    expect(loose).not.toBe(tight);
  });

  // -- Per-element renderer overrides --
  it('components.p override fires when supplied', () => {
    const { container } = render(
      <Markdown
        content="hello world"
        components={{
          p: ({ children }) => <p data-testid="custom-p">CUSTOM:{children}</p>,
        }}
      />,
    );
    const custom = container.querySelector('[data-testid="custom-p"]');
    expect(custom).not.toBeNull();
    expect(custom?.textContent).toContain('CUSTOM:hello world');
  });

  it('components.h1 override fires when supplied', () => {
    const { container } = render(
      <Markdown
        content="# Title"
        components={{
          h1: ({ children }) => <h1 data-testid="custom-h1">{children}</h1>,
        }}
      />,
    );
    expect(container.querySelector('[data-testid="custom-h1"]')?.textContent).toBe('Title');
  });

  it('default paragraph carries data-cir-part="md-p"', () => {
    const { container } = render(<Markdown content="just a paragraph" />);
    expect(container.querySelector('[data-cir-part="md-p"]')).not.toBeNull();
  });

  it('default blockquote carries data-cir-part="md-blockquote" with left border', () => {
    const { container } = render(<Markdown content="> quoted text" />);
    const bq = container.querySelector('[data-cir-part="md-blockquote"]');
    expect(bq).not.toBeNull();
    // Left border is the Linear-style accent — set inline so jsdom sees it.
    expect((bq as HTMLElement | null)?.style.borderLeft).toContain('3px solid');
  });

  // -- Mention auto-link integration --
  it('mention auto-link works when resolver supplied', () => {
    const resolver: MentionResolver = {
      prefixes: ['@'],
      resolve: (m) => ({ label: `User ${m.id}`, href: `/u/${m.id}` }),
    };
    const { container } = render(<Markdown content="Hello @alice!" mentionResolver={resolver} />);
    // The Mention component emits a `Mention` data-cir-component span/anchor.
    const chip = container.querySelector('[data-cir-component="Mention"]');
    expect(chip).not.toBeNull();
    expect(chip?.getAttribute('data-prefix')).toBe('@');
    // Resolved chip is an anchor when the resolver returned an href.
    expect(chip?.tagName.toLowerCase()).toBe('a');
    expect(chip?.getAttribute('href')).toBe('/u/alice');
  });

  it('mentions are not parsed when no resolver supplied', () => {
    const { container } = render(<Markdown content="Hello @alice!" />);
    expect(container.querySelector('[data-cir-component="Mention"]')).toBeNull();
  });

  // -- Embed auto-render integration --
  it('embed auto-renders for bare URL on its own line', async () => {
    const display: EmbedDisplay = {
      kind: 'card',
      title: 'Example Site',
    };
    const registry: EmbedRegistry = {
      add: () => undefined,
      resolve: () => Promise.resolve({ provider: 'test', display }),
    };
    const { container, findByRole } = render(
      <Markdown content="https://example.com" embedRegistry={registry} />,
    );
    // Synchronous initial paint shows the Embed in pending state.
    const pending = container.querySelector('[data-cir-component="Embed"]');
    expect(pending).not.toBeNull();
    // After the microtask, Embed resolves to its card (an `<a>`).
    const link = await findByRole('link');
    expect(link.getAttribute('data-cir-state')).toBe('resolved');
    expect(link.getAttribute('data-provider')).toBe('test');
  });

  it('inline link inside prose stays as plain anchor (not unfurled)', () => {
    const registry: EmbedRegistry = {
      add: () => undefined,
      resolve: () => Promise.resolve(null),
    };
    const { container } = render(
      <Markdown content="Check [this](https://example.com) out!" embedRegistry={registry} />,
    );
    // No Embed should fire — the bare-URL rule requires the URL to be the
    // entire paragraph body.
    expect(container.querySelector('[data-cir-component="Embed"]')).toBeNull();
    // The anchor renders as an external link.
    const a = container.querySelector('a[data-cir-part="md-a"]');
    expect(a?.getAttribute('href')).toBe('https://example.com');
  });

  // -- Code-fence integration with CodeBlock (Cnt-1) --
  it('code fence with language renders <CodeBlock> wrapper', () => {
    const fence = '```ts\nconst x: number = 1;\n```';
    const { container } = render(<Markdown content={fence} />);
    const block = container.querySelector('[data-cir-component="CodeBlock"]');
    expect(block).not.toBeNull();
    // The fence info-string `ts` resolves to the canonical `typescript` id
    // via `detectLanguage`'s hint alias table — which is what `<CodeBlock>`
    // surfaces on `data-language` and what Shiki's grammar registry expects.
    expect(block?.getAttribute('data-language')).toBe('typescript');
  });

  it('inline code stays as a small mono-pill (not <CodeBlock>)', () => {
    const { container } = render(<Markdown content="use `console.log`" />);
    expect(container.querySelector('[data-cir-component="CodeBlock"]')).toBeNull();
    const pill = container.querySelector('[data-cir-part="md-code"]');
    expect(pill).not.toBeNull();
    expect(pill?.textContent).toBe('console.log');
  });
});
