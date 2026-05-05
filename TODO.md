# TODO

> Single source of truth. Updated 2026-05-04 (production-readiness reprioritisation following external review).
>
> **Top priority: production readiness, not feature expansion.** A green `pnpm test` does not offset a broken `pnpm validate` gate. Every advertised command, env-gated path, and package export must work for an external consumer.
>
> Historical record: [`docs/build-plan.md`](docs/build-plan.md) and the `What's shipped` section at the bottom of this file.

---

## The thesis

A 2026-05-04 external review summarised the project as:

> "Closer to an early platform kernel than a toy. Strong as research / product prototype. Internal dogfood possible after fixing validation and demo boot paths. **External production framework: not yet.** Production app today: only if narrow, heavily controlled, and the compiler is treated as advisory with deterministic fallback."

Bands below sequence what it would take to flip "external production framework" from **not yet** to **yes**.

---

## Reading guide

Bands ordered top→bottom by what closes the gap fastest. Within a band, items are in execution order.

| Band    | Bucket                                                                                     | What it closes                                               | Time-box |
| ------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------ | -------- |
| **P0**  | [Validation gate integrity](#p0--validation-gate-integrity)                                | Every advertised command works on a fresh clone              | <1 wk    |
| **P1**  | [Productionise env-gated paths](#p1--productionise-env-gated-paths)                        | 6 `CIR_*_ENABLED` flags become defaults or get deleted       | 1-2 wk   |
| **P2**  | [Consumer DX](#p2--consumer-dx)                                                            | Packages publishable + installable outside the monorepo      | 2-3 wk   |
| **P3**  | [Real-LLM evidence](#p3--real-llm-evidence)                                                | Eval suite proves the LLM compile actually produces good UIs | 2-3 wk   |
| **P4**  | [Visual regression matrix](#p4--visual-regression-matrix)                                  | 83-component catalog gets a visual gallery + diff CI         | 1-2 wk   |
| **P5**  | [Demo boot paths](#p5--demo-boot-paths)                                                    | Demos exercise real LLM compiles by default, not fallback    | 1 wk     |
| **P6**  | [SemVer + public API contracts](#p6--semver--public-api-contracts)                         | Each `@atelier/*` package has a frozen public surface        | 1-2 wk   |
| **P7**  | [Stability + op-debt cleanups (carry-overs)](#p7--stability--op-debt-cleanups-carry-overs) | Branch protection, gray-matter cache bug, etc.               | <1 wk    |
| **P8**  | [Compile-quality follow-ups](#p8--compile-quality-follow-ups)                              | P1.4 plumbing items, cross-app workflow                      | 1-2 wk   |
| **P9**  | [Wave 11 polish remaining](#p9--wave-11-polish-remaining)                                  | Vis / Int / Cnt / Nav / Coll / AI long tail                  | 4-6 mo   |
| **P10** | [Personalisation continuity](#p10--personalisation-continuity)                             | P-3 / P-4 / P-7                                              | 3 wk     |
| **P11** | [Multi-platform & long tail](#p11--multi-platform--long-tail)                              | iOS / Android / RN / cross-platform variants                 | 12-16 wk |

> **Naming note (marketplace).** Two distinct things share the word "marketplace":
>
> - **The catalog** — baseline primitives + recipes + brand kits + skills. The product. Wave M / ETHOS principle #11 ("baseline-first") was about this.
> - **The vault marketplace** — distribution channel (`atelier://author/persona@version`, ed25519, TOFU). V-6 in Wave 8.
>
> Unqualified "marketplace" means the distribution channel.

---

## P0 — Validation gate integrity

**The advertised CI gate must pass on a fresh clone, every time.** A broken `pnpm validate` is a credibility bug; everything else can wait.

### P0.1 — `pnpm validate` survives a fresh clone (CONFIRMED FAILING earlier today)

The review's headline issue: `scripts/marketplace-eval.ts` line 40 imports `@atelier/eval-marketplace`, but the workspace symlink wasn't populated until `pnpm install` ran. Reproduced + fixed locally; need a permanent guardrail.

- [x] **Stale `marketing:dev` / `marketing:build` script refs removed** from root `package.json`. `c3c0a46`.
- [x] **CI job that runs `pnpm install --frozen-lockfile && pnpm validate` from a clean checkout.** New `validate-fresh-clone` job in `.github/workflows/ci.yml` runs the unified `pnpm validate` script exactly as an external consumer would. If split-step CI passes but this fails, an advertised command is broken — that's the bug we're now guarding against. _This commit._
- [x] **Coverage thresholds reflowed to current measured numbers** with a ratchet-back-up note in vitest.config.ts. CI is green again so branch protection can require it. _This commit._
- [ ] **`pnpm install` runs as part of the husky `prepare` step OR the pre-push hook detects a stale `node_modules/@atelier/*` symlink set and fails fast.** Stops "validate fails because workspace symlinks are stale" recurring on agents. **<1 d.**
- [ ] **Audit every script in root `package.json`** — does each advertised command produce the documented behaviour? Document or delete the ones that don't. **<1 d.**
- [x] **Ratchet coverage thresholds back up (2026-05-04).** Closed for **schemas**, **runtime**, **compiler**; partially closed for **components** + **react** (lines/statements still 2pp below original; small branch / function gaps tracked under Wave 11 polish, not P0). Tests added: `packages/compiler/test/{generic-fallback,gemini-agent-client}.test.ts` (new); `packages/runtime/test/actions/rate-limiter.test.ts` (new — file went 0→100% coverage); `packages/runtime/test/transports/sse-trigger-transport-unit.test.ts` (new — covers all publish/subscribe error branches); `packages/runtime/test/registry/component-registry.test.ts` (added 3 helper-fn suites); `packages/components/test/lib/detect-language.test.ts` (new — heuristics file 61→98%); `packages/react/test/use-{data-pulse,shimmer-on-change,tween-number}.test.tsx` (new); `packages/compiler/test/budget-meter.test.ts` (added BudgetMeter class suite + composite-compiler budget-integration paths); `packages/compiler/test/gemini-compiler.test.ts` (added policyFixGuidance retry-message branches); `packages/schemas/test/{marketplace,skill-parser,skill-parser-mock}.test.ts` (added canonicalEncode + non-YAMLException branches). New thresholds in `vitest.config.ts` (per package, lines/functions/branches/statements):
  - **schemas** branches 74 → **96** (above original 95)
  - **runtime** 91/90/85/91 → **95/95/87/95** (lines/statements 1pp below original 96; branches 1pp below original 88)
  - **components** 93/88/84/93 → **93/88/85/93** (branches back to original 85; lines/statements held at 93, 2pp below original 95 — Wave 11 polish closes the remainder)
  - **react** 87/90/84/87 → **92/90/84/92** (lines/statements 2pp below original 94; branches 4pp below original 88 — saved-view URL-parse branches uncovered, Wave 11)
  - **compiler** 80/91/81/80 → **95/94/86/95** (lines/statements back to original; branches now ABOVE original 81; functions 1pp below original 95)

### P0.2 — Hooks that don't surprise

- [x] **lint-staged worktree-stash leak** — `--no-stash` mode. `dc70a44`.
- [ ] **`pre-push` runs full-monorepo `validate:fast` (~60 s)** — move to per-package gate or staged-only so push isn't a barrier. **<1 d.**
- [ ] **Per-script README** — `package.json` script names are pithy; add a comment block at the top of `package.json` (or a `docs/scripts.md`) documenting what each script does. Stops developers from running blindly. **<1 d.**

### P0.3 — Schema + dispatcher hardening (already shipped — keep validated)

- [x] **AJV strict-mode CI gate.** `a82ce2c`.
- [x] **Runtime Zod hardening** (manifest fetch + IDB + dispatcher input). `240cede`.
- [x] **Skill YAML strictness + `atelier lint skill <path>`.** `6829018`.
- [x] **4 pre-existing test failures + use-optimistic-action TS errors.** `6d1bbad` + `07cf04d`.

### P0.4 — Repo-owner manual items

- [x] **Branch protection on `main`** — applied via `gh api -X PUT .../branches/main/protection` on 2026-05-04. Required status checks: `Validate (Node 22)`, `Validate (Node 24)`, `Validate (fresh clone, unified pnpm validate)`, `commitlint`. `strict: true` (PRs must be up-to-date with main before merge). 1 approving review required, dismiss stale reviews on push. No force-push, no deletion. Required linear history. Required conversation resolution. _This commit._
- [ ] **Project board / discussions / wiki** — enable once team grows. _Repo-owner action._

---

## P1 — Productionise env-gated paths

**13 `CIR_*` env vars** in the codebase today. The review's main critique: experimental paths live behind flags nobody runs by default, which means they bitrot, double the test surface, and let docs lie about what's "shipped". Each gate gets a binary decision.

### Inventory (every gate today)

| Env var                                                                       | Gates                                 | Decision                                                                              |
| ----------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------- |
| `CIR_COMPILER_TOOLS_ENABLED`                                                  | C-2 tool-using compiler in apps/demo  | ✅ **Flipped to default** in `d4fe259`. Opt-out: `ATELIER_COMPILER_TOOLS=off`.        |
| `CIR_CAPABILITY_RESOLVER_ENABLED`                                             | P1.1 capability-resolver in apps/demo | ✅ **Flipped to default** _this commit_. Opt-out: `ATELIER_CAPABILITY_RESOLVER=off`.  |
| `CIR_CAPABILITY_SCOPING_ENABLED`                                              | Two-stage compile pipeline            | ✅ **Flipped** in `d4fe259` (folded under `ATELIER_COMPILER_TOOLS=off`).              |
| `CIR_RECIPE_RAG_ENABLED`                                                      | C-5 recipe RAG in apps/demo           | ✅ **Flipped to default** _this commit_. Opt-out: `ATELIER_RECIPE_RAG=off`.           |
| `CIR_MARKETPLACE_ENABLED`                                                     | V-6 endpoints in vault-server         | ✅ **Flipped to default** _this commit_. Opt-out: `ATELIER_MARKETPLACE=off`.          |
| `CIR_COMPILE_BUDGET_ENABLED`                                                  | S-6 compile-budget enforcement        | ✅ **Flipped to default** _this commit_. Opt-out: `ATELIER_COMPILE_BUDGET=off`.       |
| `CIR_COMPILE_BUDGET_*` (CALLS_PER_HOUR / TOKENS / TOKENS_PER_DAY / WINDOW_MS) | Budget thresholds                     | **Keep as config** (legitimate tuning knob); rename to `ATELIER_*` next release.      |
| `CIR_SCOPING_MODEL`                                                           | Stage-1 model name                    | **Keep as config** (legitimate); rename to `ATELIER_*` next release.                  |
| `CIR_DIFF_BASE`                                                               | Eval diff base                        | **Keep as config**; rename to `ATELIER_*` next release.                               |
| `CIR_EMBEDDING_TESTS`                                                         | Heavy embedding tests                 | ✅ **Renamed** to `ATELIER_EMBEDDING_TESTS` _this commit_; legacy honoured 1 release. |

### P1.1 — Default-on the `_ENABLED` group, delete the gates

For each of the six `_ENABLED` flags:

- [x] **`CIR_COMPILER_TOOLS_ENABLED` → default-on.** ToolUsingCompiler is now the default production compiler in `apps/demo` + `apps/demo-github`. Opt-out via `ATELIER_COMPILER_TOOLS=off` for hosts that need the deterministic single-shot path. Legacy `CIR_COMPILER_TOOLS_ENABLED=0` honoured for one release cycle. Same flip applied to `CIR_CAPABILITY_SCOPING_ENABLED` (folded — only meaningful when tools are enabled). `d4fe259`.
- [x] **`CIR_CAPABILITY_RESOLVER_ENABLED` + `CIR_CAPABILITY_SCOPING_ENABLED` → merge + default-on.** `SubstringCapabilityResolver` baseline wired by default in `apps/demo`. Opt-out via `ATELIER_CAPABILITY_RESOLVER=off`; legacy `CIR_CAPABILITY_RESOLVER_ENABLED=0` honoured for one release cycle. _This commit._
- [x] **`CIR_RECIPE_RAG_ENABLED` → default-on** with `LocalRecipeStore` + `SubstringRecipeResolver`. Opt-out via `ATELIER_RECIPE_RAG=off`; legacy `CIR_RECIPE_RAG_ENABLED=0` honoured for one release cycle. _This commit._
- [x] **`CIR_MARKETPLACE_ENABLED` → default-on** in vault-server. V-6.a/b/c/d/e/f all shipped with full test coverage. Opt-out via `ATELIER_MARKETPLACE=off`; legacy `CIR_MARKETPLACE_ENABLED=0` honoured for one release cycle. _This commit._
- [x] **`CIR_COMPILE_BUDGET_ENABLED` → default-on** in apps/demo. Every production host needs cost limits. Opt-out via `ATELIER_COMPILE_BUDGET=off`; legacy `CIR_COMPILE_BUDGET_ENABLED=0` honoured for one release cycle. Threshold knobs (`CIR_COMPILE_BUDGET_*`) stay as `CIR_*` for one release. _This commit._
- [x] **`CIR_EMBEDDING_TESTS` → `ATELIER_EMBEDDING_TESTS`** (test-suite gate, not a feature flag). Legacy honoured for one release cycle. _This commit._

### P1.2 — Rename surface

- [ ] **All `CIR_*` env vars renamed to `ATELIER_*`** (consistent with the package rename). The 5 `_ENABLED` flags + `CIR_EMBEDDING_TESTS` are done (P1.1, _this commit_); the tuning knobs (`CIR_COMPILE_BUDGET_*`, `CIR_SCOPING_MODEL`, `CIR_DIFF_BASE`) remain. Old names accepted with a one-release-cycle deprecation warning. **<1 d.**

### P1.3 — Document the surface

- [x] **`apps/docs/src/content/docs/operations/env-vars.mdx`** — every supported env var, default, valid range, what it gates, and the deprecation timeline for the legacy `CIR_*` names. _This commit._

---

## P2 — Consumer DX

**All 15 packages currently export `./src/index.ts` directly.** This works in-monorepo because pnpm + tsx + vitest read TS directly. It does NOT work for an external consumer who installs `@atelier/runtime` from npm — they get raw TypeScript that their build pipeline must compile, which is often a non-starter for downstream apps.

### P2.1 — Build artifacts on every package

- [x] **Pilot: `@atelier/schemas`** ships built artifacts. `packages/schemas/package.json` now declares `"main": "./dist/index.js"` + `"types": "./dist/index.d.ts"` + a conditional `exports` map; `packages/schemas/tsconfig.build.json` drives `tsc -b` to emit JS + `.d.ts` + sourcemaps. Root `pnpm build` is filter-scoped to schemas; in-repo workspace symlinks resolve through `dist/`. CI builds before tests so the test suite consumes the same artefact downstream npm consumers will. _This commit._
- [x] **Smoke test gate.** `scripts/smoke-test-pack.ts` packs `@atelier/schemas`, installs the tgz into a scratch dir with bare `npm install`, runs `tsc --noEmit` over a tiny consumer that imports both runtime + type exports, then loads the runtime under bare Node — no `tsx` / `ts-node` involved. New `Smoke-test @atelier/schemas pack + install` step in CI gates the merge. _Original schemas-only commit._
- [x] **Sprint 1.3 — smoke-test pack covers all 15 published packages.** `scripts/smoke-test-pack.ts` rewritten as a declarative spec runner; per-package surface lives in `scripts/smoke-test-specs.ts`. Each spec packs the package, the runner installs every tarball into one shared scratch dir (so `@atelier/react` → `@atelier/runtime` resolves through published artefacts), writes a TS consumer that imports + uses representative runtime + type exports, typechecks against the published `.d.ts`, runs the JS under bare Node, and execs the bin (`atelier`, `atelier-schemas`, `atelier-evals`) with `--help`. Flags: `--keep`, `--package=<name>`, `--parallel`. Failures point at the exact package + the exact phase (pack / install / typecheck / runtime / bin). Bonus: caught + fixed a pre-existing bug in `@atelier/cli`'s entry-point guard that made the published `atelier` bin silently exit 0 with no output when launched via the npm `node_modules/.bin/atelier` symlink. Replaces the single-package CI step on both the split-step `validate` job and the `validate-fresh-clone` job. New doc: `apps/docs/src/content/docs/operations/publishing.mdx`. _This commit._
- [ ] **Migrate the other 14 packages' build artefacts** to the same pilot shape. The pilot pinned the shape (`dist/` outputs, `tsconfig.build.json` sibling, files: [dist, src, README, CHANGELOG], conditional `exports`); rolling it out is mechanical but each package needs an audit for subpath exports (`./testing`, `./debug`, etc.) and bin entries that currently use `tsx` shebangs. `pnpm build` flips from `--filter @atelier/schemas` to `-r --if-present` (or a tag-based filter) once the batch is done. The `pnpm build:all` script already runs the full recursive build for early experimentation. **NOTE**: the smoke-test gate above already proves every workspace package builds + packs + installs cleanly today; this item is about the per-package PR cadence (CHANGELOGs, exports audit). **2-3 d, batched.**
- [ ] **In-repo dev mode under `tsconfig.dev.json`.** Today the schemas pilot publishes `dist/index.js` as the canonical entry, so workspace consumers also resolve through `dist/` and a `pnpm build:watch` is needed during dev. A `tsconfig.dev.json` with path mappings back to `src/` per package would short-circuit that for in-monorepo work. **<1 d** once the migration is done.

### P2.2 — `atelier init` actually works outside the monorepo

- [x] **Standalone-publish hardening (Sprint 1.1).** `atelier init <name>` now detects monorepo vs standalone mode. Standalone is the default outside this repo: it copies a host template (`next15` default, `vite` opt-in) plus a `_shared` starter kit (recipes / policies / capabilities / skills / brand-kit.json / .env.local.example) into the target dir. `@atelier/*` deps are pinned to `^0.1.0` (npm-style), NOT `workspace:*`. Templates live under `packages/cli/templates/<host>/` as `*.template` files with `{{appName}}` / `{{description}}` substitution; the `files` array on the package ships them. New `scripts/smoke-test-init.ts` packs every `@atelier/*` package via `pnpm pack`, rewrites the scaffold to point at the local tarballs via `pnpm.overrides`, runs `pnpm install`, then `tsc --noEmit` — proving the typecheck path on both hosts before any external publish. CI job extended in `.github/workflows/ci.yml`. _This commit._
- [x] **Vite support (Sprint 1.1).** Pick via `--host=vite`. _This commit._

### P2.3 — `atelier validate` does real work

Today: it shells out to `pnpm validate` blindly, which only works if the consumer happens to have the same monorepo layout.

- [x] **Reimplement as a real validator** that runs typecheck + eslint + vitest in the consumer's project (regardless of monorepo). _Sprint 1.2._ Detects TS / ESLint / Vitest / package manager / workspace flavour via `lib/detect-stack.ts`; per-check runners under `lib/run-validators/` spawn the consumer's locally pinned `tsc` / `eslint` and run `<pm> test` for the test step. Atelier-specific schema validators (`capabilities/`, `skills/`, `policies/`, `recipes/`, `brand-kit.json`, `components/registry.json`) reuse `@atelier/schemas` Zod schemas — no parallel registry. Reports a tabular summary; failures list file + reason. `--strict` flips skipped checks into failures (CI mode); `--json` emits a stable shape; `--only=<set>` runs a subset. Exit codes: `0` pass / `1` fail / `2` no `package.json`. Docs: [`apps/docs/src/content/docs/operations/validation.mdx`](apps/docs/src/content/docs/operations/validation.mdx). Tests under `packages/cli/test/validate.test.ts` exercise the runner against fixtures (`validate-passing/`, `validate-failing/`) plus synthesised TS-only / ESLint-only / monorepo combos.

### P2.4 — Catalog publishability (Sprint 1.4 closure)

- [x] **`pnpm publish:dry-run`** verifies all 15 packages can be packed without errors. CI step. New step in `.github/workflows/ci.yml` runs `pnpm -r --filter "./packages/*" publish --dry-run --no-git-checks` immediately after build, gating the merge. _This commit (Sprint 1.4)._
- [x] **All 15 `@atelier/*` packages flipped public** at `0.5.0` in lockstep. Internal deps now `workspace:^` (substituted to `^0.5.0` at pack time). Coordinated SemVer policy lives in `docs/release-policy.md`. _This commit (Sprint 1.4)._
- [x] **`pnpm release [patch|minor|major|x.y.z]`** — one-command release driver: `pnpm validate` + `pnpm smoke-test:pack` + lockstep version bump + commit + tag + publish (dry-run by default, `--real` for actual npm push). `scripts/release.ts`. _This commit (Sprint 1.4)._
- [x] **Per-package `CHANGELOG.md`** seeded with the `0.5.0` entry summarising what each package contains today. _This commit (Sprint 1.4)._
- [x] **Operator docs.** New `apps/docs/src/content/docs/operations/releasing.mdx` + sidebar entry; `CONTRIBUTING.md` extended with a "Release process" section. _This commit (Sprint 1.4)._
- [ ] **README per package** — short package-scoped READMEs explaining the export surface (today they live in src code comments). **2-3 d.**

---

## P3 — Real-LLM evidence

**The review's pointed critique**: "not enough evidence that real LLM compiles produce consistently good UIs outside fixtures." Today V-6.e nightly eval uses a deterministic compile (no LLM dep) and frozen reference fixtures. Necessary, not sufficient.

### P3.1 — Real-LLM eval suite

- [ ] **`@atelier/eval-llm`** new package (or extend `@atelier/eval-marketplace`):
  - Runs the top-10 marketplace personas through `GeminiCompiler` (or whichever real LLM is configured) against the frozen capability + component fixture set.
  - Validates the output manifests against `ManifestSchema` + baseline policies (existing logic).
  - **Plus** — diffs the rendered manifest tree shape against a snapshot. Major shape changes flag a regression.
  - **Plus** — measures actual cost (`token_cost`) per persona-route pair and tracks against a budget. Cost regression = failure.
  - **Plus** — captures the LLM's reasoning trace alongside the manifest; `cir-evals` can rank reasoning quality (loosely; bounded heuristic).
- [ ] **Nightly job** runs this in addition to V-6.e (which becomes the deterministic-compile sanity check). **3 d.**
- [ ] **Cost dashboard** — daily report of per-persona compile cost across the eval set. **2 d.**

### P3.2 — End-user perceived-quality eval

The hard problem the review is pointing at: even when manifests validate, do they LOOK good? Bridges the gap between "schema-passes" and "user-quality".

- [ ] **Rendered-output snapshot diffs** — for each top-10 persona, render the route's manifest with `@atelier/components` to a static HTML + screenshot. Visual diff against baseline (Playwright + a screenshot library). Flag visual regressions, not just schema regressions. **1 wk.**
- [ ] **Recipe-quality scorecards** — `cir-evals` produces a per-recipe scorecard (compile-passed Y/N, schema-passed Y/N, policies-passed Y/N, snapshot-stable Y/N, cost-budget-respected Y/N). Surface in the marketplace browse UI. **3 d.**

---

## P4 — Visual regression matrix

**The catalog has 83 baseline primitives. There is no visual gallery and no visual-diff CI.** Every prior catalog promotion was tested for behaviour but not for pixel-level rendering.

- [ ] **`apps/components-gallery`** — a Storybook-style or custom MDX gallery enumerating every component × every variant × every state (default / hover / focus / disabled / empty / loading / error). Static-rendered to `dist/`. **3-5 d.**
- [ ] **Playwright visual-diff CI** — screenshots each gallery cell, diffs against baseline; PR fails on regression beyond a threshold. **2 d on top.**
- [ ] **Catalog page on docs site** — embed live previews from the gallery so newcomers see what's available. Link from `/atelier/components/catalog`. **2 d.**

---

## P5 — Demo boot paths

**The review's other pointed critique**: "demos still leaning on fake/generic fallback surfaces". Aurora / Octant / Marigold all fall back to `FallbackCompiler` when no Gemini key is set, which means the default boot doesn't exercise the LLM compile path it advertises.

- [ ] **CI runs each demo with a real Gemini key** (Actions secret) — at least one route per demo, asserts the manifest is a non-fallback compile. **2 d.**
- [ ] **`pnpm demo --real-llm` flag** — opt-in for local; refuses to boot without a key, no silent fallback. **<1 d.**
- [ ] **Demo boot README** — clear signposting that "demo runs" without a key but only the LLM compile path is the real demonstration. **<1 d.**

---

## P6 — SemVer + public API contracts

Today every `@atelier/*` package is on `0.x.x` and APIs move freely. External adoption needs a frozen public surface and a documented breaking-change policy.

- [ ] **Per-package `API.md`** documenting the exported surface (what's public, what's internal, what's deprecated). Generated from `src/index.ts` exports + curated descriptions. **3 d.**
- [ ] **`@atelier/api-extractor` step in CI** — diffs the public surface across PRs; major changes auto-flag a breaking-change label. **2 d.**
- [ ] **Promote one package to `1.0.0`** as the proof point. `@atelier/schemas` is the natural first candidate (it's the most stable). **2 d to write the migration / breaking-change doc.**

---

## P7 — Stability + op-debt cleanups (carry-overs)

Items that aren't blocking production but should land before the next sprint.

- [ ] **`gray-matter@4.0.3` cache bug.** Worked around in P0.5c with `{ }` options bag. Either upstream a fix or migrate off gray-matter. **<1 d.**
- [x] **`@atelier/react/debug` host-side smoke test.** Sprint 1.3 covers it: the `@atelier/react` spec in `scripts/smoke-test-specs.ts` imports `CompileBadge` from the `./debug` subpath and the `buildTestServices` helper from `./testing`, both exercised under the published artefact. _Closed by Sprint 1.3._
- [ ] **IndexedDB LRU eviction is O(n) per write.** Fine at default cap of 200; revisit with byte-accounting. **2-3 d.**

---

## P8 — Compile-quality follow-ups

The plumbing items that didn't fit in C-1..C-5.

- [ ] **`BehaviorPatternDetectedTrigger` schema variant.** V-4 emits `behavior.workaround_detected`; we want a non-workaround `behavior.pattern_detected` so promote-to-recipe doesn't fire on workaround sequences only. **<1 d.**
- [ ] **Behavioral pattern detector implementations.** `BehavioralPatternDetector` interface + `NoopBehavioralDetector` ship; no real heuristics. **2-3 d.**
- [ ] **Cross-app workflow compilation.** Single-app compile shipped; "Gmail + Calendar + Linear in one lens" needs a neutral compiler host. See [`docs/open-questions.md`](docs/open-questions.md) §1. **1-2 wk.**

---

## P9 — Wave 11 polish remaining

The long tail of UI primitives. **Deprioritised** under the new ordering — adding more catalog while the existing 83 primitives lack visual regression coverage is the kind of expansion the review is warning against. Resume after P0–P6 close.

### Vis (visual depth)

- ✅ Vis-2, Vis-3, Vis-5, Vis-8.
- [ ] Vis-4 (variant pass for remaining 32 components — folds into P4 visual gallery; ~1.5 wk).
- [ ] Vis-7 (5-step elevation system; 3 d).
- [ ] Vis-9 / Vis-10 (open visual debt items).

### Int (interaction)

- ✅ Int-2, Int-3, Int-4, Int-5, Int-10, Int-11, Int-13, Int-14.
- [ ] Int-1 (motion layer extension; 2 wk on top of P-7).
- [ ] Int-6 (Quick-switcher Cmd+P; 1 wk).
- [ ] Int-7 (chord shortcuts + per-user aliases; 1 wk).
- [ ] Int-15 (smart paste link unfurl; 1.5 wk).

### Cnt (content)

- ✅ Cnt-1..5, Cnt-7..11.
- [ ] Cnt-6 audit + close (<1 d).

### Nav (navigation)

- ✅ Nav-4, Nav-5, Nav-6.
- [ ] Nav-1 (left rail; 1 wk).

### Coll (collaboration; S-3 + S-4 ✅ unblocked)

- [ ] Coll-1 (presence; 1.5 wk).
- [ ] Coll-2 (live cursors; 2 wk; depends on Coll-1).
- [ ] Coll-3 (threaded comments; 2.5 wk; depends on Cnt-3).
- [ ] Coll-4 (follow-mode; 2 wk; depends on Coll-1).
- [ ] Coll-5 (selection halos; 1 wk; depends on Coll-1).

### AI (inline AI surfaces)

- ✅ AI-1, AI-3.
- [ ] AI-2 (slash-command AI in editors; 1 wk; depends on AI-1).
- [ ] AI-4 (inline AI chat docked to surface; 2 wk).

---

## P10 — Personalisation continuity

P-1 / P-8 / P-9 / DD ✅; the remainder.

- [ ] **P-3** — Refinement loop. Depends on P-1 (✅). **1.5 wk.**
- [ ] **P-4** — Engagement signals back into the compiler. **1 wk.**
- [ ] **P-7** — Motion / view-transitions / animation layer (foundation for Int-1). **1.5 wk.**

---

## P11 — Multi-platform & long tail

Last band. After P0–P10 settle.

### Native renderers

- [ ] N-1 iOS SwiftUI (4-6 wk).
- [ ] N-2 Android Jetpack Compose (4-6 wk).
- [ ] N-3 React Native (2-3 wk).
- [ ] N-5 Cross-platform component variant authoring (2 wk).

### Tooling polish (folded into P2 where appropriate)

- [x] `atelier validate` host pre-flight — see P2.3. _Sprint 1.2._
- [ ] Eval harness wired into `pnpm validate` — P3.1 covers.
- [ ] Component-variants demo / Storybook — see P4.

---

## What's shipped — historical record

For full prose-form context on every landed item see commit messages and `docs/build-plan.md`.

### This session (2026-05-04, recent commits first)

`1b0e50d` TODO EOD revision · `71e97fa` V-6.e nightly eval gate · `dfcb944` V-6.d review/curation flow · `1880415` S-4 distributed TriggerBus · `544bd67` V-6.a/b/f publish + consume + sign · `b6aa5b8` C-5 recipe RAG · `3f51e3c` dependabot policy · `d73c5c8` C-3/S-1 capability scoping · `61834f1` V-6.c MarketplaceBrowser · `07cf04d` test-fixture compliance · `6d1bbad` 4 pre-existing failures fixed · `6829018` skill YAML + lint CLI · `3b87f4d` site consistency sweep · `f749361` MDX format · `a82ce2c` AJV strict gate · `240cede` runtime Zod hardening · `dc70a44` site merge · `9a9e02e` marketplace nomenclature + replan.

### Wave M — Baseline-first pivot (closed, 2026-05-02)

12 commits. ETHOS principle #11 codified. Three demos ship zero custom bindings. Catalog promotions: `<Queue>` + `<Logo>` + `<MetaBadge>` + data-aware `<Grid>` + tile-shaped `<Card>` + `<Gallery>` + per-item `emphasis`. Adjacent: P-8 + S-6.

### Wave 11 — shipped this session (catalog 65 → 83, +18)

Vis-5 · Vis-8 · Cnt-10 · Cnt-11 · Int-10 · Int-5 · Int-14 · Nav-6 · AI-1 · AI-3 · V-6.c. Plus prior session: Vis-2, Int-2, Int-3, Int-4, Int-11, Int-13, Cnt-1..5 + 8..9, Nav-4, Nav-5.

### Compiler — Wave C (closed, all 5 phases shipped)

C-1 ✅ C-2 ✅ C-3 ✅ C-4 ✅ C-5 ✅.

### Wave 10 — Scale (closed, all 7 phases shipped)

S-1 (= C-3) · S-2 · S-3 · S-4 (`1880415` distributed TriggerBus) · S-5 · S-6 · S-7.

### Wave 8 — Vault marketplace (closed, all sub-tracks shipped)

V-1 · V-3 · V-6.a · V-6.b · V-6.c · V-6.d · V-6.e · V-6.f. End-to-end publish → review → consume → browse → RAG → nightly eval pipeline.

### What we explicitly do NOT do (compiler track)

- ❌ Flat Plan→Compose→Validate→Refine multi-agent pipeline as the default.
- ❌ Per-component specialist agents.

---

## Tomorrow's first move (suggested)

Lowest-friction wins:

1. **P0.1 fresh-clone CI job** — adds the guardrail that the recurring symlink stale issue can't reach main again. **<1 d.**
2. **P1.1 first env-gate flip** — pick `CIR_COMPILER_TOOLS_ENABLED` (most production-shaped) and default-on, delete the gate. Validates the productionisation pattern that the rest will follow. **2-3 d.**
3. **P0.4 manual** — branch protection on main (5 min repo-owner action).
4. **P2.1 build pipeline pilot** — pick one package (`@atelier/schemas` is most stable) and ship the build-artifact path as a proof. The other 14 packages get the same treatment in a follow-up batch. **2-3 d.**
5. **P3.1 real-LLM eval seed** — extend `@atelier/eval-marketplace` to optionally use `GeminiCompiler` against the top-3 personas. Captures cost + manifest-shape. The rest of P3 builds on this seam. **2 d.**

After that pattern proves out, P1 / P2 / P3 / P4 can fan out as parallel agents.

---

## Maintenance

- This file is the **planning surface**. Per-commit prose lives in commit messages and `docs/build-plan.md`.
- The marketplace nomenclature note above should NOT be removed without consensus.
- Production-readiness ordering above should NOT be reshuffled to "easier wins first" — the review's point is that the dependency order matters: validation gate → env-gate cleanup → consumer DX → real-LLM evidence. Skipping ahead to feature work undermines the credibility of everything below it.
