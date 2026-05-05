// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import rehypeMermaid from 'rehype-mermaid';
import { visit } from 'unist-util-visit';

// GitHub Pages serves project sites from `<user>.github.io/<repo>/` unless a
// custom domain is bound. After the marketing+docs merge (P3, 2026-05-04),
// this single Starlight site serves the entire `/atelier/` path — the
// homepage is the splash page, and the secondary marketing surfaces
// (`/start/`, `/architecture/`, `/demos/`) are Starlight splash pages
// alongside the developer docs sections.
const base = process.env.DOCS_BASE ?? '/atelier';
const site = process.env.DOCS_SITE ?? 'https://fragmatic-io.github.io';

/**
 * rehype plugin: rewrite root-relative `<a href="/foo">` to be base-prefixed
 * (`<a href="/atelier/foo">`). Astro/Starlight's sidebar config gets
 * the base prefix automatically, but raw `href` attributes inside MDX —
 * markdown links `[text](/foo)` and JSX `<LinkCard href="/foo">` — do
 * not. Without this rewrite, every internal docs link 404s on Pages
 * because it lands at `<user>.github.io/foo` instead of
 * `<user>.github.io/atelier/foo`.
 *
 * Skips: external URLs, anchor-only links, and links that already start
 * with the base path.
 */
function rehypePrefixInternalLinks(basePath) {
  const trimmed = basePath.replace(/\/+$/, ''); // strip trailing slash
  return () => (tree) => {
    visit(tree, 'element', (node) => {
      if (node.tagName !== 'a') return;
      const href = node.properties?.href;
      if (typeof href !== 'string') return;
      // Skip non-internal / already-prefixed / anchor-only.
      if (!href.startsWith('/')) return;
      if (href.startsWith('//')) return; // protocol-relative
      if (href.startsWith(trimmed + '/') || href === trimmed) return;
      node.properties.href = trimmed + href;
    });
  };
}

