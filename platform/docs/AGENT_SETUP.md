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

## 2. Import and review the host application

In Studio:

1. Open the project and choose **Add source**.
2. Select the host application's source folder. Secret files, dependencies, generated output, databases, and oversized files are rejected or skipped.
3. Wait for the scan job to succeed.
4. Inspect **App model**. Confirm every endpoint's method, path, input/output schema, permissions, risk, PII, reversibility, and confirmation policy.
5. Open **API reference** for the automatically generated Redoc documentation. Download the OpenAPI 3.1 document if another tool needs it.
6. Security-review only the capabilities whose actual host behavior you have verified. Discovery never grants agent authority.

Atelier reads OpenAPI 3 JSON/YAML, Next.js route handlers, client calls, server actions, tRPC, GraphQL SDL, Prisma, React components, design tokens, and explicit runtime observations. Source is parsed rather than executed.

Rescan after API or schema changes. A changed contract invalidates its previous capability review and incompatible generated artifacts.

## 3. Choose the model provider

Provider selection is per project or pipeline stage. The default CLI path is Claude CLI with exact model `claude-opus-4-8` and effort `high`. Codex CLI and API providers are also supported. There is no provider fallback.

- For an API provider, create a Studio connection and store its scoped key server-side.
- For Claude CLI or Codex CLI, register a project runner under **Settings**, save the one-time private runner configuration, and start it from the Atelier checkout:

```sh
node scripts/runner.mjs --config /private/atelier-runner.json
```

The CLI process must run under a dedicated OS/container identity with an account home bound to this project. See [PROVIDERS.md](PROVIDERS.md) for the exact matrices and safety flags.

## 4. Install the host SDK

Until a registry release is explicitly published, pack the exact reviewed Atelier commit and install that tarball in the host application:

```sh
# Atelier checkout
cd platform
npm pack --ignore-scripts

# Host application checkout
npm install /absolute/path/to/atelier-platform-2.3.0-rc.1.tgz
```

Do not copy provider credentials into the host browser bundle. The host server uses a project-scoped token created under Studio **Settings**.

## 5. Implement server authority

Create one `HostBridge` on the host server. Map reviewed query capabilities to loaders and reviewed commands to idempotent executors. Both the authorization callback and the domain implementation must enforce the current user, tenant, object, permission, and business preconditions.

```ts
import { HostBridge, SqliteActionLedger } from '@atelier/platform/host';

export const atelier = new HostBridge({
  tenantId: process.env.ATELIER_TENANT_ID!,
  projectId: process.env.ATELIER_PROJECT_ID!,
  environment: 'staging',
  origin: process.env.ATELIER_ORIGIN!,
  token: process.env.ATELIER_PROJECT_TOKEN!,
  confirmationKey: Buffer.from(process.env.ATELIER_CONFIRMATION_KEY!, 'base64'),
  ledger: new SqliteActionLedger(process.env.ATELIER_ACTION_LEDGER!),
  authorize: async ({ subject, capability, input, context }) =>
    appPermissions.mayUseCapability(subject, capability.id, input, context),
  loaders: {
    'customer.get': ({ subject, input }) => customers.loadAuthorized(subject, input.customerId),
  },
  executors: {
    'intervention.create': ({ subject, input, operationId }) =>
      interventions.createAuthorizedAndIdempotent(subject, input, operationId),
  },
});
```

Expose same-origin, authenticated, CSRF-protected host routes for resolve, load, confirm, dispatch, and the embedded-agent RPC. Never accept browser-supplied roles or permissions as authority. Follow the complete examples and security conditions in [INTEGRATION.md](INTEGRATION.md).

## 6. Mount additive UI and the embedded agent

Use `@atelier/platform/react` for reviewed application slots and `@atelier/platform/host-client` for browser-to-host calls. Keep the application's existing navigation and accessible modal/drawer primitives; Atelier owns only the explicit leaf slot.

For the chatbot, mount the supplied conversation client/surface against the host's authenticated agent endpoint. Put the mount inside an explicit `.atelier-agent-root` container and import the scoped stylesheet; it never resets the host document.

```ts
import { AgentClient, sameOriginTransport } from '@atelier/platform/agent-client';
import { IndexedDbJournal } from '@atelier/platform/agent-journal';
import { mountAgentChat } from '@atelier/platform/chat';
import '@atelier/platform/agent.css';

const client = new AgentClient({
  transport: sameOriginTransport('/api/atelier/agent', {
    csrf: () => document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? null,
  }),
  journal: new IndexedDbJournal({
    namespace: `${tenantId}:${projectId}:${authenticatedUserId}`,
  }),
});

const root = document.querySelector<HTMLElement>('#atelier-agent');
if (!root) throw new Error('Missing the explicit Atelier agent mount');
root.classList.add('atelier-agent-root');
const chat = mountAgentChat(root, { client, context: { route: location.pathname } });
```

The agent can call only reviewed tools included in its project profile. Queries return schema-projected data. Commands require exact-input confirmation and use the durable action ledger. Rich responses select only certified, approved, signed, published components; runtime-generated executable UI is rejected. Call `chat.destroy()` and `client.close()` when the host unmounts the feature.

## 7. Give the next coding agent project knowledge

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

## 8. Required verification before deployment

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

- Source scan succeeds and the project version is recorded.
- Redoc reference renders every discovered HTTP capability and downloads valid OpenAPI 3.1 JSON.
- Every enabled agent tool has a reviewed contract and a host loader/executor.
- No API key or project token reaches browser code or Git.
- Commands require exact confirmation and durable idempotency.
- At least one query and one command pass with a real authorized test user.
- At least one published rich component renders actual projected tool data.
- Host typecheck, tests, browser tests, and Atelier verification pass without fallback.
