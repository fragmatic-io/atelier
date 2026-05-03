// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

'use client';
/**
 * Wave 11 / Cnt-5 — Markdown at Linear quality.
 *
 * Pre-Cnt-5 `<Markdown>` was a sanitized `react-markdown` render with one
 * hardcoded `<a>` override (target=_blank for external links) and a
 * `ContentVariant` axis that picked a surface (bordered / elevated /
 * ghost / tinted). Cnt-5 lifts the markdown surface from "renders OK" to
 * "feels like Linear":
 *
 *   1. Tighter spacing rhythm. The default variant flips from "loose
 *      browser-defaults prose" to a `tight` rhythm modelled on Linear's
 *      issue body / Notion document body — paragraph spacing ~0.5em,
 *      heading spacing ~0.75em, list spacing ~0.25em. Hosts opt back into
 *      generous spacing via `variant="loose"`. Spacing is implemented via
 *      CSS variables on the wrapper (`--atelier-prose-spacing-*`) so
 *      Tailwind / non-Tailwind hosts both pick it up — the variables are
 *      referenced from inline `style` so no global stylesheet is required.
 *
 *   2. Per-element renderers. The `components` prop bag mirrors
 *      `react-markdown`'s native `Components` API so hosts can override
 *      individual element renders (`{ p: MyP, h1: MyH1, code: MyCode }`).
 *      Atelier's defaults wrap the raw HTML elements with our own
 *      data-attributes for theming hooks (`data-cir-part="md-h1"`, etc.)
 *      and the host's overrides win cleanly.
 *
 *   3. Auto-mention integration. When a `mentionResolver` prop is
 *      supplied, every text node inside paragraphs / list items / table
 *      cells / blockquotes is run through `<MentionAware>` so `@user` /
 *      `#issue` chips render inline. Headings + code stay as plain text
 *      (Linear doesn't auto-link mentions inside headings either).
 *
 *   4. Auto-embed integration. When an `embedRegistry` prop is supplied,
 *      a paragraph whose ENTIRE body is one bare URL is replaced with an
 *      `<Embed>`. Multi-line `[text](url)` and inline links remain plain
 *      `<a>` — only the "URL alone on its own line" pattern is unfurled,
 *      mirroring Linear / Notion / Slack expand behaviour.
 *
 *   5. Code-fence syntax highlighting. Triple-backtick fences route to
 *      `<CodeBlock>` (which lazy-loads Shiki via Cnt-1) so language hints
 *      get tokenised + dual-theme'd for free.
 *
 *   6. Linear-style quote blocks. Blockquotes get a left-border tint and
 *      smaller block margin via the prose-spacing variables.
 *
 * The previous `MarkdownVariant` axis (bordered / elevated / ghost /
 * tinted) modelled a SURFACE — Cnt-5 reframes `variant` as a SPACING axis
 * (`'default' | 'tight' | 'loose'`). Hosts that wrapped `<Markdown>` for
 * the surface chrome should compose with `<Card>` / `<Container>` (or use
 * `className`) — the new axis is about prose density, which is what
 * Linear-quality readers care about.
 *
 * Why component overrides win over CSS-only theming
 * -------------------------------------------------
 * Hosts often need to inject app-specific behaviour (link click handlers,
 * heading anchor links, image lightboxes). A CSS-only API can theme but
 * cannot intercept render — exposing the `components` prop bag is the
 * minimum surface that lets a host plug in a real `<Link>` component (for
 * client-side routing), or a `<Heading>` that registers itself with the
 * page's outline panel.
 */
import { Fragment, type CSSProperties, type ComponentType, type ReactNode } from 'react';
import ReactMarkdown, { type Components as RMComponents } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import type { ComponentBinding } from '@atelier/runtime';
import { cn } from './_variants.js';
import { CodeBlock } from './CodeBlock.js';
import { detectLanguage } from '../lib/detect-language.js';
import { Embed } from './Embed.js';
import { MentionAware } from './MentionAware.js';
import type { MentionResolver } from '../mentions/resolver.js';
import type { EmbedRegistry } from '../embeds/registry.js';

/**
 * Spacing variant. Controls the prose density (paragraph + heading + list
 * margins). The default `'tight'` mirrors Linear's issue body; `'loose'`
 * is the browser-defaults flavour for hosts that want generous breathing
 * room (long-form documentation, blog posts).
 *
 * `'default'` is an alias for `'tight'` — kept as a token in case a host
 * wants the canonical "atelier default" without committing to the literal
 * `'tight'` value (which we may evolve in a future wave).
 */
