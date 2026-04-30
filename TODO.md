# TODO

Tracked work that intentionally did not land. Update as items are picked up; remove when shipped.

For the historical record of what _did_ land in each phase, see [`docs/build-plan.md`](docs/build-plan.md) and the `## What's shipped` section of the root [`README.md`](README.md).

## Placeholders to replace before going public

- [ ] **Security contact** — `security@cir.dev` is a placeholder in [`SECURITY.md`](SECURITY.md). Replace with a real monitored mailbox before opening the repo to outside reporters.
- [ ] **Conduct contact** — `conduct@cir.dev` is a placeholder in [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md). Replace with a real address (or the same security mailbox if appropriate) before public launch.

## Repo metadata

- [ ] Enable branch protection on `main`: require CI green, require PR review, no force-push.
- [ ] Set up a project board / discussions / wiki preferences once the team grows beyond one.
- [ ] Widen CI Node matrix from `[22]` to `[22, 24]` once Node 24 hits LTS.
- [ ] Decide whether `actionlint` should also run on `dependabot` PRs (currently scoped to `push` + `pull_request`).

## Real work that hasn't shipped

### Vault + permissioning

- [ ] **Real intent vault backend.** The demo writes to `localStorage` under `cir.demo.intent`. The shape validates against `IntentProfileSchema`, so swap is a one-file change — but a real vault (cloud-hosted, self-hosted, or platform-held à la Solid / AT Protocol) hasn't shipped. Look for `TODO(vault):` markers in `apps/demo/lib/intent-store.ts` and the `/onboarding/*` routes.
- [ ] **Real permission grant flow.** The demo's checkbox flow gestures at scope grants but writes the grant to localStorage, not a vault. A production grant flow needs the vault first.

### Compiler / runtime hardening

- [ ] **Per-package typecheck in `packages/runtime/`** fails standalone with TS5097 (`.ts` import extensions in tests) — workspace-wide architectural choice. Resolve when the import-extension policy is revisited (also affects `@cir/schemas`, `@cir/policies`, `@cir/evals`).
- [ ] **`ManifestFetcher` does not validate the response body against the `Manifest` Zod schema.** `ManifestResolver`'s optional `validate` is the only client-side defense. Acceptable layering today; revisit when the host-vs-runtime trust boundary is finalized.
- [ ] **`IndexedDBManifestCache` casts stored values without a runtime sanity check on read.** Relies on browser SOP. Add a defensive parse on `get` if we widen the threat model to "attacker who can write to the user's IDB".
- [ ] **`ActionDispatcher` does not validate input against `capability.input`.** Host is on the hook for shape validation. Documented intentionally; revisit if the dispatcher should run a Zod-ish parse before handing off.
- [ ] **IndexedDB LRU eviction is O(n) per write.** Fine at the default cap of 200 entries; revisit with byte-accounting work.
- [ ] **Sign capabilities/skills artifacts at publish time** per [`docs/production-concerns.md`](docs/production-concerns.md) — needs a key-management decision.

### Detector + adapter scaffolding

- [ ] **Behavioral pattern detector implementations.** The `BehavioralPatternDetector` interface and `NoopBehavioralDetector` ship; no real detector heuristics ship.
- [ ] **Live-query subscriptions.** SWR + optimistic UI cover the common cases today; live subscriptions are future work.
- [ ] **Cross-app workflow compilation.** Single-app compile is shipped; "Gmail + Calendar + Linear in one lens" needs a neutral compiler host. See [`docs/open-questions.md`](docs/open-questions.md) §1.

### Tooling + observability

