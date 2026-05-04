# TODO

> Single source of truth for what's planned vs what's shipped. Updated 2026-05-04 (stability-first replan; marketplace nomenclature disambiguated).
>
> Historical record of phases that landed: [`docs/build-plan.md`](docs/build-plan.md) and the `## What's shipped` section of the root [`README.md`](README.md).

---

## Reading guide

**Priority is stability over expansion.** The order below is what I'd ship next, not what's most exciting. Within a band, items are listed in execution order (top first).

| Band   | Bucket                                                          | What it's for                                               | Time-box    |
| ------ | --------------------------------------------------------------- | ----------------------------------------------------------- | ----------- |
| **P0** | [Stability & op-debt](#p0--stability--op-debt)                  | Velocity-killers — fix before adding more surface           | <1 wk total |
| **P1** | [Compile quality](#p1--compile-quality)                         | Correctness + scope (C-3/S-1, RAG via C-5, distributed bus) | 4-6 wk      |
| **P2** | [Marketplace completion (V-6)](#p2--marketplace-completion-v-6) | The distribution channel + browse / publish / consume UI    | 4-6 wk      |
| **P3** | [Site consolidation](#p3--site-consolidation--branding)         | Fold marketing into docs; one nav, one design               | 2-3 d       |
| **P4** | [Wave 11 polish remaining](#p4--wave-11-polish-remaining)       | Visual / interaction / content / nav / coll / AI long tail  | 6-10 mo     |
| **P5** | [Personalisation continuity](#p5--personalisation-continuity)   | P-3 / P-4 / P-7 finishing                                   | 3 wk        |
| **P6** | [Multi-platform & long tail](#p6--multi-platform--long-tail)    | iOS / Android / RN / cross-platform variants / open Qs      | 12-16 wk    |

> **Naming note (marketplace).** Two distinct things in this codebase share the word "marketplace":
>
> - **The catalog** — the set of baseline primitives `@atelier/components` ships, plus the recipes / brand kits / skills built on top. This is the _product_. The Wave M architectural pivot was about the catalog. Codified as ETHOS principle #11 ("baseline-first").
> - **The vault marketplace** — the distribution channel (atelier://author/persona@version, ed25519 signing, TOFU). The technical infrastructure that lets the catalog reach hosts. This is **V-6** in Wave 8.
>
> Throughout this file, when we say "marketplace" alone we mean the distribution channel (V-6). The catalog principle is referred to as **"baseline-first"** or **"the catalog"**.

---

## At a glance

| Wave    | Scope                                                                                          | Status                                    |
| ------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------- |
| **M**   | Baseline-first pivot — catalog 62 → 81 (now 83); 3 demos at zero customs; ETHOS #11; eval gate | ✅ shipped                                |
| **R**   | Release blockers — public-facing mailbox placeholders + repo metadata                          | 🟡 partial — branch protection still TODO |
| **C**   | Compiler evolution — C-1 ✅ C-2 ✅ C-4 ✅; C-3/S-1 + C-5 (RAG) remain                          | 🟡 partial                                |
| **7**   | Personalisation — P-1 / P-8 / P-9 / DD ✅; P-3 / P-4 / P-7 remain                              | 🟡 in flight                              |
| **10**  | Scale — S-2 / S-3 / S-5 / S-6 / S-7 ✅; S-1 / S-4 remain                                       | 🟡 partial                                |
| **8**   | Vault marketplace — V-1 / V-3 ✅; **V-6 = P2 below**                                           | 📅 planned                                |
| **11**  | Visual depth — 16 items shipped this session (catalog 65 → 82); long tail remains              | 🟡 partial                                |
| **12+** | Multi-platform — N-4 ✅; N-1 / N-2 / N-3 / N-5 remain                                          | 🟡 partial                                |
| **Op**  | Operational + hardening debt                                                                   | 📅 see P0                                 |

**Recently shipped this session** (`fc5aa32` → `4f02ea6`, 16 catalog promotions): Vis-5 (illustration resolver), Vis-8 (skeleton-as-shape), Cnt-10 (saved views), Cnt-11 (autosave + version history), Int-5 (TourStep / TourProgress / Confetti), Int-10 (DropZone), Int-14 (Lightbox + Image), Nav-6 (FilterQueryBar), AI-1 (SelectionActionBar), AI-3 (GenerativeLayout), C-4 (outline + multi-route fan-out). Plus docs site shipped at https://fragmatic-io.github.io/atelier/docs/.

---

## P0 — Stability & op-debt

Cheap to fix, expensive to ignore. **Do these next.**

### P0.1 — Test-suite stability

- [x] **Fix 4 pre-existing test failures.** `evals/end-to-end/gemini-smoke.test.ts` (3 cases) and `packages/schemas/test/golden.test.ts` (1 case) fail on a clean tree. Either fix or quarantine + label as `it.skip` with a tracking comment. Without this, every agent has to mentally subtract 4 noise failures from its run, and a real regression hides easily. **<1 d.**
- [x] **`use-optimistic-action.test.tsx` TS errors (lines 96/151/152).** `Property 'ok' / 'error' does not exist on type 'never'.` — pre-existing, blocks `pnpm typecheck`. **<2 h.**

### P0.2 — Pre-commit / pre-push hooks

- [ ] **Lint-staged worktree-stash leak.** `.husky/pre-commit`'s `git stash --include-untracked` sweeps files from sibling worktrees that share `.git`. Cost this session: ~3 manual recoveries, ~30 min lost each. Replace with a per-file stash scoped to the staged set, OR move format/lint inline (no stash). Document. **<1 d.**
- [ ] **`pre-push` runs full-monorepo `validate:fast` (~60 s × N agents).** Move to a per-package gate, OR cache typecheck results between runs, OR shrink to staged-package-only. **<1 d.**

### P0.3 — Repo settings (one-time, manual)

- [ ] **Branch protection on `main`** — require CI green, require PR review (1 reviewer), no force-push. _Repo-owner action via `gh repo edit` or Settings UI._
- [ ] **Project board / discussions / wiki** — enable once team grows beyond one. _Repo-owner action._

### P0.4 — Marketplace nomenclature cleanup (this commit)

- [x] **ETHOS #11 retitled and disambiguated.** Title now "Baseline-first: the catalog is the product". Glossary box at the top of the principle distinguishes catalog (= the product) from vault marketplace (= V-6 distribution channel). Wave M references rephrased to "baseline-first pivot" where they previously read "marketplace pivot". This file's reading-guide also documents the split.

### P0.5 — Misc fast wins

- [ ] **`ManifestFetcher` Zod-validation on response body.** `ManifestResolver.validate` is the only client-side defense today. Add structural parse on response. **<1 d.**
- [ ] **`IndexedDBManifestCache` runtime sanity check on read.** Casts stored values without parse. Add defensive parse on `get`. **<1 d.**
- [ ] **`ActionDispatcher` Zod-validate input against `capability.input`.** Host is on the hook today. **<1 d.**
- [x] **JSON-Schema export AJV-strict CI step.** `scripts/check-schemas-ajv.ts` loads every dumped schema through `new Ajv({ strict: true })`; wired into `validate:fast` and the CI workflow. `toJsonSchema` now strips `format` keywords from generated output so downstream consumers don't need `ajv-formats` just to compile our schemas.
- [ ] **Skill-markdown YAML strictness.** `parseSkillMarkdown` could surface a clearer error message; an `atelier lint skill <path>` would front-run validation. **<1 d.**

---

## P1 — Compile quality

Compile correctness, scope, retrieval. The next architectural moves after C-1 / C-2 / C-4.

### P1.1 — Capability scoping

- [ ] **C-3 / S-1 — Two-stage compile.** Tiny / fast model picks ~30 relevant capabilities from 1-line summaries; full Pro model gets those 30 schemas. With C-2 in place, `findCapability` _is_ the stage-1 call — wire a vector index (or even substring + frequency for the MVP) behind the existing tool. New package `@atelier/capability-resolver`. **2 wk. HIGH.** Trigger: first host with >150 capabilities (we're not there yet, but close).

### P1.2 — Recipe retrieval (RAG)

- [ ] **C-5 — Recipe RAG.** Recipes vector-indexed by description / domain / brand fit. Compiler agent gets a `findRecipe` tool (the seam was reserved during C-2). Same single-agent + tools pattern. **2 wk.** **Depends on V-6 publishing endpoint** (so there's something to index from) — but the plumbing (embedding pipeline, vector store, the tool) can land before V-6 with a local-recipes fixture index.

### P1.3 — Distributed trigger bus

- [ ] **S-4 — Distributed `TriggerBus`.** Today: in-memory pub-sub. Need: cross-process / cross-host so a marketplace-distributed recipe can subscribe to events from a different process. **2 wk.** Triggered by V-6 actually shipping multi-host workflows.

### P1.4 — Plumbing follow-ups

- [ ] **`BehaviorPatternDetectedTrigger` schema variant.** V-4 emits `behavior.workaround_detected`; we also want a non-workaround `behavior.pattern_detected` so promote-to-recipe doesn't fire on pure-workaround sequences. **<1 d.**
- [ ] **Behavioral pattern detector implementations.** `BehavioralPatternDetector` interface + `NoopBehavioralDetector` ship; no real heuristics. **2-3 d.**
- [ ] **Cross-app workflow compilation.** Single-app compile is shipped; "Gmail + Calendar + Linear in one lens" needs a neutral compiler host. See [`docs/open-questions.md`](docs/open-questions.md) §1. **1-2 wk after V-6.**

---

## P2 — Marketplace completion (V-6)

The distribution channel. **The Wave M architectural prerequisite is shipped — the demos prove the principle. V-6 is what turns it into a product.**

### P2.1 — Endpoints + signing (V-1 ✅ V-3 ✅ already)

- [x] **V-1 — `MarketplaceAddress` + `SignedBundle` schemas + ed25519 signing.** Shipped.
- [x] **V-3 — TOFU verification.** Shipped.

### P2.2 — V-6 sub-tracks (sequenced)

- [ ] **V-6.a — Publish endpoint.** `POST /atelier/marketplace/persona` accepts a signed bundle, verifies the ed25519 signature, persists to a content-addressed store, indexes by `(author, persona, version)`. **1 wk.**
- [ ] **V-6.b — Consume endpoint.** `GET /atelier/marketplace/<author>/<persona>@<version>` returns the signed bundle. Browser caches by content hash. **1 wk.**
- [x] **V-6.c — Browse / search UI.** `<MarketplaceBrowser>` baseline primitive shipped (catalog 82 → 83). Renders a filter panel (author / domain / brand kit / search) + scrollable listings; card click opens a preview drawer with a "Use this recipe" CTA that fires `onSelect` + optionally dispatches a `selectCapability` via the host dispatcher. `MockMarketplaceClient` ships alongside for previews / tests; production hosts wire the `@atelier/vault-client`-backed client.
- [ ] **V-6.d — Review / curation flow.** Maintainer-side approval for personas surfaced in the default index. Could be skipped for v1 in favour of a flat self-publish space. **1 wk.**
- [ ] **V-6.e — Eval gate.** "Top 10 personas in the marketplace compile cleanly" smoke job that runs nightly. **3 d.**
- [ ] **V-6.f — Sign capabilities/skills artifacts at publish time.** Per [`docs/production-concerns.md`](docs/production-concerns.md). Needs a key-management decision (per-author key on first publish, or a maintainer-issued cert?). **1 wk.**

**Total V-6**: 4-6 wk depending on whether V-6.d ships in v1.

### P2.3 — Marketplace-adjacent primitives (separate from V-6)

- [x] **Marketplace browse-page primitive** — shipped together with V-6.c above. `<MarketplaceBrowser>` is a baseline catalog entry (catalog 82 → 83); accepts any `MarketplaceClient`, so hosts can wire the V-6.b endpoint via `@atelier/vault-client` once that lands.

---

## P3 — Site consolidation & branding

We ship **two** Astro sites today, on **one** Pages domain:

- `fragmatic-io.github.io/atelier/` — marketing (`apps/marketing`, plain Astro)
- `fragmatic-io.github.io/atelier/docs/` — developer docs (`apps/docs`, Astro Starlight)

That split costs us:

1. Duplicate branding (logos, fonts, colour tokens diverge).
2. Two builds in CI.
3. Different nav idioms — marketing uses Astro pages, docs uses Starlight sidebar; they don't cross-link cleanly.

### P3.1 — Merge plan (recommended)

- [ ] **Fold `apps/marketing` into `apps/docs` as a custom homepage + `/start/` / `/architecture/` / `/ethos/` / `/demos/` Starlight pages.** Starlight already has a `template: splash` for hero pages (the docs index uses it). The 5 marketing pages (`index`, `start`, `architecture`, `ethos`, `demos`) become 5 Starlight pages with `template: splash`. Keep the marketing visual language by porting the `apps/marketing/src/styles` into `apps/docs/src/styles/atelier-splash.css`. Remove the dual-deploy step from `site-deploy.yml`. **2-3 d.**
- [ ] **Drop `apps/marketing/` package** after the merge. **<1 d.**
- [ ] **Single canonical URL: `fragmatic-io.github.io/atelier/`** with the docs sidebar visible everywhere except the splash homepage and the 4 marketing-shaped pages.
- [ ] **Custom domain.** Once we own one (e.g. `atelier.dev`), drop the `/atelier/docs/` path-prefix entirely — the rehype-internal-links plugin handles that automatically via the `DOCS_BASE` env var.

### P3.2 — If we keep both (alternative)

- [ ] **Unify branding tokens.** A shared `apps/_shared/brand-tokens.css` consumed by both Astro projects. **1 d.**
- [ ] **Cross-site top nav.** Same header on both surfaces with active-tab logic. **1 d.**
- [ ] **Search across both.** Pagefind currently only indexes `apps/docs/dist`. Either point it at the merged `_site/`, or add a second index for marketing content. **1 d.**

**Recommendation:** P3.1 (merge). Marketing copy is 80% docs anyway; Starlight's splash template is good enough; one less surface to maintain.

---

## P4 — Wave 11 polish remaining

The long tail of visual / interaction / content / nav / collaboration / AI primitives. Sequence within each sub-bucket is execution order; sub-buckets are independent.

### P4.1 — Vis (visual depth)

- [x] Vis-2, Vis-3, Vis-5, Vis-8 shipped.
- [ ] **Vis-4** — Variant pass for the remaining 32 components (after Wave 6 P-10 covered 24/56). Less work after the catalog grew — fewer customs to author tables for. **~1.5 wk.**
- [ ] **Vis-7** — Elevation / surface system. 5-step elevation token scale (resting / hover / popover / modal / commandbar) with paired light/dark shadow recipes. **3 d on top of Vis-2.**
- [ ] **Vis-9, Vis-10** — Open visual-debt items (consult original list).

### P4.2 — Int (interaction)

- [x] Int-2, Int-3, Int-4, Int-5, Int-10, Int-11, Int-13, Int-14 shipped.
- [ ] **Int-1** — Motion layer extension beyond P-7. Per-component entry/exit, data-update animations (row shimmer on update, badge pulse on increment, count tick-up easing). Linear's "0.16x" scale is the reference. **2 wk on top of P-7.**
- [ ] **Int-6** — Quick-switcher (`Cmd+P`) distinct from command palette. Capability-typed `quickswitch_index` per app. Depends on Int-3. **1 wk.**
- [ ] **Int-7** — Chord shortcuts + per-user aliases. `g i` / `g a` style. `@atelier/keyboard` registry needs a chord state machine + per-user alias overlay in the intent vault. Depends on Int-3. **1 wk.**
- [ ] **Int-15** — Smart paste with link unfurl. Cnt-4 ✅ unblocked. **1.5 wk.**

### P4.3 — Cnt (content)

- [x] Cnt-1..5, Cnt-7..11 shipped.
- [ ] **Cnt-6** — Block-menu base (BlockKindRegistry already shipped via Cnt-7). Open question whether anything remains here separate from Cnt-7. Audit + close. **<1 d audit.**

### P4.4 — Nav (navigation)

- [x] Nav-4, Nav-5, Nav-6 shipped.
- [ ] **Nav-1** — Navigation rail / app shell upgrade. Linear / Notion / Figma all ship a left rail with collapsible sections + per-section persistence. Sidebar already has persistence (Nav-2); this is the rail-shaped upgrade. **1 wk.**

### P4.5 — Coll (collaboration; S-3 ✅ unblocked the whole bucket)

- [ ] **Coll-1** — Multiplayer presence indicators. `<Presence>` primitive backed by a `presence.subscribe` capability. **1.5 wk.**
- [ ] **Coll-2** — Live cursors on canvas / list / doc surfaces. Figma-style remote cursors with smooth interpolation. Depends on Coll-1. **2 wk.**
- [ ] **Coll-3** — Threaded comments anchored to content. `comment_anchor` schema + `<CommentThread>` primitive. Depends on Cnt-3. **2.5 wk.**
- [ ] **Coll-4** — Real-time follow-mode / observe-mode. Bounded scope: read-only follow on doc / canvas. Depends on Coll-1. **2 wk.**
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
- [ ] **Component-variants demo / Storybook.** A dedicated visual gallery (Storybook or a custom MDX route) is roadmap — should compose with P3.1 site consolidation if it lands.
- [ ] **IndexedDB LRU eviction is O(n) per write.** Fine at the default cap of 200; revisit with byte-accounting work.

---

## What's shipped — historical record

For full prose-form context on every landed item see the per-wave sections preserved below.

### Wave M — Baseline-first pivot (closed)

12 commits across the 2026-05-02 session. ETHOS principle #11 codified. All three demos ship zero custom bindings.

**Promotions to baseline (catalog 62 → 65):**

- ✅ `<Queue>` + `<Logo>` — `f2ef2d9`
- ✅ `<MetaBadge>` — `7241dd3`
- ✅ Data-aware `<Grid>` + tile-shaped `<Card>` — `dbb57ca`
- ✅ Data-aware `<Gallery>` — `ae2ae76`
- ✅ Per-item `emphasis` flag on `<Queue>` — `f53058a`
- ✅ Inline-state branches stripped from data-bound primitives — `1bc2174`

**Demos at zero customs (was 17 customs across the three):** Aurora ✅ Octant ✅ Marigold ✅.

**Adjacent tracks closed:** P-8 (empty/loading/error policy), S-6 (compile budget enforcement), Wave R (release blockers).

### Wave 11 — shipped this session (catalog 65 → 82, +16 in one session)

Vis-5 (illustrations) `d9789cc` · Vis-8 (skeleton-as-shape) `0bf58fa` · Cnt-10 (saved views) `f410775` · Cnt-11 (autosave + version history) `6443904` · Int-10 (DropZone) `448b170` · Int-5 (TourStep + TourProgress + Confetti) `fc5aa32` · Int-14 (Lightbox + Image) `23d90f3` · C-4 (outline + multi-route fan-out) `ea98644` · Nav-6 (FilterQueryBar) + AI-1 (SelectionActionBar) `0504090` · AI-3 (GenerativeLayout) `4f02ea6` · docs site `d100dcf`.

Plus prior session: Vis-2, Int-2, Int-3, Int-4, Int-11, Int-13, Cnt-1, Cnt-2, Cnt-3, Cnt-4, Cnt-5, Cnt-8, Cnt-9, Nav-4, Nav-5.

### Compiler — shipped this track

- ✅ **C-1** — Validation feedback loop (`497e99d`). `ValidationFeedbackCompiler` wraps the base compiler, re-prompts on policy violation up to 2-3 retries, cumulative budget tracking.
- ✅ **C-2** — Tool-using compiler (MVP). 9 tools (`lookupCapability` / `findCapability` / `listCapabilities` / `findComponent` / `inspectComponent` / `listComponents` / `validateDraft` / `inspectExistingManifest` / `listSiblingRoutes`). Showcased in `apps/demo` behind `CIR_COMPILER_TOOLS_ENABLED=1`.
- ✅ **C-4** — Outline + multi-route fan-out (`ea98644`). `AppOutlineSchema`, `DeterministicOutlineCompiler`, `MultiRouteCompiler` (one outline + N parallel route compiles).

### What we explicitly do NOT do (compiler track)

- ❌ Flat Plan→Compose→Validate→Refine multi-agent pipeline as the default. High latency (60-90s vs today's 22s), high cost, marginal accuracy gain over C-1.
- ❌ Per-component specialist agents ("a `<Queue>` agent, a `<Card>` agent"). Component selection is a single decision; splitting into N agents is overengineering.

---

## Maintenance

- This file is the **planning surface**. Per-commit prose-form descriptions of shipped items live in commit messages and `docs/build-plan.md`.
- When a P0 item lands, mark it `[x]` and add the commit hash. When a P1+ item lands, do the same and consider whether it should be promoted out of the planning surface (i.e. inlined into the `What's shipped` section) on the next quarterly cleanup.
- The marketplace nomenclature note at the top of this file should NOT be removed without consensus — it's preventing real confusion in PR review.
