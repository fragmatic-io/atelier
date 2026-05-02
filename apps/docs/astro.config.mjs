// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import rehypeMermaid from 'rehype-mermaid';

// GitHub Pages serves project sites from `<user>.github.io/<repo>/` unless a
// custom domain is bound. Marketing lives at `/atelier/` and the docs site
// lives at `/atelier/docs/`. The combined deploy workflow stitches both
// into one Pages artifact; the docs site's `base` is the docs subpath.
const base = process.env.DOCS_BASE ?? '/atelier/docs';
const site = process.env.DOCS_SITE ?? 'https://fragmatic-io.github.io';

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

      // The marketing site lives at `/atelier/` and is the brand surface.
      // Top-bar links cross over to it so a reader can hop between the
      // pitch site and the docs without thinking about deploy boundaries.
      components: {},
      head: [
        {
          tag: 'meta',
          attrs: { name: 'theme-color', content: '#6e56cf' },
        },
      ],

      sidebar: [
        {
          label: 'Introduction',
          items: [
            { label: 'What is Atelier?', link: '/introduction/what-is-atelier' },
            { label: 'Why Atelier?', link: '/introduction/why-atelier' },
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
            { label: 'Budget enforcement', link: '/compiler/budget' },
          ],
        },
        {
          label: 'Components',
          collapsed: true,
          items: [
            { label: 'Catalog (67 baseline)', link: '/components/catalog' },
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
            { label: 'Observability', link: '/operations/observability' },
            { label: 'Cost control', link: '/operations/cost-control' },
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
