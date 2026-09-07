# Coding-agent handoff: add Atelier to an application

This is the decision-complete integration path for a coding agent working in a separate host application. Atelier augments an existing application; it does not replace the app's router, authentication, database, authorization rules, or design system.

## 1. Run the Atelier control plane

Requirements: Node.js 22.16 or newer, npm, and a private writable data directory outside either repository.

```sh
git clone https://github.com/fragmatic-io/atelier.git
cd atelier/platform
npm ci

export ATELIER_DATA_DIR="$HOME/.local/share/atelier-v23-dev"
export ATELIER_BIND=127.0.0.1
export PORT=4310
export ATELIER_PUBLIC_ORIGIN=http://127.0.0.1:4310
export NODE_ENV=development
npm run demo
```

The first boot prints a random development password once. Open `http://127.0.0.1:4310`, sign in, create a project, and keep the data directory and credentials out of source control.

Health checks:

```sh
curl --fail http://127.0.0.1:4310/healthz
curl --fail http://127.0.0.1:4310/readyz
```

## 2. Discover and review the host application

In Studio:

1. Open the project and choose **Setup**.
2. Create the origin-bound browser observer and paste the generated snippet into the host application. Source code is not required. Mark one approved shell with `data-atelier-design-root` and representative controls with `data-atelier-design-role="button|input|card|nav"` when design capture is enabled.
3. Optionally import an OpenAPI 3.x file or public HTTPS URL as declared evidence. Semantic samples remain disabled unless the customer explicitly enables locally redacted samples and an exact categorical-field allowlist.
4. Wait for Studio to report observed revisions and discovered capabilities from stored facts.
5. Inspect **App model**. Confirm every endpoint's purpose, method, path, input/output schema, permissions, risk, PII, reversibility and confirmation policy.
6. Approve or reject each capability. Then make independent delivery decisions: which approved capabilities may appear in custom surfaces and which may be exposed as chatbot tools.
7. Open **API reference** for the automatically generated Redoc documentation. Download the OpenAPI 3.1 document if another tool needs it.
8. Review the observed host design contract in Setup. Correct any token that does not represent the application, then approve that exact fingerprint.
9. Configure the primary chatbot and optional bounded specialists. Every selected primary-agent tool is registered for browser execution; commands retain their reviewed confirmation policy. Review every specialist instruction and its read-only subset; specialists never receive commands.
10. Design and publish the first surface, then choose **Install hosted UI**. Select the new-route/inline/drawer placement, exact application origin, customer page, navigation label, approved slot and environment. Copy the one-script embed immediately.

Read [CUSTOMER_ONBOARDING.md](CUSTOMER_ONBOARDING.md) for the observer privacy contract, deduplication, evidence levels, status facts and required tests. Explicit source scanning remains available for separately authorized self-hosted/developer projects to extract React components and design tokens; it is not the default SaaS onboarding path.

The observer submits only new operation/schema/context fingerprints. A changed contract invalidates its previous capability review and incompatible generated artifacts.

## 3. Choose the model provider

Provider selection is per project or pipeline stage. The default CLI path is Claude CLI with exact model `claude-opus-4-8` and effort `high`. Codex CLI and API providers are also supported. There is no provider fallback.

- For an API provider, create a Studio connection and store its scoped key server-side.
- For Claude CLI or Codex CLI, register a project runner under **Settings**, save the one-time private runner configuration, and start it from the Atelier checkout:

```sh
node scripts/runner.mjs --config /private/atelier-runner.json
```

The CLI process must run under a dedicated OS/container identity with an account home bound to this project. See [PROVIDERS.md](PROVIDERS.md) for the exact matrices and safety flags.

## 4. Apply the hosted embed

The downloaded `atelier-*.install.json` is an auditable receipt of the one-script handoff. Its only required patch adds a mount element and Atelier module script to the selected customer-owned page. It creates no framework files, package dependency, server bridge, host token or confirmation key.

Give the bundle to the coding agent with the generated **Copy coding-agent prompt**. The agent must:

1. apply the single snippet to the named customer-owned page;
2. allow the Atelier origin in the page's `script-src`, `connect-src` and `style-src` Content Security Policy;
3. verify every selected API path uses the application's existing browser session and still enforces tenant, permission and object authorization;
4. expose the host's existing CSRF value through `<meta name="csrf-token">` or `window.AtelierHost.csrfToken()` before enabling mutations;
5. run the customer's unit/integration tests and a real browser test covering a reviewed operation and denial of an unreviewed operation;
6. open the page so the current bundle reports design binding, mount, hosted runtime and browser API-client facts.

