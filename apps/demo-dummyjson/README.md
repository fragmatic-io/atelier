# `@cir/demo-dummyjson` — lens-switching e-commerce showcase

The DummyJSON catalog demo. The pitch:

> Browse a real product catalog. Switch lenses (compact for power users,
> cozy for browsers, spacious for thinking) without losing scroll. Cart
> actions are optimistic with 5s undo. Hover any product for a quick-spec
> card. Bulk-add. Wishlist toggle.

This is one of three reference apps that exercise CIR end-to-end. Where
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
pnpm --filter @cir/demo-dummyjson dev
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