export type MarkdownVariant = 'default' | 'tight' | 'loose';

/**
 * Subset of `react-markdown`'s `Components` map covering the elements we
 * expose through the per-element renderer prop. The shape mirrors
 * react-markdown 1:1 so hosts can re-use renderers built for any other
 * react-markdown integration.
 */
export type MarkdownRenderers = RMComponents;

export interface MarkdownProps {
  /** Markdown source text. */
  content: string;
  /**
   * Spacing density. Defaults to `'default'` (= `'tight'`). Hosts that
   * want roomier prose pass `'loose'`.
   */
  variant?: MarkdownVariant;
  /**
   * Per-element renderer overrides. Same shape as react-markdown's
   * `components` prop — `{ p, h1, h2, …, code, a, blockquote, … }`. When
   * an override is supplied for a key, ours is replaced. Atelier's
   * defaults add `data-cir-part="md-…"` attributes on each element so
   * hosts can target them from CSS without depending on the override
   * surface.
   */
  components?: Partial<MarkdownRenderers>;
  /**
   * Optional mention resolver. When supplied, text content inside
   * paragraphs / list items / table cells / blockquotes is run through
   * `<MentionAware>` so inline `@user` / `#issue` mentions render as chips
   * via Cnt-3. Headings + code intentionally do NOT receive mention
   * processing — those surfaces should render as authored.
   */
  mentionResolver?: MentionResolver;
  /**
   * Optional embed registry. When supplied, a paragraph whose entire body
   * is one bare URL gets replaced with an `<Embed>` (Cnt-4). Inline links
   * and multi-line `[text](url)` stay as plain links. The "URL on its own
   * line" rule mirrors Linear / Notion / Slack expand behaviour.
   */
  embedRegistry?: EmbedRegistry;
  /** Class string forwarded to the outer wrapper. */
  className?: string;
}

/** Class table for the spacing variant — opt-in CSS-variable-based rhythm. */
export const markdownVariantClass: Readonly<Record<MarkdownVariant, string>> = Object.freeze({
  // The class strings are intentionally minimal; the real rhythm comes from
  // the inline CSS variables (see `variantStyle` below). Hosts that ship
  // Tailwind get a small visual nudge via `text-sm` on tight surfaces.
  default: 'text-sm',
  tight: 'text-sm',
  loose: 'text-base',
});

/**
 * Inline CSS variables per variant. These project a small spacing scale
 * onto the wrapper element so the per-element renderers below can pick
 * them up via `var(--atelier-prose-spacing-*)`. Hosts can override any of
 * these on the wrapper via `style` (or by setting the variables on an
 * ancestor) without us shipping a stylesheet.
 *
 * The numeric values were tuned against Linear's issue body / Notion
 * document body — paragraphs sit ~0.5em apart, headings ~0.75em apart,
 * list rows ~0.25em apart. The `loose` flavour roughly doubles the gap
 * to match browser defaults.
 */
function variantStyle(variant: MarkdownVariant): CSSProperties {
  // Custom CSS variables are not indexable directly on the
  // `CSSProperties` type, but React accepts `Record<string, string>` on
  // `style` because the runtime serialisation walks every key. We type
  // the locals as `CSSProperties` so the return type stays narrow and
  // host overrides via `style={{...}}` line up cleanly.
  if (variant === 'loose') {
    const looseVars: CSSProperties = {
      '--atelier-prose-spacing-paragraph': '1em',
      '--atelier-prose-spacing-heading': '1.5em',
      '--atelier-prose-spacing-list': '0.5em',
      '--atelier-prose-spacing-quote': '1em',
      '--atelier-prose-spacing-tight': '0.5em',
    } as CSSProperties;
    return looseVars;
  }
  // `default` and `tight` share the same scale; `default` is an alias.
  const tightVars: CSSProperties = {
    '--atelier-prose-spacing-paragraph': '0.5em',
    '--atelier-prose-spacing-heading': '0.75em',
    '--atelier-prose-spacing-list': '0.25em',
    '--atelier-prose-spacing-quote': '0.5em',
    '--atelier-prose-spacing-tight': '0.25em',
  } as CSSProperties;
  return tightVars;
}

/**
 * Pull a single named string field off an unknown record without tripping
 * lint's `no-unsafe-*` rules. Returns the value when it's a string, else
 * `undefined`. Used by `extractBareUrl` below to walk the hast `node` we
 * receive from `react-markdown` without taking a runtime dep on `@types/hast`.
 */
