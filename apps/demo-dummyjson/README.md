# `@atelier/demo-dummyjson` — lens-switching e-commerce showcase

The DummyJSON catalog demo. The pitch:

> Browse a real product catalog. Switch lenses (compact for power users,
> cozy for browsers, spacious for thinking) without losing scroll. Cart
> actions are optimistic with 5s undo. Hover any product for a quick-spec
> card. Bulk-add. Wishlist toggle.

## Design system — Marigold

The dummyjson app ships with a dedicated brand kit, **Marigold**: warm,
approachable, light-mode-primary. Stripe Checkout meets Shopify Polaris.

| Token             | Value          | Note                              |
| ----------------- | -------------- | --------------------------------- |
| `accent.primary`  | `#ff5f3a`      | Energetic warm orange. Retail.    |
| `bg.app` (light)  | `#fffaf3`      | Cream surface — the default.      |
| `bg.app` (dark)   | `#1a1714`      | Warm-charcoal. Dark is secondary. |
| `accent.success`  | `#0d8a72`      | Deep blue-green. "Added to cart." |
| `accent.danger`   | `#dc2626`      | Vivid red, destructive only.      |
| `radius_scale`    | 8/12/16/24 px  | Generous, rounded, friendly.      |
| `motion.duration` | 140/220/320 ms | Smooth + slightly bouncy spring.  |

The full kit lives in [`lib/brand-kit.ts`](./lib/brand-kit.ts) and is
folded into the compiler's system prompt + enforced by the
`respects_brand_kit` policy.

- **Typography.** Inter (system fallback) for body. The display family
  is system-ui semibold today; production target is Cabinet Grotesk.
  JetBrains Mono for SKUs and order numbers.
- **Iconography.** Phosphor only — its rounded silhouette pairs with
  the 8/12/16/24 radius scale.
- **Voice.** Warm + helpful. Lead with the benefit ("Free returns
  within 30 days"). Never push. No "Buy now!", no urgency
  manipulation, no ALL-CAPS for emphasis. Per-surface exemplars for
  buttons, errors, empty states, marketing, and confirmations live on
  `voice.surfaces`.
- **Wordmark.** The retired app-specific `Wordmark` was replaced by the shared
  [`Logo`](../../packages/components/src/components/Logo.tsx) primitive. The
  Marigold host supplies its glyph and wordmark through the component contract.
- **CSS variables.** [`app/globals.css`](./app/globals.css) is the
  runtime source of truth — every surface, radius, shadow, and motion
  token reads off `--cir-color-*` / `--cir-radius-*` / `--cir-shadow-*`
  / `--cir-duration-*`.
- **Tailwind.** [`tailwind.config.mjs`](./tailwind.config.mjs) mirrors
  the brand kit onto Tailwind's theme: `bg-marigold-500`,
  `rounded-cir-lg`, `shadow-cir-md`, `text-cir-primary`. Dark mode
  toggles via `data-color-mode="dark"` on `<html>`.

This is one of three reference apps that exercise Atelier end-to-end. Where
`apps/demo` covers email triage and `apps/demo-github` covers
real-mutation review, **`apps/demo-dummyjson` is the personalisation
showcase**: the same `/browse` route renders three distinct manifests
based on a single intent signal (`global_preferences.density`), with the
compiler and runtime doing the rest.

## What it showcases (one-liners)

- **Wave 6 / P-1 — density signal.** Lens picker writes
  `intent.global_preferences.density` to the vault; the renderer threads
  it through every layout component on the page.
- **Wave 6 / P-2 — `RestDataResolver` against a public API.** No
  fake-data shim; every product fetch hits `https://dummyjson.com`.
- **Wave 6 / Vis-2 — dark mode mirror.** `data-color-mode` toggles on
  `<html>` so every variant table's `dark:` siblings light up.
- **Wave 6 / Vis-4 — variant tables on Wizard / FilterBar / Gallery.**
  `/checkout` exercises `Wizard variant="sidebar"`; `/browse` uses
  `FilterBar variant="chip"`; `/product/[id]` uses `Gallery variant="grid"`.
- **Wave 7a / Int-4 — optimistic UI by default.** `dummyjson.cart.add`
  is `reversible+low_stakes`; the renderer auto-engages the optimistic
  path on every cart-add binding without a single line of host code.
- **Wave 7a / P-8 — empty/loading/error as first-class slots.** Every
  data binding declares its `loading_state` / `empty_state` so policies
  validate the manifest at compile time.
- **Wave 7b / Int-9 — `<BulkActionBar>` on selectable rows.** Cart and
  /browse both expose bulk actions when any row is selected.
- **Wave 7b / Vis-9 — `<StatusBar>` operational pill.** Compact pill in
  the manifest chrome on every route.
- **Wave 7c / Cnt-3 — `<HoverCard>` on browse rows.** Hover any product
  for a quick-spec preview surface.
- **Wave 7b / Nav-3 — pinned-item separator on the cart list.**
  Selectable list with optional pin / separator support.

## Routes

| Path             | What renders                                                                      |
| ---------------- | --------------------------------------------------------------------------------- |
| `/`              | Redirect to `/browse`.                                                            |
| `/browse`        | Lens-driven catalog. List in compact, 3-col Grid in cozy, 2-col Grid in spacious. |
| `/product/[id]`  | DetailView + Gallery + recommendation tile-row.                                   |
| `/cart`          | Selectable list with bulk-remove and an `<KPIRow>` total.                         |
| `/checkout`      | `<Wizard variant="sidebar">` exercising the `checkout-progressive` skill.         |
| `/settings/lens` | Pick compact / cozy / spacious. Writes through `VaultClient.patchProfile()`.      |

## Running

The repo's `pnpm demo` orchestrates the apps/demo email-triage app.
This demo is currently launched directly:

```bash
pnpm --filter @atelier/demo-dummyjson dev
```

…or via the dispatcher script flag:

```bash
pnpm demo --app dummyjson
```

The demo binds against the public DummyJSON API
(`https://dummyjson.com/products`) directly — no API key needed. The
vault is optional; without it, the lens picker writes through to
localStorage with a console warning.

## Lens-switching walkthrough

1. Open `/browse`. You see a 3-column grid (cozy, the default).
2. Open `/settings/lens`, pick **Compact**. The picker writes
   `density: 'compact'` to the vault and bounces back to `/browse`.
3. The runtime invalidates the manifest, the manifest endpoint reads
   `x-cir-density: compact` off the next fetch, the FallbackCompiler
   returns the compact variant — a single-column `<List>`.
4. Pick **Spacious** the same way; the next paint is a 2-column grid
   with bigger thumbnails and breathing room.

The same data binding (`dummyjson.product.list`) feeds all three
variants — only the layout changes.
