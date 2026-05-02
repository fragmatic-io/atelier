# @cir/marketing

The CIR marketing site / public docs surface. Astro static export, deployed to GitHub Pages.

## Stack

- **Astro 5** — zero JS by default, static export, islands opt-in.
- **No Tailwind, no analytics, no CMS.** Vanilla CSS, dark-mode-aware via `prefers-color-scheme`.
- **TypeScript strict** via `astro/tsconfigs/strict`.

## Pages

| Route           | What it shows                                                                 |
| --------------- | ----------------------------------------------------------------------------- |
| `/`             | Headline pitch, three-line architecture summary, marketplace-pivot zero-strip |
| `/ethos`        | The eleven principles, Principle #11 highlighted as the marketplace clincher  |
| `/start`        | Quick start — install, run a demo, write a recipe, see the manifest compile   |
| `/architecture` | ASCII pipeline diagram + cold-path/hot-path flow + package summary            |
| `/demos`        | Aurora · Octant · Marigold cards, each with a "Zero custom components" badge  |

## Local development

```bash
pnpm --filter @cir/marketing dev        # http://localhost:4321
pnpm --filter @cir/marketing build      # → ./dist
pnpm --filter @cir/marketing preview    # serves built site locally
pnpm --filter @cir/marketing typecheck  # astro check
```

## Deploy

GitHub Actions workflow at [`.github/workflows/marketing-deploy.yml`](../../.github/workflows/marketing-deploy.yml). Triggers on `push` to `main` that touches `apps/marketing/**`, plus manual `workflow_dispatch`.

**One-time GitHub setup the maintainer must do:**

1. **Settings → Pages → Source: GitHub Actions** (the workflow won't deploy until this is flipped).
2. (Optional) bind a custom domain — drop a `CNAME` file in `apps/marketing/public/` and set `MARKETING_BASE=/` + `MARKETING_SITE=https://your.domain` in the workflow env.

The default `site` is `https://fragmatic-io.github.io` and `base` is `/cir` so URLs work on the project site URL out of the box.

## Why no Tailwind

Marketing surfaces are < 10 pages, < 1k lines of CSS. Tailwind's setup cost (PostCSS, plugin chain, JIT, IDE config) doesn't pay back at this size. The vanilla CSS in `src/styles/global.css` ships ~6 KB.

## Copy provenance

Copy is distilled from existing repo docs — `README.md`, `docs/ethos.md`, `docs/architecture.md`, `docs/quick-reference.md`, the demo READMEs — not authored fresh. Where space is short, pages summarize and link to the canonical source.