- [ ] **Audit endpoint in the demo.** `cir dev --tail` and the `@cir/react/debug` panel both speak the `/api/cir/audit/stream` SSE contract, but the demo doesn't yet expose the endpoint. Demos opt in by implementing the endpoint; spec is in [`packages/cli/README.md`](packages/cli/README.md) §"`cir dev --tail`". Until a demo wires it, the tail CLI is a contract-only surface.
- [ ] **`@cir/react/debug` host-side experience.** The subpath export is wired and the panel renders; the end-to-end developer experience (drop into a fresh Next.js app, see live events) hasn't been smoke-tested outside the monorepo.
- [ ] **`cir init` standalone-publish hardening.** Today `cir init` and `cir components-sync` assume the CIR monorepo layout. npm-installable templates and host-project pre-flight are roadmap.
- [ ] **Vite support in `cir init`.** Hardcoded to Next.js 15 today.
- [ ] **`cir validate` host pre-flight.** Today it shells out to `pnpm validate` blindly.
- [ ] **Eval harness wired into `pnpm validate`.** Will flip on once enough scenarios are load-bearing.

### Marketplace + ecosystem

- [ ] **Marketplace for community recipes.** [`docs/build-plan.md`](docs/build-plan.md) Phase 5 territory. Needs governance per [`docs/open-questions.md`](docs/open-questions.md) §4.
- [ ] **Mobile + native render runtimes** (iOS SwiftUI, Android Compose). Manifests are JSON; the work is in registering native components against the schema.
- [ ] **Additional demo apps.** `apps/demo-dummyjson` (lens-switching showcase) and `apps/demo-github` (real-mutations showcase) were scoped on the original plan; today the dummyjson + github capabilities ship in `capabilities/` but a dedicated demo app per domain has not.

### Component-variants follow-up (P-10 second pass)

- [ ] **Variants for the remaining 32 components.** Wave 6 / P-10 first pass landed `variant` (and `size` where applicable) on the 24 most-impactful primitives — layout containers, display leaves, action triggers, and the four specialized components (`List`, `Table`, `KPIRow`, `DetailView`). The remaining 32 (inputs, charts, navigation, command-palette, etc.) still need variant tables. Pick up by extending `packages/components/src/components/_variants.ts` with new tables, propagating `data-variant` + `className`, and adding ~3 tests per component. (Tracked also as Vis-4 in Wave 11.)
- [ ] **Component-variants demo / Storybook.** No Storybook in this pass; manifest authoring exercises variants via recipes (see e.g. `recipes/github-reviewer.json` Container `variant=tinted` + Search `variant=embedded`). A dedicated visual gallery (Storybook or a custom MDX route in `apps/demo`) is roadmap.

---

## Phase 6+ roadmap

The framework today produces functional UIs. The roadmap below is what's needed to produce **personalised, polished, production-scale** UIs — plus the missing vault / multi-tenant / marketplace work that production hosting needs.

### Wave 7 — depends on Wave 6 (in flight)

- [ ] **V-1** — Real intent vault backend (`@cir/vault-server` + `@cir/vault-client`). Depends on V-2. 2–3 wk.
- [ ] **P-3** — Refinement loop (right-click any component → describe tweak → diff-compile → manifest update + new scoped intent rule). Depends on P-1. 1.5 wk.
- [ ] **P-4** — Engagement signals back into compiler (component.viewed / dismissed / bounced + per-user aggregator). 1 wk.
- [ ] **P-7** — Motion / view-transitions / animation layer (foundation for Wave 12 Int-1). 1.5 wk.
- [ ] **P-8** — Empty / loading / error promoted to first-class composition policy. 3 d.
- [ ] **P-9** — Information hierarchy (capability `salience_default`, intent `priority_rules`, skills). 1 wk.

### Wave 8 — depends on Wave 7

- [ ] **V-3** — Permission grant UI against the real vault. Depends on V-1. 1 wk.
- [ ] **V-6** — Marketplace primitives (`cir://author/persona@version` addressing, ed25519 signing, TOFU trust model, review flow). Depends on V-1 + V-4. 4–6 wk.
- [ ] **DD** — Full personalisation chain integration eval.

### Wave 10 — scale tracks

The framework today handles single-app, ≤200-capability registries with low-cardinality data fine. Past those limits, these tracks fix the failure modes:

