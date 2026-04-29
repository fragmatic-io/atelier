# CIR Framework — Docs

The full framework, broken into chapters. For the ten principles that govern every chapter, see [`../ETHOS.md`](../ETHOS.md).

## Reading order

1. [thesis.md](thesis.md) — the one-line argument
2. [artifacts.md](artifacts.md) — Capabilities + Skills (public), Intent (private), Render (ephemeral)
3. [architecture.md](architecture.md) — system overview, services, hot path vs cold path
4. [caching.md](caching.md) — the five-tier cache and the trigger → invalidation matrix
5. [triggers.md](triggers.md) — schema, intent, behavioral, explicit, system triggers
6. [token-economics.md](token-economics.md) — cost model and the ten optimization levers
7. [component-catalog.md](component-catalog.md) — the 50-primitive baseline
8. [deployment-paths.md](deployment-paths.md) — inside-out, outside-in, hybrid, native
9. [production-concerns.md](production-concerns.md) — security, observability, evals, versioning, compliance
10. [coverage-strategy.md](coverage-strategy.md) — the 90% argument
11. [build-plan.md](build-plan.md) — phased build, weeks 0 → year 2
12. [graduation.md](graduation.md) — when user customizations become product features
13. [open-questions.md](open-questions.md) — what is genuinely unsolved
14. [quick-reference.md](quick-reference.md) — the card

## The chat / agent / voice extensions

Anything conversational, agent-mediated, or voice-rendered is covered in [`chat/`](chat/). The core framework above is render-target-agnostic; `chat/` specifies how it applies when the render target is a conversation, the user is an agent, or the runtime is a chat client.

Same three-artifact model. Same caching commitments. Different surfaces.
