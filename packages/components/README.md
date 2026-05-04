# @atelier/components

Baseline React component library for Atelier. Unstyled, semantic primitives
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
| Feedback    | 8     | `Alert`, `Toast`, `Spinner`, `Progress`, `Skeleton`, `Tooltip`, `HoverCard`, `EmptyState` (also counted under Display)                              |
| Action      | 4     | `Button`, `ButtonGroup`, `ActionMenu`, `ConfirmDialog`                                                                                              |
| Specialized | 8     | `Form`, `Wizard`, `FilterBar`, `KPIRow`, `Gallery`, `Kanban`, `Calendar`, `ChatThread`                                                              |

`<HoverCard>` is the rich-content sibling of `<Tooltip>` — distinct from
short hint strings, hover-cards surface metadata, images, stats, or
inline actions on a 320px-wide preview surface (350ms open delay /
150ms close delay; hovering the card itself keeps it open). It pairs
with the future Cnt-3 mention / issue auto-resolution work as the
rendering surface for `#issue` and `@user` previews.

| Prop        | Type     | Default     | Notes                                                                                                                                                                                        |
| ----------- | -------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ariaLabel` | `string` | `'Preview'` | Override the rendered card's `aria-label`. Hosts wiring per-content previews should pass `"Issue #Atelier-123 preview"` / `"Profile of Vid"`. Empty string is an explicit "no label" signal. |

**56 components total** — the full baseline catalog enumerated in
[`docs/component-catalog.md`](../../docs/component-catalog.md). The
single source of truth for the bindings ships from
[`src/registry.ts`](./src/registry.ts) (`COMPONENT_BINDINGS` /
`ALL_COMPONENTS`).

## Usage

```tsx
import { ALL_COMPONENTS, Button, Card, Stack } from '@atelier/components';

// Hand the prebuilt registry to the runtime's render-plan builder:
import { buildRenderPlan } from '@atelier/runtime';
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
`CompositionRulesSchema` from `@atelier/schemas`.

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

## Brand kit presets

`@atelier/components` ships three free starter design systems as
`BrandKit` contracts:

- `neutralBrandKit` — calm default for internal tools.
- `commerceBrandKit` — warmer marketplace and support-ops surfaces.
- `consoleBrandKit` — dense dark operations and engineering consoles.

Use `brandKitToCssVars()` to project a kit into CSS variables, then apply
those variables at the app or route boundary:

```tsx
import { brandKitToCssVars, neutralBrandKit } from '@atelier/components';

const vars = brandKitToCssVars(neutralBrandKit);

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div data-atelier-brand={neutralBrandKit.id} style={vars}>
      {children}
    </div>
  );
}
```

Storybook exposes the same presets through the **Design system** toolbar.
The presets are defaults, not a replacement for app branding: production
hosts should publish their own versioned BrandKit and pass it to the
compiler, policy engine, and runtime CSS bridge.

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

## Pinned items (List, Table — Wave 7b / Nav-3)

`List` and `Table` honour an optional `pinned: true` flag on each item /
row. Pinned items float to the top of the rendered list (in source order,
above unpinned siblings), get a Unicode pushpin (`📌`) indicator, and
stick to the top of the parent scroll container via inline
`position: sticky; top: 0; z-index: 10` (no Tailwind config required).
Items without `pinned` render exactly as before.

```tsx
<List
  items={[
    { id: 'a', label: 'Alpha' },
    { id: 'b', label: 'Bravo', pinned: true },
    { id: 'c', label: 'Charlie' },
  ]}
  renderItem={(it) => <span>{it.label}</span>}
/>
// Render order: Bravo (pinned, sticky) → separator → Alpha → Charlie.
```

Both components accept:

| Prop                     | Default     | Notes                                                          |
| ------------------------ | ----------- | -------------------------------------------------------------- |
| `showPinnedSeparator`    | `true`      | Faint divider drawn between pinned and unpinned blocks.        |
| `pinnedSeparatorVariant` | `'default'` | `'default'` (gray-300) or `'subtle'` (gray-200, smaller `my`). |
| `pinAriaLabel(item)`     | `'Pinned'`  | Override for non-English / contextual labels.                  |

