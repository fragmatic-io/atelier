# Atelier Platform 2.3 release candidate

Atelier learns an existing application's capabilities and design language, grows a reviewed project-native component library, publishes signed artifacts into additive application slots, and exposes the same verified project knowledge to an embedded runtime agent and to coding agents over MCP.

This directory is an independent npm project inside the original Atelier pnpm repository. Root framework validation and `platform/` acceptance are separate required gates.

## Local development

Requirements: Node.js 22.16 or newer with `node:sqlite`, npm, Python 3, Python Playwright 1.62.0, and a compatible Chromium installation.

```sh
npm ci
python3 -m venv .venv
.venv/bin/pip install -r requirements-browser.txt
.venv/bin/playwright install chromium
ATELIER_PYTHON="$PWD/.venv/bin/python" npm run acceptance
```

`npm run acceptance` runs every nested Node test, a production dependency audit, an offline package/install smoke test, all nine source-kit browser matrices, and the complete local Studio/host browser journey. Missing browsers or modules fail explicitly. Results are written to `evidence/current/acceptance/` and are bound to the Git commit and package-lock hash.

The default `core` profile may pass while external release gates remain blocked. `npm run acceptance -- --profile=release` requires every ledger item to be verified and therefore refuses a release when live API-provider or independent security evidence is absent. The production application/certifier images and real isolated browser certification passed locally; registry scanning remains a deployment-specific requirement. See [the requirements ledger](docs/v2.3/REQUIREMENTS.json).

## Start Studio

Use disposable data outside the checkout:

```sh
export ATELIER_DATA_DIR="$HOME/.local/share/atelier-v23-dev"
export ATELIER_BIND=127.0.0.1
export PORT=4310
export ATELIER_PUBLIC_ORIGIN=http://127.0.0.1:4310
export NODE_ENV=development
npm run demo
```

Open `http://127.0.0.1:4310`. The first boot prints a random development password once. Do not capture it in logs or commit the data directory. The demo uses explicitly labelled deterministic or controlled model behavior; it is not a live-provider result.

## Product surfaces

- Studio: tenant/project selection, redacted source import, scan/model inspection, capability review, source generation, real browser certification, human approval, signing, publication, rollback, and audit.
- Host runtime: the application retains authentication, object authorization, business data, and transactional idempotency. Atelier resolves signed additive surfaces and proposes only reviewed capabilities.
- Embedded agent: durable private conversations, attachments, stop/retry, scoped tools, exact-input confirmation, interactive artifacts, revision/pin/export behavior, and revocation checks.
- Coding-agent MCP: current project search/model, published component source, and versioned coding/design skill resources. Configuration and tokens stay server-side. See [MCP integration](docs/MCP.md).

## Source generation and publication

The source forge produces React TSX and CSS against exact locked compiler dependencies. Imports, data contracts, actions, dynamic access, CSS egress, output size, and execution are bounded. Local certification exercises 17 state/viewport/theme/direction cases per component. Production refuses local certification and requires the network-disabled container mode.

A component progresses through distinct draft, certified, human-approved, signed/published, and revoked states. Unit fixture evidence cannot cross the production HTTP boundary. Published artifacts are rechecked against current project version, signing key, token, membership, and capability reviews.

## Provider boundary

OpenAI, Anthropic, Gemini, approved OpenAI-compatible APIs, Codex CLI, and Claude CLI share one validated artifact contract and are selectable per project or pipeline stage. API keys remain encrypted server-side. CLI runners require a dedicated OS/container identity and project-bound account home. Claude CLI defaults to the exact `claude-opus-4-8` model at `high` effort; its installed binary must support those flags. There is no provider fallback: failures stay failures and the prior approved artifact remains unchanged.

Run `node scripts/live-provider-acceptance.mjs` only with a private provider matrix and scoped credentials. The command fails if the matrix or credentials are missing. See [provider setup](docs/PROVIDERS.md).

## Supported deployment

The supported initial topology is one Linux host, local SQLite WAL storage, separate API/build-worker processes, HTTPS termination, encrypted volumes/backups, and isolated project runner accounts. It is not multi-host HA. Generated source compilation is resource-bounded; adversarial production browser certification must use `ops/certifier.Dockerfile` with no network and least privileges.

Read [architecture](docs/ARCHITECTURE.md), [host integration](docs/INTEGRATION.md), [operations](docs/OPERATIONS.md), [security](SECURITY.md), and [threat model](docs/THREAT_MODEL.md) before handling non-synthetic data.

## Repository map

| Path                                               | Responsibility                                                                |
| -------------------------------------------------- | ----------------------------------------------------------------------------- |
| `packages/control-plane`                           | Auth, scope, durable storage/jobs, providers, releases, API                   |
| `packages/source-forge`                            | React source contract, isolated compilation, certification, signing lifecycle |
| `packages/conversation`                            | Embedded agent, tools, artifacts, observations, browser clients               |
| `packages/mcp`                                     | Read-only project-scoped coding-agent tools and generated skills              |
| `packages/host-sdk`, `surface`, `adapters`         | Server authority and host rendering integrations                              |
| `apps/studio`, `apps/agent-demo`, `apps/host-demo` | Operator product and runnable local integrations                              |
| `migrations`, `ops`, `scripts`, `tests`            | Persistence, deployment, acceptance, and evidence                             |

Atelier 2.3 remains an RC until the externally blocked items in the ledger are independently verified against the exact release commit. A green local suite is evidence of the tested local scope, not a production-readiness claim.