function readString(obj: unknown, key: string): string | undefined {
  if (typeof obj !== 'object' || obj === null) return undefined;
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === 'string' ? v : undefined;
}

/** Read the `children` array off an unknown record, normalising to `unknown[]`. */
function readChildren(obj: unknown): readonly unknown[] {
  if (typeof obj !== 'object' || obj === null) return [];
  const v = (obj as Record<string, unknown>)['children'];
  return Array.isArray(v) ? v : [];
}

/**
 * Detect the "bare URL on its own line" pattern inside a paragraph's
 * hast `node`. We use the AST (rather than the rendered React children)
 * because the rendered children would already be wrapped in our `<a>`
 * renderer — the React element's `type` would be that function reference,
 * not the original `'a'` tag name. The hast node still has the raw
 * `tagName` so detection is unambiguous.
 *
 * Two shapes count as bare-URL:
 *   1. The paragraph contains exactly one text child whose value (after
 *      trimming) is an http(s) URL. This is the "no autolink" path; the
 *      URL never made it through GFM's autolink because of formatting.
 *   2. The paragraph contains exactly one anchor child (`tagName: 'a'`)
 *      whose `href` matches the text inside. This is the "GFM autolink"
 *      path — the bare URL became `<a href={url}>{url}</a>` at parse time.
 *
 * Multi-line `[text](url)` collapses to an anchor whose inner text != href,
 * which short-circuits both checks.
 */
function extractBareUrl(node: unknown): string | null {
  const children = readChildren(node);
  if (children.length === 0) return null;
  // Strip whitespace-only text nodes — `\n` between siblings is common.
  const meaningful = children.filter((c) => {
    if (readString(c, 'type') === 'text') {
      const v = readString(c, 'value');
      return v !== undefined && v.trim().length > 0;
    }
    return true;
  });
  if (meaningful.length !== 1) return null;
  const only = meaningful[0];
  const onlyType = readString(only, 'type');
  if (onlyType === 'text') {
    const v = readString(only, 'value');
    if (v === undefined) return null;
    const t = v.trim();
    if (/^https?:\/\/\S+$/i.test(t)) return t;
    return null;
  }
  if (onlyType === 'element' && readString(only, 'tagName') === 'a') {
    const props =
      typeof only === 'object' && only !== null
        ? (only as Record<string, unknown>)['properties']
        : undefined;
    const href = readString(props, 'href');
    const innerChildren = readChildren(only);
    if (innerChildren.length !== 1) return null;
    const child = innerChildren[0];
    if (readString(child, 'type') !== 'text') return null;
    const innerText = readString(child, 'value');
    if (innerText === undefined || href === undefined) return null;
    if (href === innerText && /^https?:/i.test(href)) return href;
  }
  return null;
}

/**
 * Concatenate the string children of a markdown node, dropping non-string
 * children (already-rendered React elements). Used by the `<code>` renderer
 * to recover the raw fence body for `<CodeBlock>`.
 */
function stringifyMarkdownChildren(children: ReactNode): string {
  const arr = Array.isArray(children) ? children : [children];
  let out = '';
  for (const c of arr) {
    if (typeof c === 'string') out += c;
  }
  return out;
}

/**
 * Walk a single text node (or array of mixed text + element children) and
 * replace each plain-string segment with a `<MentionAware>` so inline
 * mentions parse + render. Non-string children (already-resolved React
 * elements like `<strong>`, `<em>`, `<a>`) pass through unchanged.
 */
function applyMentions(children: ReactNode, resolver: MentionResolver): ReactNode {
  const arr = Array.isArray(children) ? children : [children];
  return arr.map((c, idx) => {
    if (typeof c === 'string') {
      return <MentionAware key={`ma-${String(idx)}`} text={c} resolver={resolver} />;
    }
    return <Fragment key={`f-${String(idx)}`}>{c}</Fragment>;
  });
}

/**
 * Build the default per-element renderer table. Each entry adds an
 * `data-cir-part="md-<el>"` attribute and applies the spacing CSS
 * variables for vertical rhythm. The table is constructed per-render
 * because mention / embed integration depends on props passed in.
 */