Hosts can target the new state via `[data-pinned="true"]`,
`[data-has-pinned="true"]`, `[data-pin-indicator="true"]`, and
`[data-cir-part="pinned-separator"]` selectors. React keys are derived
from each item's source-array index so reconciliation stays stable when a
single item flips pinned ↔ unpinned.

## Selectable lists, tables, and grids (Wave 7b / Int-9 + Wave 7c / track A)

`List`, `Table`, and `Grid` ship a built-in multi-select integration that
auto-mounts the floating `<BulkActionBar>` (a portal-rendered, Linear-grade
action bar) the moment one row is selected. Pass `selectable: true` plus
`bulkActions` and the bar appears at bottom-center; users can also press
**Esc** to clear the selection from anywhere.

```tsx
import { List, type BulkAction } from '@atelier/components';

const repos = [
  { id: 'r1', name: 'cir' },
  { id: 'r2', name: 'docs' },
  { id: 'r3', name: 'demo' },
];
const actions: readonly BulkAction[] = [
  { id: 'github.repo.archive', label: 'Archive' },
  { id: 'github.repo.delete', label: 'Delete', variant: 'destructive' },
];

<List
  items={repos}
  renderItem={(r) => <span>{r.name}</span>}
  selectable
  idOf={(r) => r.id}
  bulkActions={actions}
  onBulkAction={(actionId) => dispatch(actionId /* ...selectedIds */)}
/>;
// As soon as one row is selected, the floating bar appears with
// "1 selected · Archive · Delete · ×" — Esc or × clears.
```

The shared selection contract on all three components:

| Prop                | Type                                  | Notes                                                                                                                                 |
| ------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `selectable`        | `boolean`                             | Master switch. When `false` (default), the component renders identically to a Wave 7a build — no checkboxes, no bar.                  |
| `idOf`              | `(item, i) => string`                 | Stable id extractor. Defaults to the row index (`String(i)`); `Grid` defaults to `item.id`.                                           |
| `selectedIds`       | `ReadonlySet<string>`                 | Controlled mode. When supplied, the component reflects this set verbatim and never reads its own state.                               |
| `onSelectionChange` | `(next: ReadonlySet<string>) => void` | Fires on every checkbox click / shift-click range. Hosts pass an immutable next-state.                                                |
| `bulkActions`       | `readonly BulkAction[]`               | When supplied AND the selection is non-empty, `<BulkActionBar>` auto-mounts. Omit to render your own bar elsewhere.                   |
| `onBulkAction`      | `(actionId: string) => void`          | Forwarded from a click on a bar button. The id is the action's `id` field — typically a capability id like `github.issue.bulk_close`. |

Behaviour:

- **Click** toggles a single row.
- **Shift+Click** range-selects between the last clicked anchor and the new
  row (the anchor is the last row clicked without Shift; persists across
  renders until the user clears).
- **Esc** clears the selection (the bar binds the listener for the
  lifetime it is mounted, so the shortcut works everywhere).
- The bar slides up over ~140ms and honours `prefers-reduced-motion: reduce`.
- The `Table` header gets a **select-all** checkbox in the first column —
  checked when every visible row is selected, **indeterminate** when only
  some rows are. Clicking it toggles between "all" and "none".
- **Pinned items (Nav-3) coexist** — pinned rows / list items get a
  checkbox just like any other row, and `data-pinned="true"` +
  `data-selected="true"` can both be true on the same node.

Hosts that prefer to own selection state (e.g. to drive `Cmd/Ctrl+A`,
or to share one selection across multiple lists) can wire the
`useMultiSelect()` hook from [`@atelier/react`](../react/README.md) and pipe
its `selected` set straight into `selectedIds` — see the React README for
a Linear-style sample.

## `<Sidebar>` collapse persistence (Wave 7b / Nav-2)

