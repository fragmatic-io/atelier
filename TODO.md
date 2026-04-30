# TODO

Tracked work that intentionally did not land in earlier phases. Update as items are picked up; remove when shipped.

## Placeholders to replace before going public

- [ ] **Security contact** — `security@cir.dev` is a placeholder in [`SECURITY.md`](SECURITY.md). Replace with a real monitored mailbox before opening the repo to outside reporters.
- [ ] **Conduct contact** — `conduct@cir.dev` is a placeholder in [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md). Replace with a real address (or the same security mailbox if appropriate) before public launch.

## Phase 2 follow-ups (from second-pass review)

- [x] Move `runtime/` and `compiler/` under `packages/` — done.
- [x] Bump coverage thresholds from 0 once `@cir/schemas` lands.
- [x] Add `actionlint` step to CI.
- [x] Add `scripts/check-license-headers.ts` (SPDX header check, MIT) and wire into `validate`.
- [x] JSON-schema lint pass for `capabilities/*.json` and skills/components data files.

## Phase 3+ candidates

- [ ] Widen CI Node matrix from `[22]` to `[22, 24]` once Node 24 hits LTS.
- [x] Add a `commitlint` GitHub Action so PR titles get the same conventional-commit gating as local commits — landed in Phase 3 (`.github/workflows/commitlint.yml`).
- [ ] Decide whether `actionlint` should also run on `dependabot` PRs (currently scoped to `push` + `pull_request`).
- [x] Tighten coverage thresholds package-by-package as source lands — `@cir/schemas`, `@cir/policies`, `@cir/evals` (Phase 3) and `@cir/runtime` (Phase 4a, 90/80/90/90 per-file) all gated. Continue to tighten as remaining packages land.
- [ ] Sign capabilities/skills artifacts at publish time per [`docs/production-concerns.md`](docs/production-concerns.md) — needs a key-management decision.

## Phase 4a follow-ups

- [ ] **Per-package typecheck in `packages/runtime/`** fails standalone with TS5097 (`.ts` import extensions in tests) — same workspace-wide architectural choice as `@cir/schemas`/`@cir/policies`/`@cir/evals`. Resolve when the import-extension policy is revisited.
- [x] **IndexedDB byte-size accounting** — landed in Phase 4d.
- [ ] **`ManifestFetcher` does not validate the response body against the Manifest Zod schema** — `ManifestResolver`'s optional `validate` is the only client-side defense. Acceptable layering; revisit when the host-vs-runtime trust boundary is finalized.
- [ ] **`IndexedDBManifestCache` casts stored values without a runtime sanity check on read** — relies on browser SOP. Add a defensive parse on `get` if we widen the threat model to "attacker who can write to the user's IDB".
- [ ] **`ActionDispatcher` does not validate input against `capability.input`** — host is on the hook for shape validation today. Documented intentionally; revisit if the dispatcher should run a Zod-ish parse before handing off.
- [ ] **IndexedDB LRU eviction is O(n) per write** — fine at the default cap of 200 entries; revisit with the byte-accounting work.
- [x] **Real trigger transports** — `SseTriggerTransport` shipped in Phase 4d; the demo wires it to `/api/triggers/stream`. WebSocket / long-poll variants remain optional per deployment.
- [x] **Stale-while-revalidate + optimistic UI** — landed in Phase 5b in `@cir/react`. Live-query subscriptions remain on the future-work list.

## Phase 5 follow-ups

- [x] **`@cir/compiler` real source** — Gemini integration, prompt builder, Tier-3 `ManifestStore` (Memory + Redis), `FallbackCompiler` (Phase 5a / 5c).
- [x] **`BrandKit` schema + `respects_brand_kit` policy** — Phase 5a.
- [x] **`<DebugPanel>` + `<CompileBadge>` UI** — Phase 5a.
- [x] **`PolicyRegistry` for app-supplied custom policies** — Phase 5b.
- [x] **`composes_according_to_rules` policy** — Phase 5b (factory in `@cir/policies`).
- [x] **`verbal_required` confirmation** — Phase 5c (extended `ConfirmPortal` in `@cir/react`).
- [x] **`RedisManifestStore`** — Phase 5c.
- [x] **MIT relicense (Apache-2.0 → MIT)** — Phase 5c.
- [x] **Real eval cases** — 10 evals shipped in Phase 5c covering compiler / policy / runtime scenarios.
- [x] **Nightly real-Gemini coverage** — `.github/workflows/nightly-evals.yml` runs `cir-evals run --tag smoke` against the `GEMINI_API_KEY` secret; auth-shaped errors surface as `auth_failed: true` (no silent skip on a revoked key). Done in Wave 4 P-CI-5.
- [x] **56-component baseline complete** — batches 2–5 in Phase 5b/5d filled out the catalog from 13 to 56.
- [x] **Per-package coverage ratchet** — tightened across `@cir/schemas`, `@cir/policies`, `@cir/evals`, `@cir/runtime`, `@cir/components`, `@cir/react`, `@cir/compiler` as each landed.
- [x] **`StreamingAuditSink` / observability hooks** — landed alongside the compiler in Phase 5a.
- [ ] **`apps/demo-dummyjson` + `apps/demo-github` skeletons** — lens-switching showcase and real-mutations showcase. Phase 5e.
- [ ] **Live-query subscriptions** — future work; SWR + optimistic UI cover the common cases today.

## Repo metadata to set after first push

- [x] Replace `cir/cir` placeholders with `fragmatic-io/cir` in `package.json`, `NOTICE`, and `.github/ISSUE_TEMPLATE/config.yml`.
- [ ] Enable branch protection on `main`: require CI green, require PR review, no force-push.
- [ ] Set up a project board / discussions / wiki preferences once the team grows beyond one.
