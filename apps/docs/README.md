# @atelier/docs

The Atelier developer documentation site. Astro + Starlight, deployed to GitHub Pages alongside the marketing site.

- **Site:** https://fragmatic-io.github.io/atelier/docs/
- **Marketing site (sibling):** https://fragmatic-io.github.io/atelier/
- **Source:** the chapter content in [`/docs/`](../../docs/) — keep both in sync when editing concept pages.

## Local development

```bash
pnpm --filter @atelier/docs dev
# → http://localhost:4321/atelier/docs/
```

## Build

```bash
pnpm --filter @atelier/docs build
# emits to apps/docs/dist
```

## Typecheck

```bash
pnpm --filter @atelier/docs typecheck
```

## Stack

- **Astro** — static-export framework. `output: 'static'` so we ship plain HTML + zero JS by default.
- **Starlight** — the docs-themed integration. Built-in search (Pagefind), dark mode, sidebar, table of contents, edit-this-page links, last-updated stamps.
- **Mermaid via `rehype-mermaid`** — diagrams render at build time as inline SVG (`strategy: 'inline-svg'`) — no runtime JS required for the diagram surface.
- **Shiki** — syntax highlighting (Starlight default). Dual themes (`github-light` / `github-dark`) so dark-mode toggling is a CSS-only paint.

## Pages

- `src/content/docs/index.mdx` — landing.
- `src/content/docs/introduction/` — what / why / ethos.
- `src/content/docs/getting-started/` — installation, first app, first recipe, deploying.
- `src/content/docs/concepts/` — capability, intent, manifest, recipe, skill, brand kit, policy, trigger.
- `src/content/docs/compiler/` — overview, tools, validation feedback, capability scoping, budget.
- `src/content/docs/components/` — catalog, baseline-vs-custom, composition, variants, motion, virtualization, icons, undo toast, keyboard, breadcrumb trail, sidebar persistence, pinned content.
- `src/content/docs/marketplace/` — overview, addressing, signing, TOFU, publishing, consuming.
- `src/content/docs/runtime/` — overview, dispatcher, undo middleware, trigger bus, data resolver.
- `src/content/docs/operations/` — deploying, observability, cost control, performance.
- `src/content/docs/roadmap.mdx` — Wave/track table from `TODO.md`.
- `src/content/docs/glossary.mdx` — vocabulary reference.
- `src/content/docs/contributing.mdx` — short-form contributor guide.

## Deploy

The deploy workflow is `.github/workflows/docs-deploy.yml`. Triggers on pushes to `main` touching `apps/docs/**` (and `workflow_dispatch`). The workflow builds the docs site to `apps/docs/dist`, builds the marketing site to `apps/marketing/dist`, merges both into a single Pages artifact (marketing at `/`, docs at `/docs/`), and `actions/deploy-pages@v4` publishes.

GitHub Pages allows one source per repo. The combined-artifact pattern keeps both sites under the same `/atelier/` Pages site at different subpaths — pragmatic, single point of deploy, no separate Pages target needed.

## Adding a page

1. Create `src/content/docs/<section>/<slug>.mdx`.
2. Add to the `sidebar` config in `astro.config.mjs`.
3. Use Starlight `Aside` / `Steps` / `Tabs` / `Card` / `LinkCard` components for richer prose.
4. Use Mermaid fenced blocks (`mermaid` language) for diagrams.

## See also

- [Docs site (production)](https://fragmatic-io.github.io/atelier/docs/)
- [Marketing site](https://fragmatic-io.github.io/atelier/)
- [Repo root](../../README.md)