`<Sidebar>` is opt-in collapsible. The default render path (no extra
props) is unchanged — call sites that only set `defaultCollapsed`
behave exactly as in Wave 4b. Set `collapsible` to enable Linear-style
toggle memory:

| Prop               | Type                   | Default | Notes                                                                                                                               |
| ------------------ | ---------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `collapsible`      | `boolean`              | `false` | Master switch. When `false`, all rows below are inert.                                                                              |
| `collapsed`        | `boolean`              | —       | Controlled mode. Wins over `persistKey` storage; the component never writes to storage in controlled mode.                          |
| `defaultCollapsed` | `boolean`              | `false` | Initial state for uncontrolled mode and the fallback when persisted storage is missing or corrupt.                                  |
| `onCollapseChange` | `(c: boolean) => void` | —       | Fires after every change (button click, keyboard shortcut, controlled prop swap).                                                   |
| `persistKey`       | `string`               | —       | When set with `collapsible: true`, the collapse boolean is read on mount and written on every change to `localStorage[persistKey]`. |
| `toggleShortcut`   | `string \| false`      | `'['`   | Document-level keyboard shortcut. Single key, no modifiers. Pass `false` to disable. Suppressed inside form controls.               |

Storage shape: each `persistKey` holds the literal string `'1'`
(collapsed) or `'0'` (expanded). Anything else falls through to
`defaultCollapsed`. The helpers live at
[`src/lib/persisted-state.ts`](./src/lib/persisted-state.ts)
(`readPersistedBool` / `writePersistedBool`) and are SSR-safe — every
call wraps `window` access in `try/catch` so quota errors, disabled
storage, and SSR all degrade silently.

```tsx
<Sidebar
  items={items}
  collapsible
  defaultCollapsed={false}
  persistKey="cir.demo.sidebar"
  onCollapseChange={(c) => analytics.track('sidebar_toggled', { collapsed: c })}
/>
```

ARIA: when `collapsible` is on, the `<aside>` carries
`aria-label="Sidebar (collapsible)"` (override via the existing
`aria-label` prop) and the toggle button's `aria-expanded` mirrors the
state. Collapsed state slides the inline width from 240px down to 48px
with a 200ms `width` transition; the transition is skipped when
`prefers-reduced-motion: reduce` is set, and
`data-cir-reduced-motion="true"` is exposed for stylesheet hooks.

## `<Skeleton>` shape catalog (Wave 7b / Vis-8)

`<Skeleton>` ships a `shape` prop that matches the placeholder to the
real layout. The default `'rect'` shape is unchanged from Wave 6 — a
single grey rectangle whose `width` / `height` / `radius` props still
work exactly as before, so every existing `<Skeleton />` call site keeps
its current rendering.

| `shape`               | Composition                                      | Layout sketch                                              |
| --------------------- | ------------------------------------------------ | ---------------------------------------------------------- |
| `rect` (default)      | Single grey rectangle (legacy behaviour)         | `[██████████]`                                             |
| `circle`              | One circular block (sized by `width` / `height`) | `(●)`                                                      |
| `text-line`           | One rect, 60–95% width (stable per render)       | `[████████░░]`                                             |
| `avatar-with-2-lines` | Avatar circle + name line + meta line            | `(●) ████████░░` <br/> ` ░░░██████░░░░`                    |
| `card`                | Title + media + 2 body lines                     | `[████░░░░]` <br/> `[██████████]` <br/> `[████████░░]`     |
| `table-row`           | `columns` cells in a row, `count` rows tall      | `[██] [█] [████] [██]`                                     |
| `kpi-tile`            | Small label + big number block                   | `[███░░░░░]` <br/> `[██████░░]`                            |
| `detail-view`         | Hero block + 3 stat tiles + 3 body lines         | `[██████████]` <br/> `[██] [██] [██]` <br/> `[████████░░]` |
| `gallery-tile`        | Image placeholder + caption line                 | `[██████████]` <br/> `[████░░░░░░]`                        |
| `timeline-event`      | Dot + date + description                         | `(●) [███░░] [████████░░]`                                 |
| `text-paragraph`      | `count` staggered text lines                     | `[████████░░]` <br/> `[██████░░░░]` <br/> `[████████░░]`   |

