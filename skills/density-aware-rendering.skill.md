---
name: density-aware-rendering
version: 0.1.0
description: Honour the user's density preference (and per-route overrides) by threading `intent.global_preferences.density` through the renderer to every density-aware layout primitive — re-scaling row height, padding, and gap multipliers from a single intent signal.
capabilities_used: []
when_to_use: |
  Whenever a route renders any of the density-aware layout primitives
  (Stack, Container, Card, Grid, List, Table, Queue, KPIRow, StatCard,
  DetailView, Skeleton, VirtualList, VirtualTable). The renderer threads
  the effective density — `resolveDensity(intent, route)` — to those
  components as a default; the skill explains the contract so authors do
  not micro-author per-component density props.

  Three values: `'compact'` (tight rhythm — halves padding, halves gap;
  for power-user surfaces like admin tables and dense queues),
  `'comfortable'` (the framework's baseline rhythm — used everywhere by
  default), and `'spacious'` (relaxed rhythm — doubles padding, 1.5x
  gap; for onboarding flows, hero pages, and accessibility-leaning
  users).

  The data resolver's loading-state slots (the resolver fallback contract
  from P-8) honour density too — `<Skeleton>` row heights track the
  effective density so the loading shape matches the populated shape.

  When the user changes their density preference (or moves between two
  routes with different `density_overrides`), the renderer re-threads the
  new value. Components emit `data-cir-density="<value>"` so host
  stylesheets can target the per-route surface — and the route walker
  emits the same attribute on the outermost wrapper so CSS variables
  (`--atelier-density-padding`, `--atelier-density-row-padding`,
  `--atelier-density-gap-multiplier`) resolve to the right values without
  any per-component plumbing.
when_not_to_use: |
  Do not author per-node `density` overrides on every layout primitive in
  the manifest. The walker fills the prop from intent automatically; a
  manifest that micro-authors `density='compact'` on each `<Card>` drifts
  from the user's preference the moment they switch lenses.

  The legitimate manifest override is per-surface: a power-user admin
  route forcing `density='compact'` regardless of the user's global
  preference. Express that as an `IntentProfile.density_overrides` rule
  (route-pattern glob → density), not as a per-node prop, so the rule
  audits cleanly and survives recompiles.

  Skip on components that do not consume density (form inputs, charts,
  popovers, the icon resolver). The walker only defaults the prop on
  components whose binding declares density-awareness.
example_flow: |
  1. The host wires `<CirRoute path="/admin/queues" />`. The intent
     profile carries `global_preferences.density: 'comfortable'`, and
     the profile also declares
     `density_overrides: [{ route_pattern: '/admin/*', density: 'compact', reason: 'admin power-user surface' }]`.
  2. The renderer calls `resolveDensity(intent, '/admin/queues')`.
     `'/admin/*'` matches; the effective density is `'compact'`.
  3. The route walker emits `data-cir-density="compact"` on the route's
     outermost wrapper. The host's `globals.css` declares per-attribute
     CSS variables (`--atelier-density-padding`,
     `--atelier-density-row-padding`, `--atelier-density-gap-multiplier`),
     so every descendant resolves to the compact-tier values.
  4. The `<Queue>` and `<List>` inside the route omit the `density` prop
     in their manifest entry. The walker threads `'compact'` as the
     default; both render with the tighter row-padding rhythm.
  5. The user navigates to `/onboarding/welcome`. The same profile has
     `density_overrides` that bumps `'/onboarding/*'` to `'spacious'`.
     The walker re-resolves and the outermost wrapper now carries
     `data-cir-density="spacious"`. No manifest edit; no recompile of
     the layout tree — the personalisation signal flowed through.
  6. While the queue is fetching, the resolver fallback contract slots
     in `<Skeleton shape="table-row" count=4 />`. The skeleton picks up
     the same effective density via the walker, so the loading shape
     matches the populated shape's row height — no jarring re-flow.
known_failure_modes:
  - Hand-authoring `density='compact'` on every layout primitive in the
    manifest. Drifts from intent the moment the user adjusts their
    global preference. The walker is the canonical source — manifests
    should override only via `density_overrides` (per-route).
  - Stacking density with unrelated rhythm props (e.g. setting
    `gap='sm'` on every Stack to "make it tight"). Density already
    halves the gap multiplier — stacking the two yields a UI that's
    half the rhythm the designer expected.
  - Forgetting to declare `--atelier-density-*` CSS variables in the
    host's `globals.css`. The Tailwind utility classes still work
    (`p-1 gap-1` for compact, `p-3 gap-3` for comfortable, `p-5 gap-6`
    for spacious), but non-Tailwind hosts that rely on the CSS-variable
    bridge see fall-through values. Use the `atelier init` template
    scaffold to wire the variables up correctly.
  - Mistaking density for color theming. Density compresses spacing;
    `color_mode` (light/dark) is a separate axis driven by
    `intent.global_preferences.color_mode`. Do not gate one on the
    other.
  - Applying density to surfaces that do not consume it (form fields,
    inline buttons, popovers). The walker filters by binding metadata —
    components whose binding does not declare density-awareness do not
    receive the prop. Custom bindings that want density support must
    opt in via the `Density` type in `@atelier/components`.
---

# Density-aware rendering

Wave 11 / Vis-6 promotes density from a single global preference into a
first-class personalisation surface that hosts can override per-route
without recompiling.

## Why this skill exists

Density was wired in Wave 6 / P-1 as a global signal — every density-
aware component picked up a single value from
`intent.global_preferences.density`. That works for "I prefer compact"
users, but Stripe / Linear / Supabase all ship per-surface density:
admin tables and triage queues at `compact`, onboarding and settings at
`spacious`, the rest of the app at `comfortable`.

Vis-6 closes the gap: `IntentProfile.density_overrides` is a
route-pattern glob list with per-rule density. The render walker
resolves the effective density per-route and threads it down. CSS
variables on the route wrapper let non-Tailwind hosts pick up the same
tokens without per-component plumbing.

## Composition rules

- The walker reads `resolveDensity(intent, route)` once per route render
  and threads it as the default for every density-aware component.
- Manifests SHOULD NOT override density per-node. Per-route overrides
  belong in `IntentProfile.density_overrides`.
- Components emit `data-cir-density="<value>"` so host stylesheets can
  target the per-component surface. The same attribute lands on the
  route's outermost wrapper so CSS variables resolve correctly.
- `<Skeleton>` row heights track the effective density so loading shape
  matches populated shape — no re-flow between the two.

## Failures

- Per-node density on every component (drifts from intent).
- Density stacked with manual rhythm props (double-compression).
- Missing CSS variables in `globals.css` (non-Tailwind hosts see
  fall-through values).
- Conflating density with color theming (separate axes).
- Applying density to non-density-aware components (filtered by the
  walker; custom bindings must opt in).
