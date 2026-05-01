# CIR Ethos — what every implementation and demo must honor

> **CIR's core thesis**: a UI's _layout_ is a runtime artifact. A compiler
> takes a recipe (declarative app description), the user's intent profile,
> and the granted capabilities, and produces a manifest tree. The runtime
> walks the tree against a registered binding catalog. Policies validate
> the tree before render. **The human authors recipes; the LLM authors
> manifests.**
>
> Anything that contradicts this thesis — no matter how clean it looks — is
> drift, and should be flagged in review.

This document is the north star. Every PR that touches `apps/**` or the
compiler / runtime / policy stack should be checked against the principles
below. If it violates one and there's a defensible reason, the reason
goes in the commit body.

---

## The eleven principles

### 1. Dynamic over static

UI is composed at runtime by the compiler, not authored as static React
pages. Hand-written manifests exist only as **fallbacks** for offline /
no-API-key scenarios. They must never be the primary rendering path in a
demo that purports to showcase CIR.

A demo that renders the same DOM whether the LLM ran or not is **not
demonstrating CIR**.

### 2. Composition, not invention

The LLM picks from a catalog of registered `ComponentBinding`s. Custom
bindings (e.g. `IssueQueue`, `ProductCard`) are vocabulary the LLM has
access to — they're not pre-baked layouts. The LLM never writes React.

Adding a new binding means: (a) registering the factory, (b) adding it to
the catalog summary handed to the compiler, (c) describing it in the
catalog so the compiler knows when to pick it.

### 3. Intent reshapes, not just decorates

Different intent profiles must produce **structurally different**
manifests. Lens density isn't a CSS toggle — it triggers a recompile that
swaps `<Grid columns=3>` for `<List>` for `<Grid columns=2 large>`.
Vocabulary swaps reshape labels everywhere. Accessibility flags can swap
component IDs entirely.

A lens switch that changes only CSS is **not exercising the runtime**.

### 4. Policies enforce, not document

Every policy must enforce against the rendered manifest tree, not against
orphaned lists or test-only structures. Off-screen "policy anchor" hacks
(invisible Buttons added so the policy walker passes) are technical debt.
Ambient runtime services (`UndoToast`, `RateLimitChip`) that satisfy
obligations should declare _which_ obligations they satisfy and let the
validator see them.

A policy that only fires in tests is **not a policy** — it's a unit test.

### 5. Visible compilation

Demos must make the dynamic-UI thesis _observable_. Token counters tick.
Compile time shows. Cache invalidation is visible to the user. A lens
switch demonstrably triggers a recompile. The framework's machinery is
not hidden by smooth UX — it's celebrated by it.

If a viewer can't tell the LLM ran, the demo failed.

### 6. Recipe is the source

Every demo persona has a recipe file (`recipes/<name>.json`) declaring:

- the persona's **intent surfaces** (lens, vocabulary, density)
- the **granted capabilities** the user has consented to
- the **candidate skills** the compiler may compose
- the **policy obligations** the manifest must satisfy

The recipe is what humans author and review. The manifest is what the LLM
produces. **Manifest authoring by humans is a smell.**

### 7. Schema-validated contracts

Manifest props are validated against component contracts at the schema
layer (`packages/schemas`). Renderers don't defend against malformed
manifests with `?? []` defaults; the schema layer rejects them upstream.

Defensive component code is forgiveness for an enforcement gap.

### 8. Capability dispatch is first-class

Components declare their action slots (`onPrimaryAction`,
`onSecondaryAction`, etc.) in binding metadata. The renderer maps
`node.actions[i]` to the declared slot. No bespoke per-component
"capability prop filter" defenses. The component never sees a function
prop named `'app.cart.add'`.

### 9. Resolver supplies fallbacks

Empty / loading / error states come from the resolver pipeline by
default. Components render the supplied state slot if present, else the
resolver's default. Manifests opt _out_ ("show nothing instead of an
empty state"), not _in_ ("here's the empty state to use, here's the
loading state, here's the error state, copy/pasted across every binding").

### 10. Demos are existence proofs

Every demo must demonstrate something **only CIR can do**:
intent-driven recompile, policy-validated dynamic layout, ambient
capability dispatch with rollback, etc. If a demo could be implemented
as a static React app with the same UX, it does not belong as a CIR
demo.