function buildDefaultRenderers(
  mentionResolver: MentionResolver | undefined,
  embedRegistry: EmbedRegistry | undefined,
): RMComponents {
  // Helper: when a mention resolver is wired, paragraphs / list items /
  // table cells / blockquotes inject the resolver over their text content.
  const withMentions = (children: ReactNode): ReactNode =>
    mentionResolver !== undefined ? applyMentions(children, mentionResolver) : children;

  return {
    p: ({ children, node, ...rest }) => {
      // Auto-embed: a paragraph that is exactly one bare URL becomes an
      // `<Embed>` when an embed registry is supplied. Multi-line links and
      // inline-anchor paragraphs stay as `<p>`. We inspect the hast `node`
      // rather than the rendered React `children` because the React tree
      // would already be wrapped in our `<a>` renderer.
      if (embedRegistry !== undefined) {
        const url = extractBareUrl(node);
        if (url !== null) {
          return <Embed url={url} registry={embedRegistry} />;
        }
      }
      return (
        <p
          data-cir-part="md-p"
          style={{ margin: 'var(--atelier-prose-spacing-paragraph) 0' }}
          {...rest}
        >
          {withMentions(children)}
        </p>
      );
    },
    h1: ({ children, node: _node, ...rest }) => (
      <h1
        data-cir-part="md-h1"
        style={{
          margin: 'var(--atelier-prose-spacing-heading) 0 var(--atelier-prose-spacing-tight)',
          fontSize: '1.5em',
          fontWeight: 600,
          lineHeight: 1.2,
        }}
        {...rest}
      >
        {children}
      </h1>
    ),
    h2: ({ children, node: _node, ...rest }) => (
      <h2
        data-cir-part="md-h2"
        style={{
          margin: 'var(--atelier-prose-spacing-heading) 0 var(--atelier-prose-spacing-tight)',
          fontSize: '1.25em',
          fontWeight: 600,
          lineHeight: 1.25,
        }}
        {...rest}
      >
        {children}
      </h2>
    ),
    h3: ({ children, node: _node, ...rest }) => (
      <h3
        data-cir-part="md-h3"
        style={{
          margin: 'var(--atelier-prose-spacing-heading) 0 var(--atelier-prose-spacing-tight)',
          fontSize: '1.1em',
          fontWeight: 600,
          lineHeight: 1.3,
        }}
        {...rest}
      >
        {children}
      </h3>
    ),
    h4: ({ children, node: _node, ...rest }) => (
      <h4
        data-cir-part="md-h4"
        style={{ margin: 'var(--atelier-prose-spacing-heading) 0 0' }}
        {...rest}
      >
        {children}
      </h4>
    ),
    h5: ({ children, node: _node, ...rest }) => (
      <h5
        data-cir-part="md-h5"
        style={{ margin: 'var(--atelier-prose-spacing-heading) 0 0' }}
        {...rest}
      >
        {children}
      </h5>
    ),
    h6: ({ children, node: _node, ...rest }) => (
      <h6
        data-cir-part="md-h6"
        style={{ margin: 'var(--atelier-prose-spacing-heading) 0 0' }}
        {...rest}
      >
        {children}
      </h6>
    ),
    ul: ({ children, node: _node, ...rest }) => (
      <ul
        data-cir-part="md-ul"
        style={{
          margin: 'var(--atelier-prose-spacing-list) 0',
          paddingLeft: '1.25em',
        }}
        {...rest}
      >
        {children}
      </ul>
    ),
    ol: ({ children, node: _node, ...rest }) => (
      <ol
        data-cir-part="md-ol"
        style={{
          margin: 'var(--atelier-prose-spacing-list) 0',
          paddingLeft: '1.25em',
        }}
        {...rest}
      >
        {children}
      </ol>
    ),
    li: ({ children, node: _node, ...rest }) => (
      <li
        data-cir-part="md-li"
        style={{ margin: 'var(--atelier-prose-spacing-tight) 0' }}
        {...rest}
      >
        {withMentions(children)}
      </li>
    ),
    blockquote: ({ children, node: _node, ...rest }) => (
      <blockquote
        data-cir-part="md-blockquote"
        style={{
          margin: 'var(--atelier-prose-spacing-quote) 0',
          paddingLeft: '0.75em',
          borderLeft: '3px solid currentColor',
          opacity: 0.8,
        }}
        {...rest}
      >
        {withMentions(children)}
      </blockquote>
    ),
    a: ({ href, children, node: _node, ...rest }) => {
      const external = typeof href === 'string' && /^https?:/i.test(href);
      return (
        <a
          data-cir-part="md-a"
          href={href}
          {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          {...rest}
        >
          {children}
        </a>
      );
    },
    code: ({ children, className, node: _node, ...rest }) => {
      // Triple-backtick fences arrive with a `language-<lang>` className from
      // remark-gfm; inline code has no className. Route fenced blocks to
      // `<CodeBlock>` so Cnt-1's Shiki highlighting fires; inline `code`
      // stays as a small mono-pill.
      const langMatch = typeof className === 'string' ? /language-(\w+)/.exec(className) : null;
      const language = langMatch?.[1];
      // The fence body is always a string when remark-gfm parses a fenced
      // block — we read it via a typed helper rather than `String(children)`
      // to avoid `[object Object]` stringification on stray non-string nodes.
      const raw = stringifyMarkdownChildren(children);
      // A multi-line body with a recognised language triggers the fenced path.
      if (language !== undefined && raw.includes('\n')) {
        // Trim the trailing newline remark-gfm always appends to fence bodies.
        const code = raw.endsWith('\n') ? raw.slice(0, -1) : raw;
        // Resolve the fence info-string (`ts`, `py`, `c#`) into a canonical
        // `DetectedLanguage` via `detectLanguage`'s hint path. CodeBlock's
        // prop is typed against the canonical union; passing the raw fence
        // hint would be a type error.
        const detected = detectLanguage(code, language);
        return <CodeBlock code={code} language={detected} />;
      }
      // Inline code — mono pill with no extra spacing.
      return (
        <code
          data-cir-part="md-code"
          className={className}
          style={{
            fontFamily: 'ui-monospace, monospace',
            fontSize: '0.9em',
            padding: '0.1em 0.3em',
            borderRadius: '3px',
            background: 'rgba(127,127,127,0.15)',
          }}
          {...rest}
        >
          {children}
        </code>
      );
    },
    pre: ({ children }) => {
      // remark-gfm wraps fenced code in `<pre><code>`. Our `code` renderer
      // already replaces multi-line + language fences with `<CodeBlock>` (a
      // div surface). Skip the outer `<pre>` so we don't double-wrap; for
      // language-less / single-line fences the inner `<code>` renderer
      // returns the inline pill, which is fine inside a `<pre>` shell.
      return <Fragment>{children}</Fragment>;
    },
    table: ({ children, node: _node, ...rest }) => (
      <table
        data-cir-part="md-table"
        style={{
          margin: 'var(--atelier-prose-spacing-paragraph) 0',
          borderCollapse: 'collapse',
        }}
        {...rest}
      >
        {children}
      </table>
    ),
    td: ({ children, node: _node, ...rest }) => (
      <td data-cir-part="md-td" style={{ padding: '0.25em 0.5em' }} {...rest}>
        {withMentions(children)}
      </td>
    ),
    th: ({ children, node: _node, ...rest }) => (
      <th
        data-cir-part="md-th"
        style={{ padding: '0.25em 0.5em', textAlign: 'left', fontWeight: 600 }}
        {...rest}
      >
        {children}
      </th>
    ),
    hr: ({ node: _node, ...rest }) => (
      <hr
        data-cir-part="md-hr"
        style={{
          margin: 'var(--atelier-prose-spacing-paragraph) 0',
          border: 'none',
          borderTop: '1px solid currentColor',
          opacity: 0.2,
        }}
        {...rest}
      />
    ),
  };
}

/**
 * Merge user-supplied renderers over the default table. We rely on plain
 * spread because the user's renderers should win cleanly; when a user
 * does NOT override a key, the default (with mention / embed integration
 * + data-cir-part attributes) stays.
 */
function mergeRenderers(
  defaults: RMComponents,
  overrides: Partial<MarkdownRenderers> | undefined,
): RMComponents {
  if (overrides === undefined) return defaults;
  // Build a fresh object so we don't mutate the frozen default table.
  const out: Record<string, ComponentType<unknown>> = {
    ...(defaults as unknown as Record<string, ComponentType<unknown>>),
  };
  for (const [key, val] of Object.entries(overrides)) {
    if (val !== undefined) {
      out[key] = val as ComponentType<unknown>;
    }
  }
  return out as RMComponents;
}

export function Markdown({
  content,
  variant = 'default',
  components,
  mentionResolver,
  embedRegistry,
  className,
}: MarkdownProps): ReactNode {
  const defaults = buildDefaultRenderers(mentionResolver, embedRegistry);
  const merged = mergeRenderers(defaults, components);
  return (
    <div
      data-cir-component="Markdown"
      data-variant={variant}
      className={cn(markdownVariantClass[variant], className)}
      style={variantStyle(variant)}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={merged}
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
