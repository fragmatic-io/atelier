# @cir/components

Baseline React component library for CIR. Unstyled, semantic primitives
that fit the runtime's `ComponentBinding`. Hosts paint them via
`data-cir-component=...` selectors and `data-variant=...` attributes
(see `apps/demo/app/globals.css` for an example Tailwind 4 pass).

## What ships

| Group       | Count | Components                                                                                                                                          |
| ----------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Layout      | 8     | `Stack`, `Container`, `Grid`, `Card`, `Tabs`, `Accordion`, `Modal`, `Drawer`, `Split`                                                               |
| Display     | 12    | `Markdown`, `Table`, `List`, `DetailView`, `StatCard`, `Chart`, `Timeline`, `Tree`, `CodeView`, `DiffView`, `Map`, `EmptyState`                     |
| Input       | 12    | `TextInput`, `NumberInput`, `DateInput`, `TimeInput`, `Select`, `MultiSelect`, `Toggle`, `Slider`, `FileUpload`, `RichText`, `CodeEditor`, `Search` |
| Navigation  | 6     | `NavBar`, `Sidebar`, `Breadcrumb`, `Pagination`, `Stepper`, `CommandPalette`                                                                        |
| Feedback    | 6     | `Alert`, `Toast`, `Spinner`, `Progress`, `Skeleton`, `EmptyState` (also counted under Display)                                                      |
| Action      | 4     | `Button`, `ButtonGroup`, `ActionMenu`, `ConfirmDialog`                                                                                              |
| Specialized | 8     | `Form`, `Wizard`, `FilterBar`, `KPIRow`, `Gallery`, `Kanban`, `Calendar`, `ChatThread`                                                              |

**56 components total** — the full baseline catalog enumerated in
[`docs/component-catalog.md`](../../docs/component-catalog.md). The
single source of truth for the bindings ships from
[`src/registry.ts`](./src/registry.ts) (`COMPONENT_BINDINGS` /
`ALL_COMPONENTS`).

## Usage

```tsx
import { ALL_COMPONENTS, Button, Card, Stack } from '@cir/components';

// Hand the prebuilt registry to the runtime's render-plan builder:
import { buildRenderPlan } from '@cir/runtime';
const plan = buildRenderPlan(manifest, '/dashboard', ALL_COMPONENTS);

// Or use the components directly for hand-rolled UIs:
function Page() {
  return (
    <Card title="Welcome">
      <Stack gap="md">
        <p>Hello, world.</p>
        <Button variant="primary">Get started</Button>
      </Stack>
    </Card>
  );
}
```

## Composition rules

Every component declares what it can contain via `COMPOSITION_RULES`. The
compiler reads these to produce valid manifest layouts; the runtime can
validate at render time. See `docs/component-catalog.md` §"Composition
rules". `COMPOSITION_RULES` ships out to `/components/composition-rules.json`
via `pnpm components:sync` and is validated against
`CompositionRulesSchema` from `@cir/schemas`.

## Per-component metadata

`COMPONENT_METADATA` (also exported from `./registry.js`) is an optional
sidecar map that pairs a component id with the capability ids it idiomatically
binds to and the recipes that demonstrate it. The fields are:

| Field              | Meaning                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| `dataSources`      | Capability ids this component reads from. Empty (or omitted) for pure-display leaves and layout. |
| `actionsSupported` | Capability ids this component can dispatch. Empty (or omitted) for pure-display.                 |
| `examples`         | Repo-rooted paths (`/recipes/...`) to manifest examples the compiler can use as few-shot fodder. |

The sync script projects this into `data_sources`, `actions_supported`, and
`examples` on each `ComponentDefinition` in `/components/registry.json`.
Empty is HONEST: leave a field undefined when no capability in
`/capabilities/` matches the component's role. Fabricated bindings are worse
than empty ones.

## Text fallback

Every component carries a corresponding `text_render` in `TEXT_RENDERERS`
keyed by component id. Required by
[`docs/chat/multi-modal.md`](../../docs/chat/multi-modal.md) §"Text
fallback" — voice agents, screen readers, terminal UIs, and graceful
degradation all need a text representation.

## Styling

This package is **intentionally unstyled**. The only baked-in styles are
the bare minimum needed for a primitive to be usable before any CSS
lands (e.g. `Button` gets `cursor: pointer`, `Stack` gets its flex
declarations). Every component exposes:

- A stable `data-cir-component="<Name>"` attribute for selector hooks
- Variant data attributes (`data-variant`, `data-severity`, `data-gap`,
  `data-direction`, `data-columns`, `data-max-width`, `data-padding`,
  `data-size`)
- A `className` passthrough

Hosts paint these via Tailwind or vanilla CSS. `apps/demo` ships a
Tailwind 4 baseline.

## Variants

Wave 6 / P-10 added a small `variant` (and where applicable `size`) prop
to 24 high-impact components. The variant maps to a hand-rolled Tailwind
utility class string in `src/components/_variants.ts` so Tailwind hosts
pick up styling for free; non-Tailwind hosts ignore the unknown classes
and select on `data-variant=...`.

| Category          | Components                                      | `variant` values                                                  | Default     |
| ----------------- | ----------------------------------------------- | ----------------------------------------------------------------- | ----------- |
| Layout containers | `Stack`, `Container`, `Grid`, `Tabs`            | `bordered` \| `elevated` \| `ghost` \| `tinted`                   | `ghost`     |
| Layout containers | `Card`, `Accordion`                             | `bordered` \| `elevated` \| `ghost` \| `tinted`                   | `bordered`  |
| Layout containers | `Modal`, `Drawer`                               | `bordered` \| `elevated` \| `ghost` \| `tinted`                   | `elevated`  |
| Display           | `Alert`, `Toast`                                | `info` \| `success` \| `warning` \| `error` (= `severity`)        | `info`      |
| Display           | `EmptyState`, `Markdown`, `Spinner`, `Progress` | `bordered` \| `elevated` \| `ghost` \| `tinted`                   | `ghost`     |
| Display           | `Skeleton`                                      | `bordered` \| `elevated` \| `ghost` \| `tinted`                   | `tinted`    |
| Stat / KPI        | `StatCard`, `KPIRow`                            | `default` \| `accent` \| `muted`                                  | `default`   |
| Action            | `Button`                                        | `primary` \| `secondary` \| `ghost` \| `outline` \| `destructive` | `primary`   |
| Action            | `ButtonGroup`, `ActionMenu`                     | `primary` \| `secondary` \| `ghost` \| `outline` \| `destructive` | `secondary` |
| Search            | `Search`                                        | `default` \| `embedded`                                           | `default`   |
| Specialized       | `List`, `Table`, `DetailView`                   | `bordered` \| `elevated` \| `ghost` \| `tinted`                   | `ghost`     |

A `size` prop (`sm` \| `md` \| `lg`, default `md`) is available on
`Button`, `ButtonGroup`, `ActionMenu`, `StatCard`, and `KPIRow`.

The remaining 32 components (inputs, charts, niche primitives) get
variants in a follow-up pass — see `TODO.md` Phase 7+.

## Tests

```sh
pnpm --filter @cir/components test
pnpm --filter @cir/components typecheck
```