export default defineConfig({
  site,
  base,
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  output: 'static',

  // Mermaid: rehype-mermaid renders diagrams at build time via a headless
  // browser-less SVG path (`strategy: 'inline-svg'`) so we ship plain SVG
  // and zero runtime JS for the diagram surface.
  markdown: {
    rehypePlugins: [
      [rehypeMermaid, { strategy: 'inline-svg', mermaidConfig: { theme: 'default' } }],
      rehypePrefixInternalLinks(base),
    ],
    syntaxHighlight: 'shiki',
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
    },
  },

  integrations: [
    starlight({
      title: 'Atelier',
      description: 'Capability · Intent · Render. The developer documentation for Atelier.',
      logo: { src: './src/assets/logo.svg', replacesTitle: false },
      favicon: '/favicon.svg',
      customCss: ['./src/styles/atelier.css'],
      social: {
        github: 'https://github.com/fragmatic-io/atelier',
      },
      editLink: {
        baseUrl: 'https://github.com/fragmatic-io/atelier/edit/main/apps/docs/',
      },
      lastUpdated: true,
      pagination: true,
      tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 3 },

      // After the P3 marketing+docs merge (2026-05-04), the homepage
      // (`/index.mdx`) and the four splash pages (`/start/`,
      // `/architecture/`, `/demos/`) ARE the marketing surface — the
      // separate `apps/marketing` was retired in favour of Starlight's
      // `template: splash` for those routes.
      components: {},
      head: [
        {
          tag: 'meta',
          attrs: { name: 'theme-color', content: '#6e56cf' },
        },
      ],

      sidebar: [
        {
          label: 'Atelier',
          items: [
            { label: 'Home', link: '/' },
            { label: 'Quick start', link: '/start' },
            { label: 'Architecture', link: '/architecture' },
            { label: 'Demos', link: '/demos' },
          ],
        },
        {
          label: 'Introduction',
          items: [
            { label: 'What is Atelier?', link: '/introduction/what-is-atelier' },
            { label: 'Why Atelier?', link: '/introduction/why-atelier' },
            { label: 'Product promise', link: '/introduction/product-promise' },
            { label: 'Ethos — the eleven principles', link: '/introduction/ethos' },
          ],
        },
        {
          label: 'Getting started',
          items: [
            { label: 'Installation', link: '/getting-started/installation' },
            { label: 'Your first app', link: '/getting-started/your-first-app' },
            { label: 'Your first recipe', link: '/getting-started/your-first-recipe' },
            { label: 'Deploying', link: '/getting-started/deploying' },
          ],
        },
        {
          label: 'Concepts',
          collapsed: true,
          items: [
            { label: 'Capability', link: '/concepts/capability' },
            { label: 'Intent', link: '/concepts/intent' },
            { label: 'Manifest', link: '/concepts/manifest' },
            { label: 'Recipe', link: '/concepts/recipe' },
            { label: 'Skill', link: '/concepts/skill' },
            { label: 'Brand kit', link: '/concepts/brand-kit' },
            { label: 'Policy', link: '/concepts/policy' },
            { label: 'Trigger', link: '/concepts/trigger' },
          ],
        },
        {
          label: 'Compiler',
          collapsed: true,
          items: [
            { label: 'Overview', link: '/compiler/overview' },
            { label: 'Tools', link: '/compiler/tools' },
            { label: 'Validation feedback', link: '/compiler/validation-feedback' },
            { label: 'Capability scoping', link: '/compiler/capability-scoping' },
            { label: 'Recipe RAG', link: '/compiler/recipe-rag' },
            { label: 'Budget enforcement', link: '/compiler/budget' },
          ],
        },
        {
          label: 'Components',
          collapsed: true,
          items: [
            { label: 'Catalog', link: '/components/catalog' },
            { label: 'Baseline vs custom', link: '/components/baseline-vs-custom' },
            { label: 'Composition rules', link: '/components/composition-rules' },
            { label: 'Variants', link: '/components/variants' },
            { label: 'Motion', link: '/components/motion' },
            { label: 'Virtualization', link: '/components/virtualization' },
            { label: 'Icons', link: '/components/icons' },
            { label: 'Undo toast', link: '/components/undo-toast' },
            { label: 'Keyboard + command palette', link: '/components/keyboard' },
            { label: 'Breadcrumb trail', link: '/components/breadcrumb-trail' },
            { label: 'Sidebar persistence', link: '/components/sidebar-persistence' },
            { label: 'Pinned content', link: '/components/pinned-content' },
          ],
        },
        {
          label: 'Marketplace',
          collapsed: true,
          items: [
            { label: 'Overview', link: '/marketplace/overview' },
            { label: 'Addressing', link: '/marketplace/addressing' },
            { label: 'Signing', link: '/marketplace/signing' },
            { label: 'Trust on first use', link: '/marketplace/tofu' },
            { label: 'Publishing', link: '/marketplace/publishing' },
            { label: 'Consuming', link: '/marketplace/consuming' },
            { label: 'Eval gate', link: '/marketplace/eval-gate' },
          ],
        },
        {
          label: 'Runtime',
          collapsed: true,
          items: [
            { label: 'Overview', link: '/runtime/overview' },
            { label: 'Action dispatcher', link: '/runtime/dispatcher' },
            { label: 'Undo middleware', link: '/runtime/undo-middleware' },
            { label: 'Trigger bus', link: '/runtime/trigger-bus' },
            { label: 'Data resolver', link: '/runtime/data-resolver' },
          ],
        },
        {
          label: 'Operations',
          collapsed: true,
          items: [
            { label: 'Deploying', link: '/operations/deploying' },
            { label: 'Releasing', link: '/operations/releasing' },
            { label: 'Env vars', link: '/operations/env-vars' },
            { label: 'Publishing', link: '/operations/publishing' },
            { label: 'Observability', link: '/operations/observability' },
            { label: 'Cost control', link: '/operations/cost-control' },
            { label: 'Cost dashboard', link: '/operations/cost-dashboard' },
            { label: 'Performance', link: '/operations/performance' },
          ],
        },
        { label: 'Roadmap', link: '/roadmap' },
        { label: 'Glossary', link: '/glossary' },
        { label: 'Contributing', link: '/contributing' },
      ],
    }),
  ],
});
