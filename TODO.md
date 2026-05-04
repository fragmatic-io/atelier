# TODO

> Single source of truth for what's planned vs what's shipped. Updated 2026-05-04 (P0 + P1 + P2 + P3 closeout; resuming tomorrow on P4 / P5 / P6 + ops follow-ups).
>
> Historical record of phases that landed: [`docs/build-plan.md`](docs/build-plan.md) and the `## What's shipped` section of the root [`README.md`](README.md).

---

## Reading guide

**Priority is stability over expansion.** The order below is what to ship next, not what's most exciting. Within a band, items are in execution order (top first).

| Band   | Bucket                                                          | What it's for                                          | Time-box       |
| ------ | --------------------------------------------------------------- | ------------------------------------------------------ | -------------- |
| **P0** | [Stability & op-debt](#p0--stability--op-debt)                  | Velocity-killers — fix before adding more surface      | ~½ d remaining |
| **P1** | [Compile quality](#p1--compile-quality)                         | Compile correctness, scope, retrieval, distributed bus | ~3 d remaining |
| **P2** | [Marketplace completion (V-6)](#p2--marketplace-completion-v-6) | Vault-marketplace distribution channel                 | ✅ shipped     |
| **P3** | [Site consolidation](#p3--site-consolidation--branding)         | Single docs site at `/atelier/`                        | ✅ shipped     |
| **P4** | [Wave 11 polish remaining](#p4--wave-11-polish-remaining)       | Vis / Int / Cnt / Nav / Coll / AI long tail            | 4-6 mo         |
| **P5** | [Personalisation continuity](#p5--personalisation-continuity)   | P-3 / P-4 / P-7 finishing                              | 3 wk           |
| **P6** | [Multi-platform & long tail](#p6--multi-platform--long-tail)    | iOS / Android / RN / cross-platform variants / open Qs | 12-16 wk       |

> **Naming note (marketplace).** Two distinct things in this codebase share the word "marketplace":
>
> - **The catalog** — the set of baseline primitives `@atelier/components` ships, plus the recipes / brand kits / skills built on top. This is the _product_. The Wave M architectural pivot was about the catalog. Codified as ETHOS principle #11 ("baseline-first").
> - **The vault marketplace** — the distribution channel (`atelier://author/persona@version`, ed25519 signing, TOFU). The technical infrastructure that lets the catalog reach hosts. This is **V-6** in Wave 8.
>
> When we say "marketplace" alone we mean the distribution channel.

---

## At a glance

| Wave    | Scope                                                                                 | Status                                    |
| ------- | ------------------------------------------------------------------------------------- | ----------------------------------------- |
| **M**   | Baseline-first pivot — catalog 62 → 83; 3 demos at zero customs; ETHOS #11; eval gate | ✅ shipped                                |
| **R**   | Release blockers — public-facing mailbox placeholders + repo metadata                 | 🟡 partial — branch protection still TODO |
| **C**   | Compiler evolution — C-1 / C-2 / C-3 / C-4 / C-5 ✅                                   | ✅ shipped (all 5 phases)                 |
| **7**   | Personalisation — P-1 / P-8 / P-9 / DD ✅; P-3 / P-4 / P-7 remain                     | 🟡 in flight                              |
| **10**  | Scale — S-1 / S-2 / S-3 / S-4 / S-5 / S-6 / S-7 ✅                                    | ✅ shipped (all 7 phases)                 |
| **8**   | Vault marketplace — V-1 / V-3 / V-6.a / V-6.b / V-6.c / V-6.d / V-6.e / V-6.f ✅      | ✅ shipped (full V-6)                     |
| **11**  | Visual depth — 18 items shipped this session (catalog 65 → 83); long tail remains     | 🟡 partial                                |
| **12+** | Multi-platform — N-4 ✅; N-1 / N-2 / N-3 / N-5 remain                                 | 🟡 partial                                |
| **Op**  | Operational + hardening debt                                                          | 📅 see P0                                 |

**This session's scoreboard** — Wave 8 / 10 / C all closed. Site merged + deployed at `/atelier/`. Baseline-first nomenclature codified. Lint-staged worktree-stash leak fixed. AJV strict gate in CI. Runtime Zod hardening. Skill YAML strictness with `atelier lint skill`. Catalog 65 → 83. Test count ~3400 → 3606.

**Recent commits** (most recent first):

`71e97fa` V-6.e nightly eval gate · `dfcb944` V-6.d review/curation flow · `1880415` S-4 distributed TriggerBus · `544bd67` V-6.a/b/f publish + consume + sign · `b6aa5b8` C-5 recipe RAG · `3f51e3c` dependabot policy tightening · `d73c5c8` C-3/S-1 capability scoping · `61834f1` V-6.c MarketplaceBrowser · `07cf04d` test-fixture compliance · `6d1bbad` 4 pre-existing failures fixed · `6829018` skill YAML + lint CLI · `3b87f4d` site consistency sweep · `f749361` MDX format · `a82ce2c` AJV strict gate · `240cede` runtime Zod hardening · `dc70a44` site merge · `9a9e02e` marketplace nomenclature + replan.

---

## P0 — Stability & op-debt

**Mostly done.** Two manual repo-owner items remain.

### P0 closeout (this session)

- [x] **P0.1** — quarantine 4 pre-existing test failures + fix `use-optimistic-action.test.tsx` TS errors. `6d1bbad` + `07cf04d`.
- [x] **P0.2 (lint-staged half)** — `lint-staged --no-stash` in `.husky/pre-commit`. Sibling-worktree stash leaks resolved. `dc70a44`.
- [ ] **P0.2 (pre-push half)** — `pre-push` runs full-monorepo `validate:fast` (~60 s × N agents). Move to a per-package gate or staged-only. **<1 d.** _Open._
- [x] **P0.4** — marketplace nomenclature disambiguated; ETHOS #11 retitled "Baseline-first: the catalog is the product"; glossary box added. `9a9e02e`.
- [x] **P0.5a** — runtime Zod-validates manifest fetch + IDB cache reads + dispatcher input. `240cede`.
- [x] **P0.5b** — AJV strict-mode CI gate + format-strip in JSON-Schema codegen. `a82ce2c`.
- [x] **P0.5c** — better YAML errors in `parseSkillMarkdown` + `atelier lint skill <path>` CLI. `6829018`.
- [x] **P0.6** — dependabot policy: dropped `commit-message.include: scope` (commitlint compatibility) + ignored major bumps on github-actions. 4 stale PRs closed. `3f51e3c`.

### P0 still open

- [ ] **Branch protection on `main`** — require CI green, require PR review (1 reviewer), no force-push. _Repo-owner action via `gh repo edit` or Settings UI._
- [ ] **Project board / discussions / wiki** — enable once team grows beyond one. _Repo-owner action._

### P0 follow-ups discovered

- [ ] **`gray-matter@4.0.3` cache bug.** `matter()` populates the cache _before_ invoking the YAML engine, so a thrown YAMLException leaves an empty `{ data: {} }` entry that masks the error on subsequent calls. Worked around in P0.5c with `{ }` options bag. Worth either upstreaming a fix or migrating off gray-matter to a maintained alternative. **<1 d.**

---

## P1 — Compile quality

**Mostly done.** One small follow-up bucket remains.

### P1 closeout (this session)

- [x] **P1.1 / C-3 / S-1** — two-stage compile via capability scoping. New `@atelier/capability-resolver` package; `CompileInput.capabilityResolver` + `topN` (default 30); `findCapability` routes through resolver while `lookupCapability` / `listCapabilities` keep broaden-by-id escape hatch. `d73c5c8`.
- [x] **P1.2 / C-5** — recipe RAG. New `@atelier/recipe-resolver` package; substring + embedding resolvers; compiler `findRecipe` tool with `slimRecipe` projection. `b6aa5b8`.
- [x] **P1.3 / S-4** — distributed `TriggerBus` via pluggable `TriggerTransport`. `InMemoryTriggerTransport` + `SseTriggerTransport` reference impls + Node HTTP coordinator; loop prevention via `originNodeId`. `1880415`.

### P1.4 — plumbing follow-ups (open)

- [ ] **`BehaviorPatternDetectedTrigger` schema variant.** V-4 emits `behavior.workaround_detected`; we also want a non-workaround `behavior.pattern_detected` so promote-to-recipe doesn't fire on pure-workaround sequences. **<1 d.**
- [ ] **Behavioral pattern detector implementations.** `BehavioralPatternDetector` interface + `NoopBehavioralDetector` ship; no real heuristics. **2-3 d.**
- [ ] **Cross-app workflow compilation.** Single-app compile is shipped; "Gmail + Calendar + Linear in one lens" needs a neutral compiler host. See [`docs/open-questions.md`](docs/open-questions.md) §1. **1-2 wk.**

---

## P2 — Marketplace completion (V-6)

**Wave 8 vault marketplace 100% shipped.** End-to-end pipeline: author signs → publishes → maintainer reviews → consumer browses → compiler retrieves via RAG → nightly eval gate proves the top-N still compile.

- [x] **V-1** — `MarketplaceAddress` + `SignedBundle` schemas + ed25519 signing. (Pre-session.)
- [x] **V-3** — TOFU verification. (Pre-session.)
- [x] **V-6.a** — `POST /marketplace/persona` (publish). `544bd67`.
- [x] **V-6.b** — `GET /marketplace/persona/<a>/<p>@<v>` + `/latest` (consume). `544bd67`.
- [x] **V-6.c** — `<MarketplaceBrowser>` baseline component. `61834f1`.
- [x] **V-6.d** — review / curation flow. `dfcb944`.
- [x] **V-6.e** — nightly eval gate via `@atelier/eval-marketplace` + GitHub Actions cron. `71e97fa`.
- [x] **V-6.f** — sign-at-publish via `publishPersona` + `atelier marketplace publish` CLI. `544bd67`.

### Marketplace follow-ups (optional, low priority)

- [ ] **Live marketplace browse on the docs site.** Once the public vault is hosted (or a static JSON snapshot is exported), embed `<MarketplaceBrowser>` on a new `/atelier/marketplace/browse/` page so visitors can see real personas without running their own host. **~1 d** plus hosting decision.
- [ ] **Telemetry-based ranking for V-6.e.** Default rank is currently alphabetical-on-canonical-address; flip to download-count once V-6.d telemetry accrues. **<1 d.**

---

## P3 — Site consolidation & branding

**Done.** Marketing folded into `apps/docs` as Starlight splash pages. Single Pages domain at `https://fragmatic-io.github.io/atelier/`.

- [x] **P3.1 — Marketing → Starlight splash pages.** `dc70a44`. `apps/marketing/` retired. URL flipped from `/atelier/docs/` to `/atelier/`. Rehype plugin auto-prefixes root-relative MDX links via `DOCS_BASE`. Four hardcoded JSX `LinkCard href` + hero `actions[].link` in the homepage updated by hand.
- [x] **P3 consistency sweep** — `/start/`, `/architecture/`, `/demos/` demoted from `template: splash` to default docs layout (only `/index.mdx` is splash); stale `/atelier/docs/` URL refs scrubbed; `seti:` file-icons swapped for line-style; sidebar catalog count delocalised. `3b87f4d` + `f749361`.

### P3 follow-ups

- [ ] **Custom domain.** Once we own `atelier.dev` (or similar), drop the `/atelier/` path-prefix entirely — the `DOCS_BASE` env var handles that. Hardcoded `/atelier/...` in 4 JSX/YAML hrefs in `index.mdx` would need to revert to `/...`. **<1 d** + DNS work.

---

## P4 — Wave 11 polish remaining

The long tail of visual / interaction / content / nav / collaboration / AI primitives. Sequence within each sub-bucket is execution order; sub-buckets are independent.

### P4.1 — Vis (visual depth)

- [x] Vis-2, Vis-3, Vis-5, Vis-8 shipped (this + prior sessions).
- [ ] **Vis-4** — Variant pass for the remaining 32 components (after Wave 6 P-10 covered 24/56). **~1.5 wk.**
- [ ] **Vis-7** — Elevation / surface system (5-step elevation token scale resting / hover / popover / modal / commandbar with paired light/dark shadow recipes). **3 d on top of Vis-2.**
- [ ] **Vis-9, Vis-10** — Open visual-debt items (consult original list).

### P4.2 — Int (interaction)

- [x] Int-2, Int-3, Int-4, Int-5, Int-10, Int-11, Int-13, Int-14 shipped.
- [ ] **Int-1** — Motion layer extension beyond P-7 (per-component entry/exit, data-update animations). **2 wk on top of P-7.**
- [ ] **Int-6** — Quick-switcher (`Cmd+P`) distinct from command palette; capability-typed `quickswitch_index` per app. Depends on Int-3. **1 wk.**
- [ ] **Int-7** — Chord shortcuts + per-user aliases (`g i`, `g a`); chord state machine + per-user alias overlay in the intent vault. Depends on Int-3. **1 wk.**
- [ ] **Int-15** — Smart paste with link unfurl. Cnt-4 ✅ unblocked. **1.5 wk.**

### P4.3 — Cnt (content)

- [x] Cnt-1..5, Cnt-7..11 shipped.
- [ ] **Cnt-6** — Audit + close (BlockKindRegistry shipped via Cnt-7; check whether anything remains). **<1 d audit.**

### P4.4 — Nav (navigation)

- [x] Nav-4, Nav-5, Nav-6 shipped.
- [ ] **Nav-1** — Navigation rail / app shell upgrade (left rail with collapsible sections, persistence already shipped via Nav-2). **1 wk.**

### P4.5 — Coll (collaboration; S-3 + S-4 ✅ unblocked the whole bucket)

- [ ] **Coll-1** — Multiplayer presence indicators. `<Presence>` primitive backed by a `presence.subscribe` capability. **1.5 wk.**
- [ ] **Coll-2** — Live cursors on canvas / list / doc surfaces. Depends on Coll-1. **2 wk.**
- [ ] **Coll-3** — Threaded comments anchored to content. `comment_anchor` schema + `<CommentThread>`. Depends on Cnt-3. **2.5 wk.**
- [ ] **Coll-4** — Real-time follow-mode / observe-mode. Depends on Coll-1. **2 wk.**
- [ ] **Coll-5** — Selection halos for collaborative selection. Depends on Coll-1. **1 wk.**

### P4.6 — AI (inline AI surfaces)

- [x] AI-1, AI-3 shipped.
- [ ] **AI-2** — Slash-command AI shortcuts in editors. `/summarize` / `/translate` / `/brainstorm` inside the slash menu (Cnt-6). Depends on AI-1. **1 wk.**
- [ ] **AI-4** — Inline AI chat docked to surface. Raycast-style chat with read-context of the current capability bindings. **2 wk.**

---

## P5 — Personalisation continuity

P-1 / P-8 / P-9 / DD shipped; the remainder.

- [ ] **P-3** — Refinement loop (right-click any component → describe tweak → diff-compile → manifest update + new scoped intent rule). Depends on P-1 (✅). **1.5 wk.**
- [ ] **P-4** — Engagement signals back into the compiler (component.viewed / dismissed / bounced + per-user aggregator). **1 wk.**
- [ ] **P-7** — Motion / view-transitions / animation layer (foundation for Int-1). **1.5 wk.**

---

## P6 — Multi-platform & long tail

Last band — only after P0–P5 settle.

### P6.1 — Native renderers

- [ ] **N-1** — iOS SwiftUI native renderer. **4-6 wk.**
- [ ] **N-2** — Android Jetpack Compose native renderer. **4-6 wk.**
- [ ] **N-3** — React Native bindings (cheaper bridge — share more with `@atelier/react`). **2-3 wk.**
- [ ] **N-5** — Cross-platform component variant authoring (one source → web + native). **2 wk.**

### P6.2 — Tooling polish

- [ ] **`atelier init` standalone-publish hardening.** Today assumes the Atelier monorepo layout. npm-installable templates and host-project pre-flight are roadmap.
- [ ] **Vite support in `atelier init`.** Hardcoded to Next.js 15 today.
- [ ] **`atelier validate` host pre-flight.** Today shells out to `pnpm validate` blindly.
- [ ] **Eval harness wired into `pnpm validate`.** Will flip on once enough scenarios are load-bearing.
- [ ] **`@atelier/react/debug` host-side smoke test.** Subpath export wired; end-to-end developer experience hasn't been smoke-tested outside the monorepo.
- [ ] **Component-variants demo / Storybook.** A dedicated visual gallery (Storybook or a custom MDX route) is roadmap — should compose with future custom-domain work if it lands.
- [ ] **IndexedDB LRU eviction is O(n) per write.** Fine at the default cap of 200; revisit with byte-accounting work.

---

## What's shipped — historical record

For full prose-form context on every landed item see commit messages and `docs/build-plan.md`.

### Wave M — Baseline-first pivot (closed, 2026-05-02 session)

12 commits. ETHOS principle #11 codified ("Baseline-first: the catalog is the product"). Three demos ship zero custom bindings. Catalog promotions: `<Queue>` + `<Logo>` + `<MetaBadge>` + data-aware `<Grid>` + tile-shaped `<Card>` + data-aware `<Gallery>` + per-item `emphasis` flag. Adjacent tracks: P-8 + S-6.

### Wave 11 — shipped this session (catalog 65 → 83, +18)

Vis-5 (illustrations) `d9789cc` · Vis-8 (skeleton-as-shape) `0bf58fa` · Cnt-10 (saved views) `f410775` · Cnt-11 (autosave + version history) `6443904` · Int-10 (DropZone) `448b170` · Int-5 (TourStep + TourProgress + Confetti) `fc5aa32` · Int-14 (Lightbox + Image) `23d90f3` · Nav-6 (FilterQueryBar) + AI-1 (SelectionActionBar) `0504090` · AI-3 (GenerativeLayout) `4f02ea6` · V-6.c (MarketplaceBrowser) `61834f1`.

Plus prior session: Vis-2, Int-2, Int-3, Int-4, Int-11, Int-13, Cnt-1, Cnt-2, Cnt-3, Cnt-4, Cnt-5, Cnt-8, Cnt-9, Nav-4, Nav-5.

### Compiler — Wave C (closed, all 5 phases shipped)

- ✅ **C-1** — Validation feedback loop (`497e99d`). `ValidationFeedbackCompiler`.
- ✅ **C-2** — Tool-using compiler. 9 tools.
- ✅ **C-3** — Capability scoping via `@atelier/capability-resolver`. Two-stage compile. `d73c5c8`.
- ✅ **C-4** — Outline + multi-route fan-out (`ea98644`).
- ✅ **C-5** — Recipe RAG via `@atelier/recipe-resolver` + `findRecipe` tool. `b6aa5b8`.

### Wave 10 — Scale (closed, all 7 phases shipped)

S-1 ✅ (= C-3) · S-2 ✅ · S-3 ✅ · S-4 ✅ (`1880415` distributed TriggerBus) · S-5 ✅ · S-6 ✅ · S-7 ✅.

### Wave 8 — Vault marketplace (closed, all sub-tracks shipped)

V-1 ✅ · V-3 ✅ · V-6.a ✅ · V-6.b ✅ · V-6.c ✅ · V-6.d ✅ · V-6.e ✅ · V-6.f ✅. End-to-end publish → review → consume → browse → RAG → nightly eval pipeline.

### What we explicitly do NOT do (compiler track)

- ❌ Flat Plan→Compose→Validate→Refine multi-agent pipeline as the default. High latency (60-90s vs today's 22s), high cost, marginal accuracy gain over C-1.
- ❌ Per-component specialist agents ("a `<Queue>` agent, a `<Card>` agent"). Component selection is a single decision; splitting into N agents is overengineering.

---

## Tomorrow's first move (suggested)

Lowest-friction wins to pick up tomorrow, ranked:

1. **P0 leftovers (manual)** — flip branch protection in repo settings; enable project board / discussions if you want them. **5 min.**
2. **P1.4 schema variant** — `BehaviorPatternDetectedTrigger`. Self-contained, <1 d. Closes the Wave-10 plumbing follow-ups.
3. **Marketplace browse on docs site** — one-day visible win. Embed `<MarketplaceBrowser>` against a static JSON snapshot exported on each deploy. Demonstrates the framework's promise to anyone who reads `/atelier/`.
4. **P3 follow-up** — wire up custom domain if `atelier.dev` (or similar) is in hand; otherwise leave for later.
5. **P4 — pick a sub-bucket** — Coll-1 (presence) is gated on a real backend wire-up; Vis-4 (variant pass) is mechanical and parallelisable; AI-2 / AI-4 round out the inline-AI surface. Coll-1 is the highest-impact next move once a host-supplied transport is identified (S-4 ✅ unblocks the wire).

---

## Maintenance

- This file is the **planning surface**. Per-commit prose-form descriptions of shipped items live in commit messages and `docs/build-plan.md`.
- When a P0 item lands, mark it `[x]` and add the commit hash. When a higher-band item lands, do the same and consider whether it should be promoted out of the planning surface (i.e. inlined into the `What's shipped` section) on the next quarterly cleanup.
- The marketplace nomenclature note at the top of this file should NOT be removed without consensus — it's preventing real confusion in PR review.