Studio remains `waiting` or `partial` until all four facts are true. The public receipt is operational evidence, not a security attestation; the customer API's authorization tests remain mandatory.

## 5. Preserve browser authority

The hosted runtime derives an immutable client registry from the capabilities used by the signed release. Each entry contains only its reviewed ID, method, same-origin path, schemas, risk and confirmation policy. The runtime rejects an absent capability ID, a non-HTTP contract, an absolute/cross-origin URL, path traversal and undeclared query fields.

The browser fetch uses `credentials: 'same-origin'`; therefore the customer's existing application session—not Atelier—authenticates the API call. The customer API must continue to enforce tenant isolation, permissions, object access and command preconditions. For mutations, expose the host application's existing CSRF value through a standard `<meta name="csrf-token">` or a synchronous `window.AtelierHost.csrfToken()` function. Never put an API key, Atelier project token or long-lived session in the embed attributes.

The primary chatbot and bounded specialists use the same approved capability inventory. Atelier hosts the chat UI, encrypted transcript state and model orchestration behind a sealed 12-hour browser session bound to the exact install and origin. This session is not customer identity or API authority. When a model selects a client tool, the customer browser executes only the registered reviewed operation with its existing same-origin session and returns the schema-bounded result. Commands require the explicit confirmation dialog before execution. An unregistered capability is denied before `fetch`.

Because the one-script path deliberately has no customer backend integration, Atelier cannot cryptographically identify the customer's signed-in user. The customer API is the hard authorization boundary and must reject any tenant, object or permission violation. If a deployment needs Atelier-side user identity, billing entitlements or cross-device transcript ownership, add a separately reviewed customer-signed identity exchange; do not treat the public install key as authentication.

## 6. Give the next coding agent project knowledge

Create a project token with only `read` scope and save this private configuration outside the repositories:

```json
{
  "origin": "http://127.0.0.1:4310",
  "tenantId": "ten_...",
  "projectId": "prj_...",
  "tokenEnv": "ATELIER_PROJECT_MCP_TOKEN"
}
```

Run the MCP server from the Atelier checkout:

```sh
chmod 600 /private/atelier-project-mcp.json
ATELIER_PROJECT_MCP_TOKEN='atk_...' node scripts/mcp.mjs --config /private/atelier-project-mcp.json
```

Register that stdio command in the coding agent. It provides project search, the current model, published component inventory and source, plus versioned coding/design skills. See [MCP.md](MCP.md).

For a frozen, credential-free handoff, export the current project skills into a new directory. The command refuses to overwrite an existing directory and never writes the project token:

```sh
ATELIER_PROJECT_MCP_TOKEN='atk_...' npm run export:skills -- \
  --config /private/atelier-project-mcp.json \
  --output /absolute/new/atelier-project-skills
```

Give the next agent that directory alongside the host repository. Refresh it after every project-model change; the live MCP server remains authoritative.

## 7. Required verification before deployment

```sh
# Atelier checkout
npm run test:unit
npm run acceptance

# Host checkout
node /absolute/path/to/atelier/platform/scripts/verify-host.mjs /absolute/path/to/host
npm test
```

Also test the host's real authorization boundaries, loading/empty/error states, keyboard flow, responsive layouts, action confirmation, idempotent replay, rollback, and token revocation. Production source certification requires the network-disabled certifier container. A local green suite is not an independent security attestation.

## Completion checklist for the integrating agent

- Browser observation or imported OpenAPI creates a current project model without requiring source code.
- Redoc reference renders every discovered HTTP capability and downloads valid OpenAPI 3.1 JSON.
- Every enabled agent tool has a reviewed contract and a registered same-origin browser operation.
- No API key or project token reaches browser code or Git.
- Commands require exact confirmation, host CSRF and customer-API idempotency.
- At least one query and one command pass with a real authorized test user.
- At least one published rich component renders actual projected tool data.
- The one-script mount, hosted UI and reviewed browser API client produce a verified installation receipt.
- The generated surface consumes the exact reviewed host design fingerprint and passes visual review at the customer's supported viewports and themes.
- Any enabled specialist is a separate auditable turn with read-only subset tools, bounded consultations and a primary-agent synthesis.
- Host typecheck, tests, browser tests, and Atelier verification pass without fallback.
