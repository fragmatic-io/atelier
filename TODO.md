# TODO

> Single source of truth for what's planned vs what's shipped. Updated 2026-05-02 (marketplace-pivot consolidation).
>
> For the historical record of what _did_ land in each phase, see [`docs/build-plan.md`](docs/build-plan.md) and the `## What's shipped` section of the root [`README.md`](README.md).
>
> Streamlined order top → bottom: smallest mandatory blockers, then highest-leverage architectural moves, then bounded-but-large feature tracks, then long-tail operational debt.

---

## At a glance

| Wave    | Scope                                                                                                                                                          | Status         | Priority            | Est        | Depends on     |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------- | ---------- | -------------- |
| **M**   | Marketplace pivot — promote `<Queue>` / `<Logo>` / `<MetaBadge>` to baseline; collapse 15 customs across 3 demos to **0**; ETHOS principle #11; eval gate      | ✅ **shipped** | —                   | done       | —              |
| **R**   | Release blockers — public-facing mailbox placeholders + repo metadata                                                                                          | 🟡 partial     | HIGH (release gate) | <1d total  | —              |
| **C**   | Compiler evolution — single tool-using agent + validation feedback loop + scoping (NEW track; supersedes "single big-prompt" architecture; **C-1 ✅ shipped**) | 🟡 partial     | HIGH                | 3 wk left  | M              |
| **7**   | Personalisation — P-3, P-4, P-7 (P-1 / P-8 / P-9 / DD shipped)                                                                                                 | 🟡 in flight   | mixed               | 3 wk       | C-Phase-1      |
| **10**  | Scale tracks — S-1, S-2, S-4 (HIGH); S-3, S-5, S-7 (MEDIUM); S-6 ✅ shipped                                                                                    | 📅 planned     | mixed               | 8 wk       | C-Phase-2      |
| **8**   | Vault marketplace — V-6 (V-1, V-3 ✅ shipped)                                                                                                                  | 📅 planned     | MEDIUM              | 4-6 wk     | C, 7           |
| **11**  | Visual depth — Vis / Int / Cnt / Nav / Coll / AI (~50 items; Vis-2, Int-2, Int-3, Int-4, Int-13, Cnt-1, Cnt-8 ✅ shipped)                                      | 📅 partial     | varies              | 6-10 mo    | C, P-7, S-3    |
| **12+** | Multi-platform + marketing — N-1..N-5 (**N-4 ✅ shipped**)                                                                                                     | 🟡 partial     | LOWER               | 12-16 wk   | M (now proven) |
| **Op**  | Operational + hardening debt — small, bounded items, do anytime                                                                                                | 📅 open        | LOWER               | <1 wk each | —              |

**Recommended sequence (next):** **C-Phase-2 (tools, 2 wk)** → S-1 (when first host hits >150 capabilities) → Vis-3 (icon resolver) → 11.x polish picks → V-6 (marketplace) → balance of 11 / 12. _(P-9 ✅ landed.)_

_Already shipped (in order): R → C-Phase-1 → N-4 → marketplace pivot (Wave M) + adjacent (P-8, S-6) before that._

---

## Wave M — Marketplace pivot (closed)

12 commits across the 2026-05-02 session. ETHOS principle #11 codified. All three demos ship zero custom bindings.

### What landed

**Promotions to baseline (catalog 62 → 65):**

- ✅ `<Queue>` + `<Logo>` — `f2ef2d9` (feat: promote Queue + Logo to baseline; collapse 12 customs across demos)
- ✅ `<MetaBadge>` — `7241dd3` (small inline status pill)
- ✅ Data-aware `<Grid>` + tile-shaped `<Card>` — `dbb57ca`
- ✅ Data-aware `<Gallery>` — `ae2ae76`
- ✅ Per-item `emphasis` flag on `<Queue>` — `f53058a` (mirrors `pinned: true`)
- ✅ Inline-state branches stripped from data-bound primitives — `1bc2174` (P-8 closing; walker substitutes manifest-supplied or resolver-default state slots)

**Demos at zero customs (was 17 customs across the three):**

- ✅ Aurora (`apps/demo`) — `f2ef2d9` (DecisionQueue / TaskQueue / ThreadView / UndoBar all retired; ambient `<UndoBar>` via `UNDO_TOAST_AMBIENT_SATISFIER`)
- ✅ Octant (`apps/demo-github`) — `f2ef2d9` + `f53058a` (Wordmark / OctantHeader / RepoTable / RateLimitStatusBar / IssueQueue retired; Stack(Logo, NavBar, StatusBar) chrome)
- ✅ Marigold (`apps/demo-dummyjson`) — `f2ef2d9` + `dbb57ca` + `ae2ae76` (MarigoldHeader / Wordmark / RateLimitChip / ProductCard / ProductGrid / ProductDetail / CartItemList / CheckoutWizard retired)

**Framework wins shipped alongside:**

- ✅ `GenericFallbackCompiler` in `@atelier/compiler` — `769c7ad` (fallback lives in framework, not per-demo)
- ✅ ETHOS principle #11 codified — in `f2ef2d9` (`docs/ethos.md`)
- ✅ `tests/marketplace-pressure.test.ts` eval gate — ceilings only ratchet down

**Adjacent tracks closed in this window:**

