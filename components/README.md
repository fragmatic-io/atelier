# components/

The **UI primitive registry** plus runtime implementations. The catalog is what gives CIR coverage: a small, well-designed set of ~56 primitives covers 90% of web app patterns. The compiler picks from this catalog; the runtime renders it. Free-form HTML generation is explicitly out of scope.

## Files

- `registry.json` — the catalog (props schemas, composition rules, data sources, supported actions, design tokens, examples).
- `examples/{name}.json` — one or more usage examples per component, used by the compiler as in-context guidance.
- Implementations live in the runtime package (eventually `packages/runtime/components/`).
- **Naming**: PascalCase component names (`TaskQueue`, `DecisionQueue`, `ThreadView`).

## Background

See [`../docs/component-catalog.md`](../docs/component-catalog.md) for the **56-component baseline** (Layout, Display, Input, Navigation, Feedback, Action, Specialized) and the composition rules that turn primitives into pages. The shipped React bindings live in [`@cir/components`](../packages/components/README.md).

## Adding a component

Follow [`../AGENTS.md`](../AGENTS.md) — section "When asked to add a component":

1. Add the props schema to `/components/registry.json`.
2. Implement the component in the runtime SDK.
3. Add usage examples at `/components/examples/{name}.json`.
4. Document allowed `data_sources` and `actions_supported`.
5. Add accessibility tests.
6. Provide a `text_render` fallback (required for voice, terminal, and graceful degradation).
7. Bump the catalog version and emit `component.catalog_changed`.

Components are **append-only by default** (Hard Rule 3). Removing a component breaks every manifest using it; deprecate first, remove after 90 days, document the migration path.

## Status

Catalog populated. The 56-component baseline ships in [`@cir/components`](../packages/components/README.md); per-app domain extensions (e.g. `ThreadView`, `TaskQueue`, `DecisionQueue` in `apps/demo`) live in their respective apps.
