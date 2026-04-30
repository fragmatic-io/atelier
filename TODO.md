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

### Wave 11 — visual depth (path to world-class web app UI)

CIR today produces competent, on-brand professional UIs. Reaching the perceived quality of best-in-class web apps requires ~5 additive waves — Vis (visual system), Int (interaction), Cnt (content rendering), Coll (collaboration / real-time), and AI (inline AI surfaces). None of it re-architects; each track adds a polish dimension. The original Linear/Supabase parity scope was deliberately broadened into a **10-app survey** so the catalog covers the breadth of what users now expect from production web tools.

#### Reference apps surveyed

These are the durable reference points for every item below. Each entry names the specific UX trait that earned its place in this list.

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

#### Vis — visual system

- [ ] **Vis-1 — Typography depth.** Extend `BrandTokensSchema` with `letter_spacing` scale, `line_height` scale, OpenType feature settings (tabular numerals, ligatures, optical sizing, fractions). Tailwind config bridges to CSS. Reference: Linear + Stripe both use tabular numerals across all numeric cells. **1 wk.**
- [ ] **Vis-2 — Dark mode as a real surface across all 56 components.** Today only `data-color-mode` is mirrored on `<html>`. Need every component to ship paired dark/light Tailwind class variants, pair-tested screenshots, and dark-tuned shadows / borders (Supabase-style elevated surfaces don't reuse light-mode shadow tokens). **1.5 wk.**
- [ ] **Vis-3 — Icon resolver + `<Icon>` component.** `iconography.allowed_sets` declares which packs are allowed; need a real `<Icon set="lucide" name="archive" />` resolver layer + integration so components like `<Button icon="archive">` work without authoring per-component icon props. Reference: Linear renders ~120 distinct icons across the app from a single set with consistent stroke-width. **1 wk.**
- [ ] **Vis-4 — Variant pass for the remaining 32 components.** Wave 6 P-10 covered 24/56. The other 32 (inputs, charts, navigation primitives, niche specialised) need the same `variant` + `size` treatment for visual consistency. **2 wk.**
- [ ] **Vis-5 — Custom illustration support.** `<EmptyState>` ships as text + button. Linear/Notion-grade empty states use mascots, custom artwork, situation-specific tone. Need an illustration registry + `<EmptyState illustration="inbox-zero">` integration. Asset work + render plumbing. **2 wk.**
- [ ] **Vis-6 — Density toggles per surface.** Stripe and Linear both ship a compact / cozy / comfortable density mode that re-scales row height, font size, and padding. New `density: 'compact'|'cozy'|'comfortable'` token plus a `density-aware` skill that propagates to `List`, `Table`, `Grid`, `DetailView`, `KPIRow`. **1 wk on top of Vis-1.**
- [ ] **Vis-7 — Elevation / surface system.** Today shadow is one-shot. Need a 5-step elevation token scale (resting / hover / popover / modal / commandbar) with paired light-and-dark shadow recipes. Reference: Figma's right-panel uses elevation-2 vs the canvas elevation-0; modal is elevation-4. **3 d on top of Vis-2.**
- [ ] **Vis-8 — Skeleton-as-shape, not as block.** `<Skeleton>` today is a single grey rectangle. Best-in-class apps (Linear, Stripe) ship per-component skeleton shapes that match the real layout (avatar circle + two-line stack, table-row with 5 column blocks). Each of the 8 specialized components gets a `Skeleton` variant. **1 wk.**
- [ ] **Vis-9 — Status / system-health bar.** Vercel and Stripe persistently surface deploy / system status in the chrome. New `<StatusBar>` primitive that subscribes to a `system.status` capability and renders a coloured pill (operational / degraded / incident) with click-through. **3 d.**
- [ ] **Vis-10 — Notification badge system.** Slack/Discord/Linear all ship grouped per-domain badges (workspace badge → channel badge → mention vs message distinction). New `notification` token group + `<Badge count grouping>` integration with the sidebar/nav. **1 wk.** Depends on Vis-9.

#### Int — interaction depth

- [ ] **Int-1 — Motion layer extension** beyond Wave 7 P-7. Per-component entry/exit animations (modal slide-in, list stagger, drawer slide-from-edge), data-update animations (row shimmer on update, badge pulse on increment, count tick-up easing), respect `motion.duration_scale` from BrandKit. Linear's "0.16x" scale is the reference. **2 wk on top of P-7.**
- [ ] **Int-2 — `<Tooltip>` primitive with proper timing.** 400ms initial delay, 100ms re-show delay (sticky window), 8px offset, smart re-positioning across viewport edges, fade in 100ms. The `tooltip-tone` skill exists but no primitive backs it. **3 d.**
- [ ] **Int-3 — Global keyboard registry + Cmd+K command palette everywhere.** New `@cir/keyboard` package, `<CommandPalette>` integrates with capability registry (every capability becomes a discoverable action), per-user action recency weighting (Linear-style), hint chips render on first-use. **2 wk.**
- [ ] **Int-4 — Optimistic UI wired by default.** `useOptimisticAction` exists; today it's opt-in. Make it the default for any capability that declares `reversible: true` + `low_stakes: true`. **3 d.**
- [ ] **Int-5 — Onboarding microinteractions.** Product-tour highlight chips, completion progress, contextual "you're done" celebrations. New `<TourStep>` primitive + skill. **1.5 wk.**
- [ ] **Int-6 — Quick-switcher (`Cmd+P`) distinct from command palette.** Raycast/Arc/Linear all separate "go to anything" (Cmd+P, fuzzy across resources) from "do anything" (Cmd+K, fuzzy across actions). New `<QuickSwitcher>` that resolves a capability-typed `quickswitch_index` per app. Depends on Int-3. **1 wk.**
- [ ] **Int-7 — Chord shortcuts + per-user aliases.** Linear's `g i` / `g a` and Raycast's user-defined aliases. The `@cir/keyboard` registry needs a chord state machine + per-user alias overlay stored in the intent vault. **1 wk on top of Int-3.**
- [ ] **Int-8 — Undo toast on every destructive action.** Linear ships an undo toast with a 5s window for archive/delete/move. New `withUndo()` middleware on `ActionDispatcher` + capability `undoable: true` flag + `<Toast variant="undo">`. **1 wk.**
- [ ] **Int-9 — Bulk-action floating bar.** When multi-select on `List` / `Table` / `Grid` engages, a floating bar appears with selection count + bulk actions (archive, move, delete) + Esc to dismiss. Reference: Linear, Stripe events, Airtable. **1 wk.**
- [ ] **Int-10 — Drag-and-drop file upload everywhere.** Notion/Slack/Discord let you drop a file anywhere in the chrome, with a viewport-edge halo as drop indicator. New `<DropZone>` host overlay + `file.upload` capability hook. **1 wk.**
- [ ] **Int-11 — Preserved scroll + view state across nav.** Linear and Slack restore scroll position when you back-navigate; Slack remembers per-channel scroll across reloads. New `view-state` middleware that persists per-route scroll + selection + filter to `sessionStorage` (and optionally vault). **1 wk.**
- [ ] **Int-12 — Settings search.** Stripe / Slack / Notion all ship a search box at the top of settings that fuzzy-matches into deep pages. The intent profile knows which scopes are settings; `<SettingsSearch>` builds an index per surface. **3 d.** Depends on Int-3.
- [ ] **Int-13 — Hover-card / preview-on-hover.** Linear's `#issue` hover-cards, Notion's @-mention previews, Raycast's two-pane preview. New `<HoverCard>` primitive with 350ms open / 150ms close + capability-driven content slot. **3 d.**
- [ ] **Int-14 — Image / media zoom + lightbox.** Notion, Slack, Discord all open images into a focused zoom view with arrow-key nav and download. `<Lightbox>` primitive triggered from any `<Image>` or `<Gallery>` item. **3 d.**
- [ ] **Int-15 — Smart paste with link unfurl.** When a URL is pasted into a `RichText` / `Form` field with `paste_smart: true`, the host fetches an unfurl preview and renders a card. Notion + Slack reference. **1.5 wk.** Depends on Cnt-4.

#### Cnt — content rendering

- [ ] **Cnt-1 — Code rendering at depth.** Syntax highlighting (Shiki or Starry-Night), fold, line references, inline comments. `<CodeView>` today is a `<pre>` with a class. Reference: Vercel logs, Stripe API examples, Supabase SQL editor preview. **2 wk.**
- [ ] **Cnt-2 — Diff rendering** (Linear/GitHub-style). `<DiffView>` exists; needs proper hunks, syntax-highlighted diff, side-by-side and unified modes, expand-to-context. **1.5 wk.**
- [ ] **Cnt-3 — Mention / @user / #issue / link auto-resolution.** Pluggable resolver protocol (per-app dictionary), inline rendering with hover-cards. Reference: Notion @-mentions, Linear `#ENG-123` autolinks, Slack `<@user>`. **2 wk.** Depends on Int-13.
- [ ] **Cnt-4 — Embed system.** Link previews, video embeds, code embeds, tweet/figma/loom embeds with detection + appropriate render. **2 wk.**
- [ ] **Cnt-5 — Markdown at Linear quality.** Tighter spacing, properly themed, custom renderers per element type, integration with mentions/embeds above. **1 wk on top of Cnt-3 + Cnt-4.**
- [ ] **Cnt-6 — Slash-command menu for block creation.** Notion's `/` menu — inline command palette scoped to "what kind of block do I want here". New `<BlockMenu>` primitive that subscribes to a `block_kinds` registry per surface (so a doc surface and a chat surface get different menus). **2 wk.**
- [ ] **Cnt-7 — Block-based content editing.** Notion / Coda / Tana all build documents from typed blocks (paragraph, heading, callout, toggle, code, embed). New `<BlockEditor>` composing `RichText` + `Markdown` + the block menu. Likely larger than estimated; bounded scope = 8 baseline block types. **3 wk.** Depends on Cnt-6.
- [ ] **Cnt-8 — Inline code-block with language detection.** Slack/Discord/Notion all detect language on triple-backtick paste. New `detectLanguage()` helper + `<CodeBlock>` variant of `CodeView`. **3 d.** Depends on Cnt-1.
- [ ] **Cnt-9 — Activity feed with diff visualization.** Linear's activity feed renders typed events ("changed status", "added label") with collapse-by-default diffs. Stripe's events log renders structured payload diffs. New `<ActivityFeed>` primitive consuming a `activity.list` capability shape. **2 wk.** Depends on Cnt-2.
- [ ] **Cnt-10 — Saved views / saved filters.** Linear's "Active issues", Airtable's grid/kanban/calendar views, Stripe's saved searches. New `view_definition` schema (filters + sort + grouping + density) saved per intent profile, with shareable URL serialization. **1.5 wk.**
- [ ] **Cnt-11 — Form auto-save with version history.** Notion + Coda autosave every keystroke and expose a per-doc version history with restore. New `auto_save: true` form policy + `version.list` capability shape. **2 wk.**

#### Coll — collaboration & real-time (new)

Capabilities best-in-class apps ship that CIR has no track for today. Depends on a real-time transport (S-3 Streaming subscriptions in Wave 10).

- [ ] **Coll-1 — Multiplayer presence indicators.** Figma's name-tagged cursors, Linear's "X is viewing this issue" pill. New `<Presence>` primitive backed by a `presence.subscribe` capability. **1.5 wk.** Depends on S-3.
- [ ] **Coll-2 — Live cursors on canvas / list / doc surfaces.** Figma-style remote cursors with smooth interpolation + name label. **2 wk.** Depends on Coll-1.
- [ ] **Coll-3 — Threaded comments anchored to content.** Notion / Figma / Linear all ship comments that anchor to a specific node (paragraph, layer, line). New `comment_anchor` schema + `<CommentThread>` primitive. **2.5 wk.** Depends on Cnt-3.
- [ ] **Coll-4 — Real-time follow-mode / observe-mode.** Figma's "follow Vid" feature mirrors another user's viewport. Bounded scope: read-only follow on doc / canvas surfaces. **2 wk.** Depends on Coll-1.
- [ ] **Coll-5 — Selection halos for collaborative selection.** When someone else has a row selected in a list or a layer in a canvas, render a coloured outline keyed to their presence color. **1 wk.** Depends on Coll-1.

#### Nav — navigation & information architecture (new)

These pull layout / navigation patterns out of "interaction" into a track of their own — they're enough work and have enough cross-cutting consequences that conflating them with Int hides cost.

- [ ] **Nav-1 — Multi-pane layout primitive.** Slack (sidebar + main + thread), Discord (servers + channels + main + members), Linear's triage view (filters + list + detail). New `<MultiPane>` with persisted resize + collapse state. The existing `<Split>` is single-axis; this is layout-aware. **1.5 wk.**
- [ ] **Nav-2 — Sidebar persistence & collapse memory.** Linear's sidebar collapses with `[`, remembers state per user. Slack remembers per-workspace. Persisted to vault when present, sessionStorage otherwise. **3 d.** Depends on Int-11.
- [ ] **Nav-3 — Sticky / pinned content within scroll regions.** Slack pinned messages, Linear pinned issues at top of a list, Notion pinned blocks. New `pinned: true` flag on list items + sticky-render rule. **3 d.**
- [ ] **Nav-4 — Drilldown breadcrumb with shareable URLs.** Stripe's "Charges › ch_xxx › Refund" breadcrumb that survives reload + share. Existing `<Breadcrumb>` is decorative; needs to wire to a route stack the host can serialize. **1 wk.**
- [ ] **Nav-5 — Project / team / workspace switcher in chrome.** Vercel / Supabase / Linear all ship a top-left scope switcher that re-scopes the entire app. New `<ScopeSwitcher>` + `intent.scope_active` rule. **1 wk.**
- [ ] **Nav-6 — Filter syntax in top bar.** Linear lets you type `assignee:me priority:high` in the top bar; Airtable has filter chips. New `<FilterBar>` upgrade with capability-typed parser + chip rendering. **2 wk.** (`<FilterBar>` exists today as a chip strip; this adds parse + autocomplete.)

#### AI — inline AI surfaces (new)

The Notion-AI / Tome / Gamma generation surface is its own track. CIR's compiler is already AI-native; what's missing is the **end-user-facing AI** that lives inside content surfaces.

- [ ] **AI-1 — "Ask AI" on selection.** Notion's "Ask AI" + "Summarize" + "Improve writing" floating bar over selected text. New `<SelectionActionBar>` + capability-typed prompt registry per surface. **2 wk.** Depends on Cnt-7.
- [ ] **AI-2 — Slash-command AI shortcuts in editors.** `/summarize` / `/translate` / `/brainstorm` inside the slash menu. **1 wk.** Depends on Cnt-6 + AI-1.
- [ ] **AI-3 — AI-generated layouts (Tome / Gamma model).** Given a prompt, generate a multi-block doc / slide deck using the existing compiler — but with end-user-visible regenerate / restyle / expand affordances. Already adjacent to P-3 (refinement loop) but the surface is different: it's a creation flow, not a tweak. **2.5 wk.** Depends on AI-1 + P-3.
- [ ] **AI-4 — Inline AI chat docked to surface.** Raycast-style chat that has read-context of the current capability bindings. **2 wk.**

**Realistic budget for world-class web app parity:** Waves 11–15 ≈ **6–10 months of focused work** on top of Waves 7–10, depending on whether the Coll track ships (real-time transport is the gating dependency). The tracks are bounded and mostly additive: Vis + Int + Cnt close the perceived-quality gap on solo-user surfaces; Nav restructures layout for multi-pane apps; Coll opens collaborative surfaces (gated on S-3); AI overlays end-user generation on top of any surface. Most of the perceived-quality gap on solo surfaces still closes by **adding more skills + brand-kit depth** rather than writing more TypeScript — but Coll, Cnt-7 (block editor), AI-1, and the Nav layout primitives are real implementation work.

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