- ✅ **P-8** — empty / loading / error first-class composition policy. `7589281` (schema slots + walker substitution + demo showcase) + `1bc2174` (inline branches stripped)
- ✅ **S-6** — compile cost budget enforcement (`BudgetMeteredCompiler`, `BudgetCounter` interface, `mergeCompileBudgets`, `BudgetExceededError.code`). `bc92956`. Demo wiring env-gated via `CIR_COMPILE_BUDGET_ENABLED`.

**Tech-debt resolved in the same window:**

- ✅ TS5097 import-extension errors workspace-wide (152 imports rewritten across 80 files in 7 packages). `2998b2c`
- ✅ Dead `ambientPolicySatisfiers` field on `CirRuntimeServices` (Path B — drop dead code; matches ETHOS principle #4 constrained surface). `b413c91`
- ✅ TS18046 in `packages/schemas/test/json-schema.test.ts`. `970c8ed`
- ✅ TS2322 in `packages/components/test/Table.test.tsx` (11 errors via single `idOf` widening). `73a7284`

**Test count over the pivot:** 1939 → 2002 (+63).

### Trade-offs accepted (documented in commit bodies)

- Plainer per-row rendering on `<Queue>` (no hover-card mention previews, no mono refs, no chips on rows). Manifests can't pass `renderItem` functions.
- Multi-select dropped from Octant inbox (baseline `<List>` + `<BulkActionBar>` covers it; promoting onto `<Queue>` is a separate decision).
- Qty selector dropped from Marigold cart rows (`<Queue>` lacks an inline-form per-row slot).
- 5-star rating + strike-through original price dropped from Marigold product detail (no inline rating slot on `<Card>` yet).
- Sidebar wizard + progressive disclosure dropped from Marigold checkout (`<Wizard>` consumes ReactNode step bodies; not manifest-driveable yet).

---

## Wave R — Release blockers (small, mandatory)

These ship before opening the repo to outside reporters. One cleanup commit, ~1 hour.

- [x] **Security contact** — `security@cir.dev` placeholder in [`SECURITY.md`](SECURITY.md) replaced with `v@fragmatic.io` (monitored maintainer mailbox). Note in file to switch to a shared `security@` once the team grows.
- [x] **Conduct contact** — `conduct@cir.dev` placeholder in [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) replaced with `v@fragmatic.io`. Note in file to switch to a shared `conduct@` once the team grows.
- [ ] **Branch protection on `main`** — require CI green, require PR review, no force-push. _GitHub-settings; user enacts via `gh`._
- [x] **CI Node matrix** — widened from `[22]` → `[22, 24]` in `.github/workflows/ci.yml` (Node 24 became LTS 2025-10).
- [x] **`actionlint` on Dependabot** — conservative path taken: Dependabot PRs stay IN scope of the existing `pull_request` trigger so its workflow-YAML mutations get linted. Documented in `.github/workflows/actionlint.yml` (no `pull_request_target`, no Dependabot skip).
- [ ] **Project board / discussions / wiki** — set preferences once the team grows beyond one. _GitHub-settings; user enacts via UI / `gh`._

---

## Wave C — Compiler evolution (NEW track)

> The Atelier compiler today is a single LLM call with everything in the prompt. The evolution is **single tool-using agent + validation feedback loop**, NOT a flat multi-agent orchestration. Tools + reflection capture ~80% of multi-agent benefit at ~20% of cost. Latency stays bounded; per-compile token cost drops; accuracy improves.

### Why this matters

Today's failure modes that get worse at scale:

| Scenario                  | Today                             | Why it breaks                         |
| ------------------------- | --------------------------------- | ------------------------------------- |
| >200 capabilities         | All schemas in prompt             | Token budget blown; LLM ignores half  |
| >50 components            | All descriptions in prompt        | Same; LLM picks wrong primitives      |
| Validation cascade        | Falls through to fallback         | LLM never gets to fix its own mistake |
| Multi-route apps          | Each route compiled independently | Chrome / brand drift across routes    |
| Marketplace recipes (V-6) | Stuff all candidates in prompt    | Same scale problem                    |

### Phase C-1 — validation feedback loop (1 wk; biggest single-day win)

- [x] **C-1** — On policy violation in the validate hook, re-prompt the SAME LLM with `{draft, violations}` and ask it to patch. Bound to 2-3 retries before cascading to `GenericFallbackCompiler`. Track via the existing `compile.budget_used` audit event so visibility is preserved. **Shipped `497e99d`** — `ValidationFeedbackCompiler` mirrors the `BudgetMeteredCompiler` wrapper pattern from S-6; new `priorDraft` + `violations` fields on `CompileInput`; refinement-prompt path in `prompts/builder.ts`; demo wiring + tests; cumulative `token_cost`/`duration_ms`/reasoning across attempts; cascade-friendly via `CompilerOutputError`.

### Phase C-2 — tool-using compiler (2 wk; real architecture shift)

- [x] **C-2** — `GeminiCompiler` → single tool-using agent. **MVP shipped** (this commit) — `ToolUsingCompiler` wraps `GeminiAgentClient` (a function-calling-aware sibling of `GeminiCompiler`) and drives a bounded agent loop against a host-supplied `ToolEnvironment`. Nine tools landed: `lookupCapability` / `findCapability` / `listCapabilities` (discovery), `findComponent` / `inspectComponent` / `listComponents` (component selection), `validateDraft` (C-1 validation feedback as a tool), `inspectExistingManifest` / `listSiblingRoutes` (cross-route coherence). `explainViolation` and `findRecipe` deferred (the latter gated on V-6 / C-5; the former rolled into the violation strings the validator already returns). Substring-fallback search for `findCapability` / `findComponent` is the seam C-5 RAG swaps in for. Showcased in `apps/demo` behind `CIR_COMPILER_TOOLS_ENABLED=1`. Wraps cleanly inside `ValidationFeedbackCompiler`; cascades through `CompositeCompiler` on `CompilerOutputError`. Default boot unchanged. Tests in `tool-using-compiler.test.ts` (21) + `tool-environment.test.ts` (10). Replication to other demos + production polish remain follow-ups.

### Phase C-3 — capability scoping (= Wave 10 S-1)

- [ ] **C-3 / S-1** — Two-stage compile: tiny / fast model picks 30 relevant capabilities from 1-line summaries; full Pro model gets those 30 schemas. New package `@atelier/capability-resolver`. With C-2 in place, `findCapability` can BE the stage-1 tiny-model call. **2 wk. HIGH.** Trigger: first host with >150 capabilities.

### Phase C-4 — outline agent for multi-route apps (only when needed)

- [ ] **C-4** — One-time "app outline" pass produces brand chrome shape (`Stack(Logo, NavBar, StatusBar)`), nav structure, common policies, skill stack. Per-route compiles inherit. Bounded multi-agent — work parallelises (one outline + N route compiles fan out). Helps cross-route coherence in V-6 marketplace apps. **1 wk.** Trigger: V-6.

### Phase C-5 — marketplace retrieval (RAG; gated on V-6)

- [ ] **C-5** — Recipes vector-indexed by description / domain / brand fit. Compiler agent gets a `findRecipe` tool. Genuine RAG; same single-agent + tools pattern. **2 wk.** **Depends on V-6.**

### What we explicitly do NOT do

- ❌ Flat Plan→Compose→Validate→Refine multi-agent pipeline as the default. High latency (60-90s vs today's 22s), high cost, marginal accuracy gain over C-1.
- ❌ Per-component specialist agents ("a `<Queue>` agent, a `<Card>` agent"). Component selection is a single decision; splitting into N agents is overengineering.
- ❌ Free-form agent loops with conversation between agents. Atelier compilation is structured output, not research.

---

## Wave 7 — Personalisation (in flight)

(Phase 6+ roadmap track; some items shipped pre-pivot, P-8 closed during pivot.)

- [x] **P-1** — Density skill + `intent.global_preferences.density`. Shipped Wave 6.
- [ ] **P-3** — Refinement loop (right-click any component → describe tweak → diff-compile → manifest update + new scoped intent rule). Depends on P-1. 1.5 wk.
- [ ] **P-4** — Engagement signals back into compiler (component.viewed / dismissed / bounced + per-user aggregator). 1 wk.
- [ ] **P-7** — Motion / view-transitions / animation layer (foundation for Wave 11 Int-1). 1.5 wk.
- [x] **P-8** — Empty / loading / error first-class composition policy. `7589281` + `1bc2174`.
- [x] **P-9** — Information hierarchy. Categorical `Capability.salience_level` + intent `priority_overrides` + `resolveSalience` helper + `salienceResolved` advisory policy + `salience-aware-rendering` skill + data-resolver auto-emphasis (`withHighSalienceEmphasis`) + compiler-prompt nudges (legacy + tool-using). Showcase: github demo's `issue.list` / `issue.close` / `issue.archive` carry `salience_level: 'high'`. **Direct continuation of M** — principled re-introduction of the salience signal stripped during the marketplace pivot.
- [x] **DD** — Full personalisation chain integration eval. Shipped at `evals/end-to-end/personalisation-chain.eval.ts`.

---

## Wave 10 — Scale tracks

The framework today handles single-app, ≤200-capability registries with low-cardinality data fine. Past those limits these tracks fix the failure modes.

- [ ] **S-1 — Capability scoping (two-stage compile).** See `Wave C / Phase C-3` above for the integrated plan; `findCapability` is the natural surface. 2 wk. **HIGH.**
- [ ] **S-2 — Virtualized List/Table + cursor pagination on `DataResolver`.** Without this, components rendering >500-item lists OOM the browser. `<VirtualList>` + `<VirtualTable>` (under `react-virtuoso` or `@tanstack/react-virtual`) + composition rule that forces virtualized variant when capability cardinality exceeds threshold + cursor protocol on the resolver. **2-3 wk. HIGH.**
- [ ] **S-3 — Streaming subscriptions on `DataResolver`.** `resolver.subscribe(binding)` returns `AsyncIterable<T>` for live data. **1.5 wk. MEDIUM.** Gates Coll-1..5.
- [ ] **S-4 — Distributed `TriggerBus` (`RedisTriggerBus` primary, `NATSTriggerBus` optional).** Required when invalidations need to cross processes. Existing `TriggerBus` interface is the seam. **1-2 wk. HIGH for multi-region.**
- [ ] **S-5 — Hierarchical capability registry + generated index + incremental validation.** Allow nested paths + auto-generated `_index.json` summarising ids/versions/paths + CI re-validates only changed files (via `git diff`). **1 wk. MEDIUM.**
- [x] **S-6 — Compile cost budget enforcement.** `BudgetMeteredCompiler`, `BudgetCounter`, `mergeCompileBudgets`, `BudgetExceededError.code`. `bc92956`. Demo wiring env-gated.
- [ ] **S-7 — Capability vector embeddings (RAG variant of S-1).** Higher-quality scoping when registries grow past ~1000 capabilities. **3 wk. LOWER** — defer until S-1's quality ceiling is hit.

**Recommended order for "real-app scale":** S-1 → S-2 → S-5 → S-4 → S-3 → S-7. (S-6 already done.)

---

## Wave 8 — Vault marketplace

(Wave 7 V-1 + Wave 8 V-3 already shipped; V-6 is the remaining big chunk.)

- [x] **V-1** — Real intent vault backend (`@atelier/vault-server` + `@atelier/vault-client`). Wire-format spec at [`docs/vault-protocol.md`](docs/vault-protocol.md). Roadmap items: SQLite adapter (gated on Node 24's stable `node:sqlite`), multi-key JWKS rotation, encryption-at-rest.
- [x] **V-3** — Permission grant UI against the real vault. Vault renders OAuth-style consent screen; CSRF bound by HMAC nonce. Per-jti revocation cascades `system.security_revocation`. Follow-up: rich consent-screen styling, on-vault profile seeding endpoint.
- [ ] **V-6 — Marketplace primitives** (`atelier://author/persona@version` addressing, ed25519 signing, TOFU trust model, review flow). **Depends on V-1 + V-4.** 4-6 wk. **The marketplace pivot (Wave M) was the architectural prerequisite — the demos prove the marketplace promise. V-6 is what turns it into a product.** Direct continuation of Wave M.

---

## Wave 11 — Visual depth (path to world-class web app UI)

Atelier today produces competent, on-brand professional UIs. Reaching the perceived quality of best-in-class web apps requires the additive tracks below — Vis (visual system), Int (interaction), Cnt (content rendering), Nav (information architecture), Coll (collaboration / real-time), AI (inline AI surfaces). None of it re-architects; each track adds a polish dimension.

The original Linear/Supabase parity scope was deliberately broadened into a **10-app survey** so the catalog covers the breadth of what users now expect from production web tools.

### Reference apps surveyed

Each entry names the specific UX trait that earned its place.

- **Linear** — Cmd+K command palette with weighted-recency fuzzy match, sub-150ms optimistic mutations, "0.16x" motion duration scale, triage view's three-pane layout, dense issue list with single-line item + tag-pill row, undo toasts on every destructive action, keyboard-first nav (`g i` / `g a`), saved views with shareable URLs, in-app activity feed with diff-collapse, command-line-style filter syntax in the top bar.
- **Supabase** — SQL editor with Monaco + saved snippets, table editor with inline-edit cells and column-resize, request-log tail with severity filter, project switcher in the top-left, function logs with structured JSON pretty-print, RLS policy designer with live-validate, side-drawer doc references on hover, dark-mode as a first-class surface (not a re-skin).
- **Notion** — slash-command menu (`/`) for inline block creation across 50+ block types, drag-handle on every block (left gutter), block-level @-mention with hover-card preview, smart paste (URL → unfurl card, code → fenced block with detected lang), inline AI ("Ask AI", "Summarize") on selection, sync-block + database views, version history per page, multi-cursor selection within a doc.
- **Figma** — live multiplayer cursors with name labels and color tokens per user, follow-mode that mirrors another user's viewport, 16ms-budget input loop, contextual right-panel that switches per selection class, properties panel with mixed-value indicators, comment pins anchored to canvas coordinates that survive layout changes, observe-mode with smooth-scroll catchup.
- **Stripe Dashboard** — chronological events log with diff-style payload expansion, dense data tables with column show/hide + density toggle, drilldown breadcrumbs ("Charges › ch_xxx › Refund r_xxx"), inline JSON tree with copy-as-cURL, time-range picker that persists per page, in-context API docs pane, settings with global search, status / system-health bar in the chrome.
- **Vercel** — real-time deploy log streaming with line-anchor URLs, build step accordion with per-step duration, env-var editor with masked-by-default + reveal-on-click, project switcher with team scope, deployment list with branch + commit chips, inline command output rendering (ANSI colors preserved), error groupings with stack traces folded by default.
- **Raycast / Arc** — root command palette as the primary navigation surface, fuzzy-search across actions+files+tabs, two-pane preview-on-hover, Cmd+P "go to anything" distinct from Cmd+K "do anything", chord shortcuts (`g g`), action-aliases per user, sub-menu drilldown without leaving keyboard, AI chat inline with the launcher.
- **Airtable / Tana** — saved view system (grid, kanban, calendar, gallery) per table with shareable URLs, field-type-aware cells (rating, attachment, formula, lookup), bulk-action floating bar with selection count and quick destructive ops, inline filter chips that compose, view-grouping with collapsible groups, hybrid doc+db nodes (Tana) where any node can be a row or a paragraph.
- **Slack / Discord** — multi-pane layout (sidebar + thread + main + details), unread badges grouped by workspace/server with mention-vs-message distinction, presence dots with per-channel granularity, threaded replies anchored to a message, slash commands (`/remind`, `/giphy`), drag-and-drop file upload anywhere in the app, persistent unread state across reloads, scroll-to-unread-anchor on channel switch, code-fence with language detection in messages.
- **Pitch / Tome / Gamma** — AI-assisted slide generation from a single prompt, per-slide regenerate / restyle, theme-coherent layout suggestions, smart-paste of links into rich blocks, presenter-view with timer, real-time co-editing with selection halos, inline image generation tied to slide content.

### Vis — visual system

- [x] **Vis-1** — Typography depth. Shipped: `BrandTokensSchema.typography` gains optional `letter_spacing` / `line_height` scales + an `opentype` flag map (tabular numerals, ligatures, optical sizing, fractions, super/sub). `atelier init`'s Tailwind template bridges to `--cir-tracking-*` / `--cir-leading-*` / `--cir-font-feature-settings` CSS variables. `<Table>` numeric columns and `<StatCard>` values emit `data-tnum="true"` for hosts to consume. Aurora kit extended as the worked example. **DONE.**
- [x] **Vis-2** — Dark mode as a real surface across all 65 components. Every entry in `_variants.ts` ships paired light + `dark:` Tailwind utilities. Regression gate at `test/_variants-dark.test.ts`. **DONE.**
- [ ] **Vis-3** — Icon resolver + `<Icon>` integration. `iconography.allowed_sets` declares which packs are allowed; need a real `<Icon set="lucide" name="archive" />` resolver layer + integration so components like `<Button icon="archive">` work without authoring per-component icon props. **1 wk.** Reference: Linear renders ~120 distinct icons across the app from a single set with consistent stroke-width.
- [ ] **Vis-4** — Variant pass for the remaining 32 components. Wave 6 P-10 covered 24/56. The other 32 (inputs, charts, navigation primitives, niche specialised) need the same `variant` + `size` treatment. **Less work after the marketplace pivot — fewer customs to author tables for.** Now ~1.5 wk.
- [ ] **Vis-5** — Custom illustration support. `<EmptyState>` ships as text + button. Linear/Notion-grade empty states use mascots, custom artwork, situation-specific tone. Need an illustration registry + `<EmptyState illustration="inbox-zero">` integration. Asset work + render plumbing. **2 wk.**
- [ ] **Vis-6** — Density toggles per surface. Stripe and Linear both ship a compact / cozy / comfortable density mode that re-scales row height, font size, and padding. New `density: 'compact'|'cozy'|'comfortable'` token plus a `density-aware` skill that propagates to `List`, `Table`, `Grid`, `DetailView`, `KPIRow`, `Queue`. **1 wk on top of Vis-1.**
- [ ] **Vis-7** — Elevation / surface system. 5-step elevation token scale (resting / hover / popover / modal / commandbar) with paired light-and-dark shadow recipes. **3 d on top of Vis-2.**
- [ ] **Vis-8** — Skeleton-as-shape, not as block. `<Skeleton>` today is a single grey rectangle. Best-in-class apps ship per-component skeleton shapes that match the real layout (avatar circle + two-line stack, table-row with 5 column blocks). **1 wk.**
- [ ] **Vis-9** — Status / system-health bar primitive expansion. Vercel and Stripe persistently surface deploy / system status in the chrome. **3 d.** (Note: `<StatusBar>` baseline already exists from Wave M; this expands the system-health binding contract.)
- [ ] **Vis-10** — Notification badge system. Slack/Discord/Linear all ship grouped per-domain badges. Builds on `<MetaBadge>` from Wave M. **1 wk.** Depends on Vis-9.

### Int — interaction depth

- [ ] **Int-1** — Motion layer extension beyond Wave 7 P-7. Per-component entry/exit animations, data-update animations (row shimmer on update, badge pulse on increment, count tick-up easing), respect `motion.duration_scale` from BrandKit. Linear's "0.16x" scale is the reference. **2 wk on top of P-7.**
- [x] **Int-2** — `<Tooltip>` primitive with proper timing. Shipped: 400ms initial delay, 100ms re-show delay inside a 1500ms sticky window (Linear/Stripe "snappy when scanning, polite when not" feel), 8px configurable offset, single-axis edge-flip (top↔bottom, left↔right) with viewport clamp, 100ms opacity fade honouring `prefers-reduced-motion: reduce`, focus + Escape + outside-click dismiss, `aria-describedby` wiring while open, long-press fallback on touch. Pure `computeTooltipPosition` helper exported for hosts; portal renders to `document.body` so `overflow: hidden` ancestors do not clip. 25 tests added (`packages/components/test/Tooltip.test.tsx`). No new deps. Pairs with the `tooltip-tone` skill.
- [x] **Int-3** — Global keyboard registry + Cmd+K command palette everywhere. New `@atelier/keyboard` package (`InMemoryKeyboardRegistry`, `InMemoryRecencyTracker`, hotkey parser/matcher with portable `cmd+k` ↔ Meta/Ctrl mapping). `<KeyboardProvider>` + `useKeyboardAction` hook in `@atelier/components` (mirrors the `IconResolverContext` pattern so `<CommandPalette>` doesn't take a runtime dep on `@atelier/react`). `<CommandPalette>` auto-discovers commands when no `commands` prop is passed, renders hotkey hint chips formatted per-platform, renders lucide icons via the Vis-3 resolver, weights fuzzy-match by recency. Aurora ambient-mounts `<AmbientCommandPalette>`; Cmd+K opens it from anywhere. Int-6 / Int-7 / Int-12 build on the same registry.
- [x] **Int-4** — Optimistic UI default. Shipped in `5b882fe`. `useOptimisticAction` auto-wires for any capability with `reversible: true && low_stakes: true`.
- [ ] **Int-5** — Onboarding microinteractions. Product-tour highlight chips, completion progress, contextual celebrations. New `<TourStep>` primitive + skill. **1.5 wk.**
- [ ] **Int-6** — Quick-switcher (`Cmd+P`) distinct from command palette. Raycast/Arc/Linear all separate "go to anything" (Cmd+P) from "do anything" (Cmd+K). New `<QuickSwitcher>` that resolves a capability-typed `quickswitch_index` per app. Depends on Int-3. **1 wk.**
- [ ] **Int-7** — Chord shortcuts + per-user aliases. Linear's `g i` / `g a` and Raycast's user-defined aliases. The `@atelier/keyboard` registry needs a chord state machine + per-user alias overlay stored in the intent vault. **1 wk on top of Int-3.**
- [x] **Int-8** — Undo toast on every destructive action. Shipped: `withUndo()` middleware in `@atelier/runtime` (Proxy-wraps any `ActionDispatcher`, fires `UndoToastEmitter.show()` on every successful undoable dispatch); `<Toast variant="undo">` baseline (countdown progress bar + `Undo` button + dismiss + dual-toned dark mode); `useUndoToastEmitter()` + `createUndoToastEmitter()` hooks in `@atelier/react` with a paired `<Sink>` host; Aurora wired (`thread.archive`, `task.complete`, `task.snooze`, `task.create_from_thread` all carry `undoable: true` + `undo_window_ms: 5000`); rollback capabilities (`thread.unarchive`, `task.reopen`, `task.unsnooze`, `task.delete`) registered. `UNDO_TOAST_AMBIENT_SATISFIER` coverage preserved.
- [ ] **Int-9** — Bulk-action floating bar. When multi-select on `List` / `Table` / `Grid` / `Queue` engages, a floating bar appears with selection count + bulk actions + Esc to dismiss. **1 wk.** Reference: Linear, Stripe events, Airtable.
- [ ] **Int-10** — Drag-and-drop file upload everywhere. New `<DropZone>` host overlay + `file.upload` capability hook. **1 wk.**
- [ ] **Int-11** — Preserved scroll + view state across nav. Linear and Slack restore scroll position when you back-navigate. New `view-state` middleware that persists per-route scroll + selection + filter to `sessionStorage` (and optionally vault). **1 wk.**
- [ ] **Int-12** — Settings search. Stripe / Slack / Notion all ship a search box at the top of settings. Depends on Int-3. **3 d.**
- [x] **Int-13** — Hover-card / preview-on-hover. Shipped in `e4f7d31` (Wave 7c).
- [ ] **Int-14** — Image / media zoom + lightbox. `<Lightbox>` primitive triggered from any `<Image>` or `<Gallery>` item. **3 d.**
- [ ] **Int-15** — Smart paste with link unfurl. **1.5 wk.** Depends on Cnt-4.

### Cnt — content rendering

- [x] **Cnt-1** — Code rendering at depth. Shipped: Shiki (de-facto standard, picked over Starry-Night) wired into `<CodeView>` + `<CodeBlock>` as an OPTIONAL peer dependency — hosts that don't render code don't pay the bundle cost; if Shiki isn't installed the dynamic import rejects and the components fall back to plain-text rendering. New `packages/components/src/code/{shiki,use-highlighted}.ts`. Lazy per-language grammar load + memoised singleton highlighter. Dual-theme render (`github-light` / `github-dark` defaults) so Vis-2 dark-mode toggling is a CSS-only paint, not a re-tokenise. New `language` / `theme` / `foldable` / `highlightLines` / `linkLines` props on `<CodeView>` (forwarded by `<CodeBlock>`). Folding kicks in past 20 lines (Vercel deploy-log pattern); `linkLines` adds `id="L<n>"` for `#L42`-style anchor scrolling; `highlightLines` emits `data-highlight="true"`. Back-compat preserved: no `language` = pre-Cnt-1 behaviour. 15 new tests in `test/code-{shiki,highlight-integration}.test.tsx`. Demo wiring deferred — no natural fit in Aurora today; will land when `<Markdown>` Cnt-5 swaps fences over.
- [ ] **Cnt-2** — Diff rendering (Linear/GitHub-style). `<DiffView>` exists; needs proper hunks, syntax-highlighted diff, side-by-side and unified modes, expand-to-context. **1.5 wk.**
- [ ] **Cnt-3** — Mention / @user / #issue / link auto-resolution. Pluggable resolver protocol, inline rendering with hover-cards. Reference: Notion @-mentions, Linear `#ENG-123` autolinks, Slack `<@user>`. **2 wk.** Depends on Int-13.
- [ ] **Cnt-4** — Embed system. Link previews, video embeds, code embeds, tweet/figma/loom embeds with detection + appropriate render. **2 wk.**
- [ ] **Cnt-5** — Markdown at Linear quality. Tighter spacing, properly themed, custom renderers per element type, integration with mentions/embeds above. **1 wk on top of Cnt-3 + Cnt-4.**
- [ ] **Cnt-6** — Slash-command menu for block creation. Notion's `/` menu — inline command palette scoped to "what kind of block do I want here". **2 wk.**
- [ ] **Cnt-7** — Block-based content editing. Notion / Coda / Tana all build documents from typed blocks. New `<BlockEditor>` composing `RichText` + `Markdown` + the block menu. Bounded scope = 8 baseline block types. **3 wk.** Depends on Cnt-6.
- [x] **Cnt-8** — Inline code-block with language detection. Shipped in `73cd9c5`.
- [ ] **Cnt-9** — Activity feed with diff visualization. Linear's activity feed renders typed events with collapse-by-default diffs. New `<ActivityFeed>` primitive consuming an `activity.list` capability shape. **2 wk.** Depends on Cnt-2.
- [ ] **Cnt-10** — Saved views / saved filters. Linear's "Active issues", Airtable's grid/kanban/calendar views. New `view_definition` schema (filters + sort + grouping + density) saved per intent profile, with shareable URL serialization. **1.5 wk.**
- [ ] **Cnt-11** — Form auto-save with version history. Notion + Coda autosave every keystroke and expose a per-doc version history with restore. **2 wk.**

### Coll — collaboration & real-time

Capabilities best-in-class apps ship that Atelier has no track for today. **Depends on a real-time transport (S-3).**

- [ ] **Coll-1** — Multiplayer presence indicators. Figma's name-tagged cursors, Linear's "X is viewing this issue" pill. New `<Presence>` primitive backed by a `presence.subscribe` capability. **1.5 wk.** Depends on S-3.
- [ ] **Coll-2** — Live cursors on canvas / list / doc surfaces. Figma-style remote cursors with smooth interpolation + name label. **2 wk.** Depends on Coll-1.
- [ ] **Coll-3** — Threaded comments anchored to content. Notion / Figma / Linear all ship comments that anchor to a specific node. New `comment_anchor` schema + `<CommentThread>` primitive. **2.5 wk.** Depends on Cnt-3.
- [ ] **Coll-4** — Real-time follow-mode / observe-mode. Figma's "follow Vid". Bounded scope: read-only follow on doc / canvas surfaces. **2 wk.** Depends on Coll-1.
- [ ] **Coll-5** — Selection halos for collaborative selection. **1 wk.** Depends on Coll-1.

### Nav — navigation & information architecture

- [ ] **Nav-1** — Multi-pane layout primitive. Slack (sidebar + main + thread), Discord (servers + channels + main + members), Linear's triage view. New `<MultiPane>` with persisted resize + collapse state. The existing `<Split>` is single-axis; this is layout-aware. **1.5 wk.**
- [ ] **Nav-2** — Sidebar persistence & collapse memory. **3 d.** Depends on Int-11.
- [ ] **Nav-3** — Sticky / pinned content within scroll regions. Slack pinned messages, Linear pinned issues at top of a list. New `pinned: true` flag on list items + sticky-render rule. **3 d.**
- [ ] **Nav-4** — Drilldown breadcrumb with shareable URLs. Stripe's "Charges › ch_xxx › Refund" breadcrumb that survives reload + share. Existing `<Breadcrumb>` is decorative; needs to wire to a route stack the host can serialize. **1 wk.**
- [ ] **Nav-5** — Project / team / workspace switcher in chrome. Vercel / Supabase / Linear all ship a top-left scope switcher. New `<ScopeSwitcher>` + `intent.scope_active` rule. **1 wk.**
- [ ] **Nav-6** — Filter syntax in top bar. Linear lets you type `assignee:me priority:high` in the top bar. New `<FilterBar>` upgrade with capability-typed parser + chip rendering. **2 wk.**

### AI — inline AI surfaces

The Notion-AI / Tome / Gamma generation surface is its own track. Atelier's compiler is already AI-native; what's missing is the **end-user-facing AI** that lives inside content surfaces.

- [ ] **AI-1** — "Ask AI" on selection. Notion's "Ask AI" + "Summarize" + "Improve writing" floating bar over selected text. New `<SelectionActionBar>` + capability-typed prompt registry per surface. **2 wk.** Depends on Cnt-7.
- [ ] **AI-2** — Slash-command AI shortcuts in editors. `/summarize` / `/translate` / `/brainstorm` inside the slash menu. **1 wk.** Depends on Cnt-6 + AI-1.
- [ ] **AI-3** — AI-generated layouts (Tome / Gamma model). Given a prompt, generate a multi-block doc / slide deck using the existing compiler — but with end-user-visible regenerate / restyle / expand affordances. **2.5 wk.** Depends on AI-1 + P-3.
- [ ] **AI-4** — Inline AI chat docked to surface. Raycast-style chat that has read-context of the current capability bindings. **2 wk.**

**Realistic budget for world-class web app parity:** Wave 11 ≈ **6-10 months of focused work** on top of Waves 7-10, depending on whether the Coll track ships (real-time transport is the gating dependency). Most of the perceived-quality gap on solo surfaces still closes by **adding more skills + brand-kit depth** rather than writing more TypeScript — but Coll, Cnt-7 (block editor), AI-1, and the Nav layout primitives are real implementation work.

---

## Wave 12+ — Multi-platform + marketing

Kept on the roadmap; not on the personalised-web critical path. The marketplace pivot (Wave M) makes these substantially cheaper because every retired custom is one less component to re-implement per platform.

- [ ] **N-1** — iOS SwiftUI native renderer. **4-6 wk.**
- [ ] **N-2** — Android Jetpack Compose native renderer. **4-6 wk.**
- [ ] **N-3** — React Native bindings (cheaper bridge — share more with `@atelier/react`). **2-3 wk.**
- [x] **N-4** — Marketing site / public docs. Astro + GitHub Pages. **Shipped `fe240d5`** — `apps/marketing/` (5 pages: `/`, `/ethos`, `/start`, `/architecture`, `/demos`), `actions/deploy-pages@v4` workflow at `.github/workflows/marketing-deploy.yml`, vanilla CSS + `prefers-color-scheme` dark mode. **User must enable** Settings → Pages → Source: GitHub Actions before the deploy step fires; build validates on PR regardless.
- [ ] **N-5** — Cross-platform component variant authoring (one source → web + native). **2 wk.**

---

## Operational + hardening debt

Bounded items, do anytime. Most can fold into a single sprint.

### Compiler / runtime hardening

- [ ] **`ManifestFetcher` Zod-validation on response body.** `ManifestResolver`'s optional `validate` is the only client-side defense today. Acceptable layering; revisit when the host-vs-runtime trust boundary is finalized.
- [ ] **`IndexedDBManifestCache` runtime sanity check on read.** Casts stored values without parse. Add defensive parse on `get` if we widen the threat model to "attacker who can write to the user's IDB".
- [ ] **`ActionDispatcher` Zod-validate input against `capability.input`.** Host is on the hook for shape validation. Documented intentionally; revisit if the dispatcher should run a Zod-ish parse.
- [ ] **IndexedDB LRU eviction is O(n) per write.** Fine at the default cap of 200 entries; revisit with byte-accounting work.
- [ ] **Sign capabilities/skills artifacts at publish time** per [`docs/production-concerns.md`](docs/production-concerns.md). Needs a key-management decision.
- [x] **TS2352 / TS2493 in `packages/compiler/test/gemini-compiler.test.ts`** lines 75 + 96. Surfaced after `2998b2c` removed the TS5097 short-circuit. Fixed inline during C-2.

### Detector + adapter scaffolding

- [ ] **Behavioral pattern detector implementations.** The `BehavioralPatternDetector` interface and `NoopBehavioralDetector` ship; no real detector heuristics ship.
- [ ] **Live-query subscriptions.** SWR + optimistic UI cover the common cases today; live subscriptions are future work. Closes alongside S-3.
- [ ] **Cross-app workflow compilation.** Single-app compile is shipped; "Gmail + Calendar + Linear in one lens" needs a neutral compiler host. See [`docs/open-questions.md`](docs/open-questions.md) §1.

### Tooling + observability

- [x] **Audit endpoint in the demo.** Wave 7c track B.
- [ ] **`@atelier/react/debug` host-side smoke test.** The subpath export is wired and the panel renders; the end-to-end developer experience (drop into a fresh Next.js app, see live events) hasn't been smoke-tested outside the monorepo.
- [ ] **`atelier init` standalone-publish hardening.** Today `atelier init` and `atelier components-sync` assume the Atelier monorepo layout. npm-installable templates and host-project pre-flight are roadmap.
- [ ] **Vite support in `atelier init`.** Hardcoded to Next.js 15 today.
- [ ] **`atelier validate` host pre-flight.** Today shells out to `pnpm validate` blindly.
- [ ] **Eval harness wired into `pnpm validate`.** Will flip on once enough scenarios are load-bearing.

### Operational findings (from Wave 6 fan-out)

- [ ] **JSON Schema export sanity check.** `pnpm schemas:dump` regenerates `.well-known/schemas/*.json` from Zod via `toJsonSchema`. Default output sometimes uses formats AJV strict mode rejects. Add CI step that loads each generated schema through AJV strict and fails on rejection.
- [x] **Worktree isolation for parallel agents.** Implicitly resolved in Wave M — the marketplace-pivot agent fan-out used `isolation: 'worktree'` and rebased on push, eliminating cross-track contamination.
- [x] **lint-staged worktree-stash leak.** During the Wave 11 batch (Vis-7 / P-7 / Int-2 fan-out) noticed that `lint-staged`'s `git stash --include-untracked` swept in OTHER linked-worktrees' untracked files. Documented in `.husky/pre-commit` with mitigation guidance for agents (use explicit-path `git add` not `git add -A`); structural fix would be lint-staged supporting per-worktree stash isolation OR agents using non-linked worktrees.
- [x] **Commitlint scope-enum** updated to include `keyboard`, `react`, `data-resolvers`, `capability-resolver`, `vault-server`, `vault-client`, `marketing`. Int-3 had to use `components` as a workaround for the keyboard package's commit; the gap is now closed.
- [x] **Rename verification gap.** During the cir → atelier rename (`7e8909a`), the agent's `grep -rln "@cir/"` silently skipped 3 files containing NUL/binary bytes. Hotfix at `3fa9569` used `grep -a`. Documented: rename-style codemod agents should use `grep -a` (treat-binary-as-text) AND run a build, since the test suite alone doesn't catch unresolved imports when stale dist artifacts mask the regression.
- [ ] **Skill markdown YAML strictness.** A few skill files in Wave 6 shipped briefly with malformed YAML frontmatter. `parseSkillMarkdown` could surface a clearer error message; `atelier lint skill <path>` could front-run validation.
- [ ] **`BehaviorPatternDetectedTrigger` schema variant.** V-4 ships `SequenceDetector` emitting `behavior.workaround_detected` because `behavior.pattern_detected` doesn't exist yet in `TriggerSchema`. These are different concepts — promote-to-recipe should not fire on workarounds. Add the new variant in the consolidation pass.

### Marketplace + ecosystem (legacy items, mostly subsumed)

- [ ] **Marketplace for community recipes** — covered by Wave 8 V-6 + Wave C / Phase C-5 (RAG-flavored recipe retrieval).
- [ ] **Mobile + native render runtimes** — covered by Wave 12+ N-1 / N-2 / N-3.
- [x] **Additional demo apps** — `apps/demo-dummyjson` and `apps/demo-github` shipped; both at zero customs post-marketplace-pivot.

### Component-variants follow-up

- [ ] **Variants for the remaining 32 components** — see Wave 11 / Vis-4. Less work after the marketplace pivot.
- [ ] **Component-variants demo / Storybook.** No Storybook in this pass; a dedicated visual gallery (Storybook or a custom MDX route in `apps/demo`) is roadmap.
