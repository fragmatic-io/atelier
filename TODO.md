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