Two extra props apply to the tiling shapes:

| Prop      | Applies to                    | Default | Notes                                       |
| --------- | ----------------------------- | ------- | ------------------------------------------- |
| `count`   | `table-row`, `text-paragraph` | `1`     | Number of repeated rows. Clamped to `>= 1`. |
| `columns` | `table-row`                   | `4`     | Cells per row.                              |

Every shape ships with the existing `animate-pulse` shimmer (a Tailwind
utility class — no new keyframes). Hosts that honour
`prefers-reduced-motion: reduce` get a still placeholder automatically;
the component drops the `animate-pulse` class on its root when the media
query matches. The composition rule remains
`Skeleton: { can_contain: 'leaf' }` — every shape is layout-only, so
authors keep wiring `<Skeleton shape="…" />` into a `loading_state` slot
without touching the registry.

```tsx
// List loading_state — best-in-class match for an avatar + name layout
<Skeleton shape="avatar-with-2-lines" count={5} />

// Table loading_state — 3 rows of 5 columns
<Skeleton shape="table-row" columns={5} count={3} />
```

## Icons (Wave 7b / Vis-3)

`@atelier/components` ships **zero icon packs**. The `<Icon>` primitive is a
thin wrapper that asks a host-supplied `IconResolver` for the SVG markup
of a `(set, name)` pair, then injects it. Three reference resolvers ship
with the package: `MapIconResolver`, `LiteralIconResolver`, and
`NoopIconResolver` (the default — returns `null` for every lookup).

### Why a protocol, not a dep

Atelier runs in many hosts; each picks its own pack (Lucide, Phosphor,
Heroicons, an in-house set). Bundling a pack here would either pin every
host to one choice or leak hundreds of KB of icon SVGs into the runtime.
The resolver lets each host bring exactly the icons it cares about.

### Plugging in the reference Lucide pack (Wave 11 / Vis-3)

For most hosts the fastest path is the built-in `LucideIconResolver`, which
ships a curated default roster (~50 icons) sourced from `lucide-react` and
honours `BrandKit.iconography.allowed_sets` at runtime:

```tsx
import { IconResolverProvider, LucideIconResolver } from '@atelier/components';

// Construct once at startup. `allowedSets` mirrors `iconography.allowed_sets`
// from your brand kit; the resolver emits a one-time console warn and
// returns null for any set outside the allow-list.
const resolver = new LucideIconResolver({
  allowedSets: brandKit.iconography?.allowed_sets,
});

export function App({ children }: { children: React.ReactNode }) {
  return <IconResolverProvider resolver={resolver}>{children}</IconResolverProvider>;
}
```

### Plugging in a custom pack

```tsx
import {
  IconResolverProvider,
  LiteralIconResolver,
  Button,
  Alert,
  EmptyState,
} from '@atelier/components';

// 1. Load / build your pack — anything that yields SVG strings keyed by
//    name. The example below uses literal markup; in production you'd
//    typically pull from `lucide-react`'s `iconNodes` or similar.
const lucide = {
  archive:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke="currentColor" fill="none"><path d="M21 8H3"/><path d="M3 8v13h18V8"/></svg>',
  trash:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke="currentColor" fill="none"><polyline points="3 6 5 6 21 6"/></svg>',
  inbox:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke="currentColor" fill="none"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/></svg>',
};

// 2. Wrap your tree once at the root.
const resolver = new LiteralIconResolver({ lucide });

export function App({ children }: { children: React.ReactNode }) {
  return <IconResolverProvider resolver={resolver}>{children}</IconResolverProvider>;
}
```

For larger packs, `MapIconResolver` accepts a flat
`ReadonlyMap<string, string>` keyed `${set}:${name}` — the format most
build-time codegen emits naturally.

### Using `<Icon>` directly or via integrated components