- [ ] **S-1 — Capability scoping (two-stage compile).** Without this, registries past ~200 capabilities don't fit the prompt budget. Two-stage approach: tiny model picks 30 relevant ids from 1-line summaries; full Pro model gets the 30 full schemas. New package `@cir/capability-resolver`. **2 wk. HIGH.**
- [ ] **S-2 — Virtualized List/Table + cursor pagination on `DataResolver`.** Without this, components rendering >500-item lists OOM the browser. `<VirtualList>` + `<VirtualTable>` (under `react-virtuoso` or `@tanstack/react-virtual`) + composition rule that forces virtualized variant when capability cardinality exceeds threshold + cursor protocol on the resolver. **2–3 wk. HIGH.**
- [ ] **S-3 — Streaming subscriptions on `DataResolver`.** `resolver.subscribe(binding)` returns `AsyncIterable<T>` for live data. **1.5 wk. MEDIUM.**
- [ ] **S-4 — Distributed `TriggerBus` (`RedisTriggerBus` primary, `NATSTriggerBus` optional).** Required when invalidations need to cross processes. Existing `TriggerBus` interface is the seam. **1–2 wk. HIGH for multi-region.**
- [ ] **S-5 — Hierarchical capability registry + generated index + incremental validation.** Allow nested paths + auto-generated `_index.json` summarising ids/versions/paths + CI re-validates only changed files (via `git diff`). **1 wk. MEDIUM.**
- [ ] **S-6 — Compile cost budget enforcement.** Optional `compile_budget: { max_tokens_per_day, max_calls_per_hour }` on intent profile or BrandKit. `CompositeCompiler` wraps each child with a budget meter. **3–5 d. HIGH** (predictable cost matters from day one of any commercial deployment).
- [ ] **S-7 — Capability vector embeddings (RAG variant of S-1).** Higher-quality scoping when registries grow past ~1000 capabilities. **3 wk. LOWER** — defer until S-1's quality ceiling is hit in practice.

**Recommended order for "real-app scale":** S-6 (cheap, immediate) → S-1 → S-2 → S-5 → S-4 → S-3 → S-7.

### Wave 11 — visual depth (path to Linear/Supabase-grade UI)

CIR today produces competent, on-brand professional UIs. Reaching the perceived quality of best-in-class web apps (Linear, Supabase) requires another ~3 waves of additive work — none of it re-architects, but each track adds a polish dimension.

- [ ] **Vis-1 — Typography depth.** Extend `BrandTokensSchema` with `letter_spacing` scale, `line_height` scale, OpenType feature settings (tabular numerals, ligatures, optical sizing). Tailwind config bridges to CSS. **1 wk.**
- [ ] **Vis-2 — Dark mode as a real surface across all 56 components.** Today only `data-color-mode` is mirrored on `<html>`. Need every component to ship paired dark/light Tailwind class variants and pair-tested screenshots. **1.5 wk.**
- [ ] **Vis-3 — Icon resolver + `<Icon>` component.** `iconography.allowed_sets` declares which packs are allowed; need a real `<Icon set="lucide" name="archive" />` resolver layer + integration so components like `<Button icon="archive">` work without authoring per-component icon props. **1 wk.**
- [ ] **Vis-4 — Variant pass for the remaining 32 components.** Wave 6 P-10 covered 24/56. The other 32 (inputs, charts, navigation primitives, niche specialised) need the same `variant` + `size` treatment for visual consistency. **2 wk.**
- [ ] **Vis-5 — Custom illustration support.** `<EmptyState>` ships as text + button. Linear-grade empty states use mascots, custom artwork, situation-specific tone. Need an illustration registry + `<EmptyState illustration="inbox-zero">` integration. Asset work + render plumbing. **2 wk.**

### Wave 12 — interaction depth