### 11. The marketplace is the product; custom bindings are a last resort

The framework's promise is "give the LLM a rich enough primitive
marketplace and it will compose any domain UI." That promise is only
real if hosts can ship apps **without** writing per-host React for every
domain shape. Each per-host `ComponentBinding` registered on top of
`@cir/components`'s `COMPONENT_BINDINGS` is a local escape hatch — a
place where the host has decided the LLM cannot be trusted to compose
the shape from primitives.

Most "custom bindings" are smell:

- **Duplicates of baseline.** A `RepoTable` that wraps `<Table>` with
  the same columns. A `RateLimitStatusBar` that wraps `<StatusBar>`. A
  `ThreadView` that wraps `<ChatThread>`. Delete and use the baseline.
- **Header / chrome.** `OctantHeader` / `MarigoldHeader` / `Wordmark`
  are usually just `<Stack(Logo, NavBar, StatusBar)>`. Compose, don't
  author.
- **Domain shapes that the marketplace doesn't yet cover.** Inbox /
  task / issue queues, product cards, conversation lists. The right
  response is **promote the shape to baseline**, not entrench another
  per-host binding. `Queue` and `Logo` were promoted in the marketplace
  pivot exactly to collapse the inbox / task / wordmark patterns.

The remaining defensible reasons for a custom binding:

- **A genuine invariant the LLM cannot reliably hold** (e.g. "every
  issue row MUST carry a hover-card author preview wired to the
  presence service"). Even then, examine whether a `compositionRole` +
  a slot contract would express the same constraint without inventing
  a component.
- **A capability that has no baseline analogue at all** (rare; usually
  means a missing primitive).

The `tests/marketplace-pressure.test.ts` gate caps each demo's custom
binding count and ratchets it down. Every entry is documented as a
known follow-up. Adding a new binding without first attempting (a) a
baseline promotion or (b) a composition fails the gate. Lowering the
ceiling by deleting a binding is the only way to grow the marketplace.

A demo's custom-binding count is the single best smell test for whether
the framework's marketplace promise is being kept. **Aurora ships zero.**
Octant and Marigold are on the migration plan to follow.

---

## How to use this document in review

When opening a PR that touches `apps/**`, the compiler, or the policy
stack, the description should answer:

- **Which principles does this PR honor?**
- **Which does it violate, and why?** (Pragmatic violations are fine —
  unflagged ones aren't.)
- **What follow-up brings the violations back into compliance?**

When reviewing: scan the screenshots and the commit body. If a screenshot
shows a manifest pipeline result that's indistinguishable from a static
React app, the PR is failing principle 1 or 5 even if every test passes.

---

## What "true to ethos" looks like, concretely

A correctly-shipped demo route does **all** of:

1. Loads `<CirRoute path="/foo" />`.
2. The resolver hits a cache miss for the user's intent.
3. The Gemini compiler runs against the recipe + intent + catalog and
   emits a manifest. **Token counter ticks.**
4. The manifest is validated by `BASELINE_POLICIES + COMPOSITION_RULES`.
5. The renderer walks the tree, resolving every component ID through the
   binding registry — including custom bindings whose factories the LLM
   knew about because they were in the catalog summary.
6. The user changes lens density at `/settings/lens`. The intent
   versionbumps. The resolver invalidates cached manifests for that
   intent. **The compiler runs again.** The new manifest references
   different components / different `columns` / different `density`. The
   layout reshapes _visibly_.
7. The user performs a reversible action. An ambient `<UndoToast>` —
   declared by the runtime service to satisfy `reversibility_surfaced` —
   renders without a manifest node for it. The action is optimistic; the
   user can undo within 5 seconds; the policy validator was satisfied
   without any "off-screen anchor" kludge.

A demo missing any of those steps is shipping a piece of plumbing
disguised as a showcase.

---

## Maintenance

Add to this list when you discover a new pattern that's at-odds with the
thesis. Don't dilute it. The principles should stay falsifiable.

Last touched: 2026-05-02 (Marketplace pivot — `<Queue>` and `<Logo>`
promoted to baseline; principle #11 added).