```tsx
// Direct use — pass `(set, name)` plus optional sizing / a11y.
<Icon set="lucide" name="archive" size={20} ariaLabel="Archive item" />;

// Integrated — Button / Alert / EmptyState / MetaBadge accept an `icon`
// prop. The bare-string form (recommended) resolves against the default
// `'lucide'` set:
<Button icon="archive">Archive</Button>;

<Alert severity="warning" title="Heads up">
  Your draft will expire in 5 minutes.
</Alert>;
// ↑ no `icon` prop — Alert auto-derives `'alert-triangle'` from severity.

<EmptyState title="Inbox zero" description="No new messages." icon="inbox" />;

<MetaBadge icon="circle-dot" label="online" variant="live" />;

// The legacy `{ set, name }` shape also still works for hosts that wire
// non-default packs:
<Button icon={{ set: 'phosphor', name: 'gear' }}>Settings</Button>;
```

If the resolver returns `null` for `(set, name)`, `<Icon>` renders a
layout-stable empty span (`data-icon-missing="true"`) sized to the
icon's target dimensions, so missing icons never collapse the layout.

### Brand-kit clamping

Wrap the tree in `<IconBrandProvider config={{ minimumSize: 16 }}>` to
honour `BrandIconographySchema.minimum_size`; `<Icon>` clamps `size` up
to the floor automatically.

### Why `dangerouslySetInnerHTML` is OK here

The resolver is the host's contract. Hosts choose what SVGs they expose,
so the strings are trusted by construction. Never wire an
`IconResolver` whose source is untrusted (e.g. user-typed SVG markup)
without sanitising upstream.

The remaining 56 components do not (yet) take an `icon` prop — Wave 11+
adds icons surface-by-surface. The three integrations above are the
high-impact starter set.

## Dark mode (Vis-2)

Every entry in `src/components/_variants.ts` ships paired light + `dark:`
Tailwind utilities, so a host configured for class-based dark mode gets a
working dual theme out of the box. The runtime mirrors the user's
`intent.global_preferences.color_mode` onto `<html data-color-mode>` from
`<CirRoute>` (see `packages/react/src/render/route.tsx` →
`useColorModeFromIntent`), and the variant tables key off the standard
`dark:` prefix.

### Required Tailwind config

```js
// tailwind.config.mjs
export default {
  // The selector form matches `<html data-color-mode="dark">` written by
  // <CirRoute>; the 'class' fallback covers hosts that toggle class="dark"
  // directly. Either selector enables the dark: utilities below.
  darkMode: ['class', '[data-color-mode="dark"]'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    // Tailwind must scan our shipped variant strings:
    './node_modules/@atelier/components/dist/**/*.js',
  ],
};
```

`atelier init` scaffolds this file automatically. Hosts that don't ship
Tailwind (or that key on a different selector) ignore the unknown
classes — both the light and dark utilities are inert in that case, so
adding the `dark:` prefix never breaks a non-Tailwind host.

### Visual reference

- Light backgrounds (`bg-white`, `bg-gray-50`) → `dark:bg-gray-900` /
  `dark:bg-gray-800`.
- Light text (`text-gray-900`) → `dark:text-gray-100`.
- Borders (`border-gray-200`) → `dark:border-gray-700`.
- Severity tints (`bg-blue-50` / `bg-green-50` / etc.) →
  `dark:bg-blue-950 dark:text-blue-100` style pairing.
- Shadows: kept verbatim — Tailwind's `shadow-*` utilities adapt across
  modes, with darker `shadow-black/40` overrides on elevated containers.

The `ghost` layout variant is intentionally `bg-transparent` with no
`dark:` sibling — it inherits the surface beneath, so adding a forced
dark surface would harm composability.

### Regression gate

`test/_variants-dark.test.ts` asserts every colour-bearing entry in every
variant table contains at least one `dark:` prefix. New variants that
forget dark mode fail the gate at `pnpm test`.

## Tests

```sh
pnpm --filter @atelier/components test
pnpm --filter @atelier/components typecheck
```