- [ ] **Int-1 — Motion layer extension** beyond Wave 7 P-7. Per-component entry/exit animations (modal slide-in, list stagger), data-update animations (row shimmer on update, badge pulse on increment), respect `motion.duration_scale` from BrandKit. **2 wk on top of P-7.**
- [ ] **Int-2 — `<Tooltip>` primitive with proper timing.** 400ms delay, 8px offset, smart re-positioning, fade in 100ms. The `tooltip-tone` skill exists but no primitive backs it. **3 d.**
- [ ] **Int-3 — Global keyboard registry + Cmd+K everywhere.** New `@cir/keyboard` package, `<CommandPalette>` integrates, every action gets a registered shortcut, hint chips render on first-use. **2 wk.**
- [ ] **Int-4 — Optimistic UI wired by default.** `useOptimisticAction` exists; today it's opt-in. Make it the default for any reversible+low-stakes action (capability declares both flags). **3 d.**
- [ ] **Int-5 — Onboarding microinteractions.** Product-tour highlight chips, completion progress, contextual "you're done" celebrations. New `<TourStep>` primitive + skill. **1.5 wk.**

### Wave 13 — content depth

- [ ] **Cnt-1 — Code rendering at depth.** Syntax highlighting (Shiki or Starry-Night), fold, line references, inline comments. `<CodeView>` exists; today it's a `<pre>` with a class. **2 wk.**
- [ ] **Cnt-2 — Diff rendering** (Linear/GitHub-style). `<DiffView>` exists; needs proper hunks, syntax-highlighted diff, side-by-side and unified modes. **1.5 wk.**
- [ ] **Cnt-3 — Mention / @user / #issue / link auto-resolution.** Pluggable resolver protocol (per-app dictionary), inline rendering with hover-cards. **2 wk.**
- [ ] **Cnt-4 — Embed system.** Link previews, video embeds, code embeds with detection + appropriate render. **2 wk.**
- [ ] **Cnt-5 — Markdown at Linear quality.** Tighter spacing, properly themed, custom renderers per element type, integration with mentions/embeds above. **1 wk on top of Cnt-3 + Cnt-4.**

**Realistic budget for Linear/Supabase parity:** Waves 11+12+13 ≈ **3-6 months of focused work** on top of Waves 7-10. Each track is bounded and additive. Most of the perceived-quality gap closes by **adding more skills + brand-kit depth** rather than writing more TypeScript — but the visual-system work (variants, dark mode, icons, illustrations) requires real implementation.

### Phase 7+ — multi-platform + marketing (kept on the roadmap; not on the personalised-web critical path)

- [ ] **N-1** — iOS SwiftUI native renderer. 4–6 wk.
- [ ] **N-2** — Android Jetpack Compose native renderer. 4–6 wk.
- [ ] **N-3** — React Native bindings (cheaper bridge — share more with `@cir/react`). 2–3 wk.
- [ ] **N-4** — Marketing site / public docs. Astro or similar, GitHub Pages. 1–2 wk.
- [ ] **N-5** — Cross-platform component variant authoring (one source → web + native). 2 wk.

### Operational findings from Wave 6 fan-out

- [ ] **JSON Schema export sanity check.** `pnpm schemas:dump` regenerates `.well-known/schemas/*.json` from Zod via `toJsonSchema`. Default output sometimes uses formats AJV strict mode rejects (e.g. `exclusiveMinimum: <number>` instead of boolean+minimum). Add a CI step that loads each generated schema through AJV strict and fails on rejection.
- [ ] **Worktree isolation for parallel agents.** Wave 6 ran 13 agents against a shared tree; cross-track lint / typecheck / test contamination required manual reconciliation at commit time. Future multi-agent waves should use `git worktree add` so each agent works on an isolated copy.
- [ ] **Skill markdown YAML strictness.** A few skill files in Wave 6 shipped briefly with malformed YAML frontmatter. `parseSkillMarkdown` could surface a clearer error message; `cir lint skill <path>` could front-run validation.
- [ ] **`BehaviorPatternDetectedTrigger` schema variant.** V-4 ships `SequenceDetector` emitting `behavior.workaround_detected` because `behavior.pattern_detected` doesn't exist yet in `TriggerSchema`. These are different concepts — promote-to-recipe should not fire on workarounds. Add the new variant in the consolidation pass.
