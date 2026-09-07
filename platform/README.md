# Atelier Platform 2.3 release candidate

Atelier learns an existing application's capabilities and privacy-safe workflow evidence, turns that product intelligence into reviewed adaptive surfaces, and exposes the same approved capabilities to agents with rich in-product components. It can install a new customer-owned route, mount into an existing page, or improve an existing Atelier-owned slot without silently rewriting arbitrary host UI.

This directory is the repository's only supported product implementation. The removed root pnpm/CIR prototype is available only through Git history and is not a supported integration or runtime path.

## Local development

Requirements: Node.js 22.16 or newer with `node:sqlite`, npm, Python 3, Python Playwright 1.62.0, and a compatible Chromium installation.

```sh
npm ci
python3 -m venv .venv
.venv/bin/pip install -r requirements-browser.txt
.venv/bin/playwright install chromium
ATELIER_PYTHON="$PWD/.venv/bin/python" npm run acceptance
```

`npm run test:browser` uses `ATELIER_PYTHON` when supplied, otherwise the executable at `platform/.venv/bin/python` (or `.venv/Scripts/python.exe` on Windows). It fails explicitly when neither runtime is available and uses the same interpreter for nested browser certification.

`npm run acceptance` runs every nested Node test, a production dependency audit, an offline package/install smoke test, all nine source-kit browser matrices, and the complete local Studio/host browser journey. Missing browsers or modules fail explicitly. Results are written to `evidence/current/acceptance/` and are bound to the Git commit and package-lock hash.

The maintained Node suite is intentionally limited to distinct core and security contracts. Package installation and actual-browser gates own duplicated CLI/demo, Studio-auth markup, certifier-error and component-HTTP happy paths.

Hosted CI and Dependabot are intentionally absent. Run this canonical local gate against the exact commit before pushing; do not interpret a GitHub branch-protection bypass as test evidence.

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

Self-service signup is available at `/signup`. It requires a name, email address, and password of 12-256 characters, creates the browser session immediately, and performs no email-verification step. New accounts have no inherited workspace access; workspace membership still comes only from creating a workspace or accepting an invitation.

For a customer or coding agent installing Atelier into another application, begin with the [guided customer onboarding](docs/CUSTOMER_ONBOARDING.md), then follow the complete [application integration handoff](docs/AGENT_SETUP.md). The normal SaaS path uses a privacy-safe browser observer and OpenAPI evidence without requiring source code. It then covers automatic Redoc documentation, capability review, provider/runner setup, a one-script Atelier-hosted UI mount, reviewed same-origin browser API calls, embedded chat, rich response components, MCP registration, and deployment verification.

The installable package exposes server authority, React slots, browser surfaces, providers, project MCP, the embedded-agent host/client/journal, the standalone chat and artifact mounts, and the source forge as documented subpath exports. Import `@atelier/platform/agent.css` inside the explicit host container for the scoped standalone chat theme.

## Product surfaces

- Studio: fact-derived guided onboarding, origin-bound browser observation, OpenAPI import, optional redacted semantic samples, deterministic design approval plus agentic semantic synthesis, capability review, independent custom-surface and chatbot delivery, bounded specialist-agent setup, one-script hosted UI generation with factual verification, automatic Redoc API reference, source generation, real browser certification, human approval, signing, publication, rollback, and audit.
- Capability review: filter and select operations, approve selected or all pending operations atomically, then make a separate explicit decision about agent access. Bulk review is rejected if the project model changed; reopening a review disables agent access and retains the original audit records.
- Hosted runtime: Atelier serves signed additive UI. The customer browser calls only reviewed same-origin API contracts through its existing session; the customer API retains authentication, tenant/object authorization, business data and transactional idempotency.
- Embedded agent: durable private conversations, attachments, stop/retry, scoped tools, bounded read-only specialist consultations, primary-agent synthesis, exact-input confirmation, interactive artifacts, revision/pin/export behavior, and revocation checks.
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
| `packages/api-docs`                                | Deterministic OpenAPI 3.1 export and Redoc project reference                  |
| `packages/source-forge`                            | React source contract, isolated compilation, certification, signing lifecycle |
| `packages/conversation`                            | Embedded agent, tools, artifacts, observations, browser clients               |
| `packages/discovery`                               | Browser observer, privacy projection, API evidence and onboarding status      |
| `packages/surface-install`, `embed`                | Hosted script bundles, reviewed browser API client and install receipts        |
| `packages/mcp`                                     | Read-only project-scoped coding-agent tools and generated skills              |
| `packages/host-sdk`, `surface`, `adapters`         | Server authority and host rendering integrations                              |
| `apps/studio`, `apps/agent-demo`, `apps/host-demo` | Operator product and runnable local integrations                              |
| `migrations`, `ops`, `scripts`, `tests`            | Persistence, deployment, acceptance, and evidence                             |

Atelier 2.3 remains an RC until the externally blocked items in the ledger are independently verified against the exact release commit. A green local suite is evidence of the tested local scope, not a production-readiness claim.
