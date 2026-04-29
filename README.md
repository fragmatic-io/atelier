# CIR

**Capability · Intent · Render** — a production architecture for dynamic software interfaces.

Software ships **capabilities and skills**. Users keep **intent**. Agents emit **UI as ephemeral output** — cached, versioned, recomputed only on trigger.

## Start here

- [`ETHOS.md`](ETHOS.md) — the ten principles. Read this first.
- [`AGENTS.md`](AGENTS.md) — instructions for coding agents (Claude Code, Cursor, Codex) working _on_ this repo.
- [`docs/`](docs/) — the full framework, broken into chapters.
- [`docs/chat/`](docs/chat/) — the companion that extends the framework to chat interfaces, autonomous agents, multi-agent systems, and voice.

## The two-document map

The framework is specified across two parallel tracks:

| Track                | Audience                                                      | Entry point                                      |
| -------------------- | ------------------------------------------------------------- | ------------------------------------------------ |
| Core framework       | Anyone shipping CIR-native apps (web, native, mobile)         | [`docs/thesis.md`](docs/thesis.md)               |
| Chat / agent / voice | Anyone shipping CIR through a conversational or agent surface | [`docs/chat/overview.md`](docs/chat/overview.md) |

Same three-artifact model throughout. The implementations differ. The principles don't.

## Layout

The high-signal directories. Standard repo files (`LICENSE`, `NOTICE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `.github/`, `.vscode/`, `.husky/`, dotfile configs) are present but elided here for clarity.

```
cir/
├── ETHOS.md                    # The ten principles
├── AGENTS.md                   # Coding-agent instructions for this repo
├── README.md                   # This file
├── capabilities/               # Typed action and data definitions (JSON schema) — Phase 2+
├── skills/                     # Skill markdown for capability usage — Phase 2+
├── components/                 # UI primitive registry — Phase 4+
├── policies/                   # Confirmation, data access, PII rules — Phase 3+
├── recipes/                    # Default manifests per persona — Phase 4+
├── evals/                      # Test cases for every artifact (*.eval.ts) — Phase 2+
├── .well-known/                # Public discovery (cir.json — Phase 5; schemas/ — Phase 2)
├── packages/                   # pnpm workspace
│   ├── schemas/                #   @cir/schemas — Zod schemas + JSON Schemas (Phase 2)
│   ├── policies/               #   @cir/policies — pure-function manifest validators (Phase 3)
│   ├── evals/                  #   @cir/evals — eval harness + cir-evals CLI (Phase 3)
│   ├── runtime/                #   @cir/runtime — render SDK (stub Phase 2; source Phase 5)
│   ├── compiler/               #   @cir/compiler — LLM compile service (stub Phase 2; source Phase 5)
│   └── ...                     #   @cir/components, @cir/cli arrive in Phase 4+
├── scripts/                    # Repo-level harness scripts (sanity test, etc.)
└── docs/
    ├── thesis.md               # Section 0: the one-line thesis
    ├── artifacts.md            # Capabilities, Skills, Intent, Render
    ├── architecture.md         # System overview, services, data flows
    ├── caching.md              # Five-tier cache, invalidation
    ├── triggers.md             # The trigger system
    ├── token-economics.md      # Cost model, optimization levers
    ├── component-catalog.md    # The 50-primitive baseline
    ├── deployment-paths.md     # Inside-out, outside-in, hybrid, native
    ├── production-concerns.md  # Security, observability, evals, compliance
    ├── coverage-strategy.md    # The 90% argument
    ├── build-plan.md           # Phased build (weeks 0 → year 2)
    ├── graduation.md           # User customizations → product features
    ├── open-questions.md       # What this framework does not yet solve
    ├── quick-reference.md      # The card
    └── chat/
        ├── overview.md
        ├── render-targets.md
        ├── agent-roles.md
        ├── mcp-integration.md
        ├── conversation-artifacts.md
        ├── multi-modal.md
        ├── triggers.md
        ├── token-economics.md
        ├── runtime-instructions.md   # AGENTS.md for runtime agents
        ├── architecture-additions.md
        ├── implementation-patterns.md
        ├── production-concerns.md
        ├── deployment-scenarios.md
        └── quick-reference.md
```

## When this repo grows

Phase 1 shipped the canonical directory skeleton — the artifact directories (`capabilities/`, `skills/`, `components/`, `policies/`, `recipes/`, `evals/`), the workspace (`packages/runtime/`, `packages/compiler/` stubs), and `.well-known/` all exist with README scaffolding. Phase 2 added `@cir/schemas` and the generated JSON Schemas under `.well-known/schemas/`. The remaining directories are intentionally empty pending the phased build:

- **Phase 2** — `@cir/schemas` (Zod schemas + generated JSON Schemas in `.well-known/schemas/`). Done.
- **Phase 3** — `@cir/policies` (5 baseline validators + behavioral-detector contract), `@cir/evals` (harness + `cir-evals` CLI), commitlint workflow. Done.
- **Phase 4** — component registry and runtime SDK source.
- **Phase 5** — compiler service source and `.well-known/cir.json` discovery document.

See [`docs/build-plan.md`](docs/build-plan.md) for the full schedule and [`AGENTS.md`](AGENTS.md) for the rules each artifact must follow once it lands.

## The bet

The next decade of software is built on capability surfaces and ephemeral interfaces, with users (or agents acting for them) composing what they actually need from a stable substrate. The companies that ship this substrate well will be the operating systems of that decade.

The interface is not the product. The capability is.
