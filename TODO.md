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

## Phase 4a follow-ups (deferred to 4b/4c)

- [ ] **Per-package typecheck in `packages/runtime/`** fails standalone with TS5097 (`.ts` import extensions in tests) — same workspace-wide architectural choice as `@cir/schemas`/`@cir/policies`/`@cir/evals`. Resolve when the import-extension policy is revisited.
- [ ] **IndexedDB byte-size accounting** — Phase 4a uses count-based LRU (`maxEntries`, default 200). The 50MB soft / 200MB hard caps from `docs/caching.md` need a byte measurer. Phase 4c.
- [ ] **`ManifestFetcher` does not validate the response body against the Manifest Zod schema** — `ManifestResolver`'s optional `validate` is the only client-side defense. Acceptable layering for 4a; revisit when the host-vs-runtime trust boundary is finalized.
- [ ] **`IndexedDBManifestCache` casts stored values without a runtime sanity check on read** — relies on browser SOP. Add a defensive parse on `get` in Phase 4c if we widen the threat model to "attacker who can write to the user's IDB".
- [ ] **`ActionDispatcher` does not validate input against `capability.input`** — host is on the hook for shape validation today. Documented intentionally; revisit if the dispatcher should run a Zod-ish parse before handing off.
- [ ] **IndexedDB LRU eviction is O(n) per write** — fine at the default cap of 200 entries; revisit with the byte-accounting work.
- [ ] **Real trigger transports** (WebSocket / SSE / long-poll) — Phase 4c.
- [ ] **Stale-while-revalidate / optimistic UI / live-query subscriptions** — Phase 4b/4c.

## Repo metadata to set after first push

- [x] Replace `cir/cir` placeholders with `fragmatic-io/cir` in `package.json`, `NOTICE`, and `.github/ISSUE_TEMPLATE/config.yml`.
- [ ] Enable branch protection on `main`: require CI green, require PR review, no force-push.
- [ ] Set up a project board / discussions / wiki preferences once the team grows beyond one.
