# Add Atelier to an existing app

This document covers the optional self-hosted SDK path for teams that deliberately keep surface resolution and execution inside their own server. It is not the default SaaS installer. The supported SaaS path is the one-script Atelier-hosted UI and reviewed browser API client in [AGENT_SETUP.md](AGENT_SETUP.md).

## Package and imports

This is one source package. In a host checkout, install the locally packed source (or an approved file dependency), retaining your existing React version and design system. No independent registry publication is assumed.

```sh
# In the Atelier directory; this does not publish anything.
npm pack --ignore-scripts
# In your host, install the produced tarball using your normal dependency workflow.
```

Entrypoints are `@atelier/platform/host` (server only), `/host-client` (browser), `/surface`, `/react`, `/providers`, `/mcp` and `/surface.css`. Public TypeScript declarations are included. The root and MCP imports are server-only; never put them in a browser bundle.

## Server authority

Construct a HostBridge once per project/environment on the host server. Use a read-only project token, independent random confirmation key, persistent action ledger, and application-owned loaders/executors. The host's `authorize` callback sees the current authenticated subject, exact capability, query/command kind, entity context and validated input. Apply tenant ownership, object ACLs and business preconditions there and in your executor; never accept role/permission arrays supplied by browser JSON.

```ts
import { HostBridge, SqliteActionLedger } from '@atelier/platform/host';

const bridge = new HostBridge({
  tenantId: config.atelierTenantId,
  projectId: config.atelierProjectId,
  environment: 'production',
  origin: config.controlOrigin,
  token: secrets.atelierReadToken,
  confirmationKey: secrets.confirmationKeyBuffer,
  ledger: new SqliteActionLedger('/private/persistent/host-actions.sqlite'),
  authorize: async ({ subject, capability, input, context }) => {
    return appPermissions.mayUseCapability(subject, capability.id, input, context);
  },
  loaders: {
    'customer.get': ({ subject, input }) => customers.loadAuthorized(subject, input.customerId),
  },
  executors: {
    'intervention.create': ({ subject, input, operationId }) =>
      interventions.createAuthorizedAndIdempotent(subject, input, operationId),
  },
});
```

The named `config`, `secrets`, `appPermissions`, `customers` and `interventions` above are deliberately **your application bindings**, not included fake backends. `apps/host-demo/server.mjs` is the runnable example.

Create same-origin authenticated, CSRF-protected host endpoints for resolve/load/confirm/dispatch. Each obtains the real server session, chooses the allowed context and calls the corresponding bridge method. Unknown input schema constraints fail explicitly; extend validation deliberately or register an application boundary that validates those constraints before a deployment uses them. Do not weaken schema validation just to get a generation through.

Bridge resolution verifies current signed release/scope. Data loaders return actual domain data, which is validated and projected before reaching the browser. Action confirmation rechecks authorization; dispatch rechecks it again, validates the ticket and uses the durable idempotency ledger. A framework does not grant business authority.

## Browser and React

The browser client calls **your host endpoints**, not the control plane:

```tsx
'use client';
import { useMemo } from 'react';
import { createHostClient } from '@atelier/platform/host-client';
import { AtelierProvider, AtelierSlot } from '@atelier/platform/react';
import '@atelier/platform/surface.css';

export function CustomerExtension({
  customerId,
  csrfToken,
}: {
  customerId: string;
  csrfToken: string;
}) {
  const host = useMemo(
    () =>
      createHostClient({
        csrfToken: () => csrfToken,
      }),
    [csrfToken],
  );
  const context = useMemo(() => ({ customerId }), [customerId]);
  return (
    <AtelierProvider host={host}>
      <AtelierSlot id="customer.detail.right-rail" context={context} fallback={null} />
    </AtelierProvider>
  );
}
```

Keep existing navigation/page content. The slot only owns its leaf DOM. Unmount/context replacement aborts obsolete loads. No HTML from model output is executed. Dialogs use native focus/Escape behavior. Host mappings can replace registered DOM components explicitly; source generation emits project-native React for review.

`AtelierDrawerSlot`/`AtelierModalSlot` designate a surface mode **inside your own accessible drawer/modal chrome**. They do not automatically replace your modal library, focus-trap implementation or router. The optional React adapter targets React 18/19; an actual React 18/19 host build was not possible in the supplied environment, so execute it in your app before deployment.

## Export a native kit

From the Experience preview, Export kit. Then:

```sh
node scripts/export-kit.mjs downloaded.kit.json /new/output/directory
```

Review the emitted TSX/CSS/contract/stories, map host Button/Panel imports and token roles, and merge through your normal branch workflow. A kit's `requestAction` is a host callback for typed collection, confirmation and authorized execution; the browser runtime + HostBridge already implement that complete path. No generated file is silently installed/executed in the host.

Run your genuine host typecheck, using installed host dependencies:

```sh
node /path/to/atelier/scripts/verify-host.mjs /path/to/host
```

This invokes the TypeScript compiler on your actual `tsconfig.json` and reports real diagnostics; it does not generate stubs to make missing dependencies pass. Also run your host tests, Storybook/browser flows, long content, localized text, empty/error/loading states, mobile/keyboard checks, and permission boundaries.

## Contract updates

Rescan changed source. Verify changed command fingerprints, regenerate affected experiences and re-review before publishing. The host falls back rather than using a release whose model or signing authority is no longer valid. Scope/runtime caches store structure, not permission grants or business effects.

## Coding-agent integration

Coding-time project knowledge is intentionally separate from the browser/host runtime. Create a read-only project token and configure `node scripts/mcp.mjs --config /private/project.json` in the coding tool. The MCP server reads current authorization and project state for every request, exposes only published component source, and generates versioned coding/design resources. Full configuration and protocol behavior are documented in [MCP.md](MCP.md).
