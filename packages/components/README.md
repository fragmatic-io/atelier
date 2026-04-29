# @cir/components

Phase 4b baseline React component library for CIR. Unstyled, semantic
primitives that fit the runtime's `ComponentBinding`. A Phase 4c demo
package will layer Tailwind/CSS on top via `data-cir-component=...`
selectors and `data-variant=...` attributes.

## What ships in 4b

| Group    | Components                           |
| -------- | ------------------------------------ |
| Layout   | `Stack`, `Card`, `Container`, `Grid` |
| Display  | `Markdown`, `Table`, `EmptyState`    |
| Input    | `Button`, `TextInput`, `Select`      |
| Feedback | `Alert`, `Spinner`                   |
| Action   | `ConfirmDialog`                      |

13 components. The full 50-primitive baseline is enumerated in
[`docs/component-catalog.md`](../../docs/component-catalog.md); this
package implements the starter subset.

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
rules".

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
  `data-direction`, `data-columns`, `data-max-width`, `data-padding`)
- A `className` passthrough

A Phase 4c demo package will paint these via Tailwind or vanilla CSS.

## Phase-4b stubs

Two components are intentionally minimal until later phases:

- **`Markdown`** renders content verbatim inside `<pre>`. No parser
  dependency at this phase. Phase 5 will swap in a sanitized renderer
  (`react-markdown` + DOMPurify or equivalent) once the security model
  for raw HTML pass-through and link sanitization is decided.
- **`Spinner`** is static text — no spin animation. The markup contract
  (`<output role="status" aria-live="polite">`) is in place; a Phase 4c
  CSS pass adds the keyframes.

## Tests

```sh
pnpm --filter @cir/components test
pnpm --filter @cir/components typecheck
```
