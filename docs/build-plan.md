# Phased Build Plan

A startup or team building CIR from scratch should sequence it like this. Each phase is a self-contained deliverable.

---

## Phase 0: Foundation (weeks 0-4)

- Define the manifest JSON schema (v0.1)
- Design the capability and skill schemas
- Build the component catalog spec
- Author 5-10 baseline components for the first domain (e.g., email)
- Write a single eval harness

**Deliverable**: schemas, types, one runnable component renderer.

---

## Phase 1: Single-app vertical slice (weeks 4-12)

Pick one domain (recommended: email).

- Build capability registry for ~10 email actions
- Author 5 skills (triage, summarize, draft, schedule, archive)
- Implement 15 components (ThreadView, TaskQueue, etc.)
- Build the compiler service with one model tier
- Build the manifest store with simple Redis cache
- Build the render runtime as a web SDK
- Ship a default recipe ("inbox view")
- Ship an alternate recipe ("task queue view")
- Build a "switch lens" UI

**Deliverable**: a working email app where users can switch between two recipes.

---

## Phase 2: Customization (weeks 12-20)

- Build the intent vault
- Build the customize flow ("describe your interface")
- Add the trigger bus
- Add policy engine with 10 baseline policies
- Add diff-mode compilation
- Add audit log
- Add manifest revert

**Deliverable**: users can describe their ideal email interface and get it.

---

## Phase 3: Production hardening (weeks 20-32)

- Add eval harness with 100+ tests
- Add observability (metrics, traces, logs)
- Add multi-tier caching (edge + browser)
- Add semantic invalidation
- Add behavioral triggers (workaround detection)
- Add token economics dashboard
- Add cache warming for common recipes
- Security audit

**Deliverable**: production-grade single-app deployment.

---

## Phase 4: Expansion (weeks 32-52)

- Add second domain (calendar or tasks)
- Build cross-app workflows (intent profile spans both)
- Build adapter pattern for outside-in (one adapter for an existing service like Gmail)
- Open the component catalog spec for community contributions
- Open the skill format for community contributions

**Deliverable**: multi-domain CIR with one outside-in adapter.

---

## Phase 5: Platform (year 2+)

- Marketplace for recipes ("interface lenses")
- Marketplace for adapters
- Developer tooling for CIR-native app authors
- Mobile runtime (iOS + Android)
- Native OS integration (macOS, Windows, ChromeOS)

**Deliverable**: an ecosystem.
