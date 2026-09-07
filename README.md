# Atelier 2.3

Atelier is a fail-closed control plane for learning an application's API capabilities, reviewing which operations agents may use, and delivering native rich chat and adaptive product surfaces.

This repository has one supported implementation: [`platform/`](platform/). The superseded pnpm/CIR prototype, its automatic compiler and vault fallbacks, demo applications, generated registries, and historical build plans were removed in September 2026. They remain available only through Git history and are not supported runtime paths.

## Start locally

Requirements: Node.js 22.16 or newer, npm, Python 3, Python Playwright 1.62.0, and Chromium.

```sh
cd platform
npm ci
python3 -m venv .venv
.venv/bin/pip install -r requirements-browser.txt
.venv/bin/playwright install chromium

export ATELIER_DATA_DIR="$HOME/.local/share/atelier-v23-dev"
export ATELIER_BIND=127.0.0.1
export PORT=4310
export ATELIER_PUBLIC_ORIGIN=http://127.0.0.1:4310
export NODE_ENV=development
npm run demo
```

Studio opens at `http://127.0.0.1:4310`. Its first boot prints a random development password once. Keep the data directory, credentials, project tokens, MCP configuration, and runner homes outside the repository.

Signed-out users can create an account at `http://127.0.0.1:4310/signup` with a name, email address, and password. Signup creates an authenticated account immediately; it does not send or require an email verification code. A new account starts with no access to existing workspaces.

## Validate the complete product

```sh
cd platform
ATELIER_PYTHON="$PWD/.venv/bin/python" npm run acceptance
```

The acceptance command runs the V2.3 Node suite, production dependency audit, package/install smoke test, source-kit browser matrix, and integrated Studio/host browser journey. It fails instead of substituting missing browsers, providers, credentials, or external review.

The Node suite intentionally keeps only distinct core-product and security boundaries. Redundant CLI/demo, auth-markup, certifier-error and component-HTTP happy-path suites were removed because the package, live HTTP and actual-browser gates already exercise those paths.

Hosted CI and Dependabot are intentionally not configured. Run this canonical local gate on the exact commit before pushing; rebuild hosted automation only when GitHub Actions is intentionally enabled again.

## Customer integration flow

1. Install the origin-bound browser observer. It derives API shapes locally, removes disallowed values, and sends only new fingerprints and approved metadata.
2. Optionally upload or link OpenAPI evidence. Observed and declared evidence remain distinct.
3. Review discovered capabilities and separately decide which may become chatbot tools.
   Studio supports atomic approval of a selection or all pending capabilities; bulk approval never enables agent access.
4. Review the bounded host design contract captured from explicitly marked elements.
5. Configure Claude CLI, Codex CLI, or an API provider. Claude CLI defaults to `claude-opus-4-8` at `high` effort. There is no provider fallback.
6. Configure the primary agent and optional bounded read-only specialists.
7. Select an exact client/server target and generate a route, inline mount, or drawer installer. First-class targets include Vite React + FastAPI, Next.js App Router, React Router + Express, and DOM + Node.
8. Verify route mounting, server authority, design binding, tools, confirmation behavior, and browser states before publishing.

Start with the [platform operating guide](platform/README.md), [customer onboarding](platform/docs/CUSTOMER_ONBOARDING.md), [application/agent setup](platform/docs/AGENT_SETUP.md), [legacy-removal record](platform/docs/LEGACY_REMOVAL.md), and [repository hygiene audit](platform/docs/REPOSITORY_HYGIENE.md).

## Canonical repository map

| Path | Purpose |
| --- | --- |
| `platform/packages/control-plane` | Authentication, tenant/project scope, durable jobs, releases, providers, and API |
| `platform/packages/discovery` | Privacy projection, runtime observation, design evidence, and onboarding facts |
| `platform/packages/conversation` | Embedded agent, bounded specialists, tools, confirmations, and artifacts |
| `platform/packages/surface-install` | Target-profile customer-owned installers and factual receipts |
| `platform/packages/source-forge` | Bounded source generation, compilation, certification, and signing |
| `platform/packages/mcp` | Read-only project-scoped coding-agent tools and generated skills |
| `platform/apps` | Studio plus runnable host and embedded-agent examples |
| `platform/tests`, `platform/scripts` | Unit, security, package, browser, and release acceptance gates |
| `platform/docs` | Current architecture, operations, security, provider, and integration documentation |

Atelier 2.3 remains a release candidate until the exact release commit has live scoped API-provider evidence and an independent signed security review. Local tests do not self-attest those external gates.
