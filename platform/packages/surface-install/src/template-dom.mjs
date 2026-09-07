// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { expressAuthority, expressBridge } from './template-express.mjs';
import { designStyles, environmentExample, file, markupText, quote } from './template-shared.mjs';

function publicConfig(install) {
  return {
    installId: install.id,
    bundleHash: install.bundleHash,
    controlOrigin: install.controlOrigin,
    verificationKey: install.verificationKey,
    bridgePath: install.bridgePath,
    slotId: install.slotId,
    routePath: install.routePath,
    mode: install.mode,
  };
}

function domClient(install) {
  const config = JSON.stringify(publicConfig(install), null, 2);
  return `import { mountSurface } from '@atelier/platform/surface';
import { createHostClient } from '@atelier/platform/host-client';

const install = ${config};
const root = document.querySelector('[data-atelier-slot=' + JSON.stringify(install.slotId) + ']');
if (!(root instanceof Element)) throw new Error('ATELIER_MOUNT_REQUIRED: add the generated mount element');
root.setAttribute('data-atelier-surface', '');
root.setAttribute('data-atelier-design', ${quote(install.designFingerprint)});
const host = createHostClient({ basePath: install.bridgePath });
const resolution = await host.resolve(install.slotId, { route: location.pathname });
if (resolution.bundle) {
  const bundle = resolution.bundle;
  mountSurface(root, bundle, {
    context: { route: location.pathname },
    load: (capability, context, signal) => host.load({ slotId: install.slotId, releaseId: bundle.releaseId, capability, context }, signal),
    dispatch: async (capability, input) => {
      const args = { slotId: install.slotId, releaseId: bundle.releaseId, capability, input, context: { route: location.pathname } };
      const confirmation = await host.confirm(args);
      return host.dispatch({ ...args, ticket: confirmation.ticket });
    },
  });
}
const healthResponse = await fetch(install.bridgePath + '/install-health', { credentials: 'same-origin', cache: 'no-store' });
const health = healthResponse.ok ? await healthResponse.json() : {};
await fetch(install.controlOrigin + '/api/install/v1/events', {
  method: 'POST', mode: 'cors', credentials: 'omit',
  headers: { 'Content-Type': 'application/json', 'X-Atelier-Install-Key': install.verificationKey },
  body: JSON.stringify({ installId: install.installId, bundleHash: install.bundleHash, routeMounted: true, bridgeReachable: healthResponse.ok && health.environmentConfigured === true, authorityConfigured: health.authorityConfigured === true }),
});
`;
}

export function domBundle(install) {
  const routeFiles =
    install.mode === 'route'
      ? [
          file(
            'public/atelier-surface.html',
            'Explicit mount markup for the customer route',
            `<link rel="stylesheet" href="/node_modules/@atelier/platform/surface.css">\n<link rel="stylesheet" href="/atelier-design.css">\n<main aria-label="${markupText(install.navLabel)}">\n  <div data-atelier-slot="${markupText(install.slotId)}"></div>\n</main>\n<script type="module" src="/atelier-surface.mjs"></script>\n`,
          ),
        ]
      : [];
  const placementPatches =
    install.mode === 'route'
      ? [
          {
            target: 'your server router',
            purpose: 'Serve the mount at the explicit customer route',
            snippet: `// Serve public/atelier-surface.html at ${install.routePath}.`,
          },
          {
            target: 'your existing navigation markup',
            purpose: 'Expose the customer-owned route',
            snippet: `<a href="${markupText(install.routePath)}">${markupText(install.navLabel)}</a>`,
          },
        ]
      : [
          {
            target: `the existing HTML page for ${install.routePath}`,
            purpose: `Mount the approved ${install.mode} surface without replacing the page`,
            snippet: `<link rel="stylesheet" href="/node_modules/@atelier/platform/surface.css">\n<link rel="stylesheet" href="/atelier-design.css">\n<div data-atelier-slot="${markupText(install.slotId)}"></div>\n<script type="module" src="/atelier-surface.mjs"></script>`,
          },
        ];
  return {
    files: [
      file(
        'public/atelier-surface.mjs',
        'Framework-neutral mount and install receipt',
        domClient(install),
      ),
      file(
        'public/atelier-design.css',
        'Reviewed host design contract styles',
        designStyles(install),
      ),
      ...routeFiles,
      file(
        'server/atelier-authority.mjs',
        'Fail-closed host authority adapter',
        expressAuthority(),
      ),
      file(
        'server/atelier-bridge.mjs',
        'Node/Express-compatible HostBridge router',
        expressBridge(install),
      ),
      file(
        'atelier.env.example',
        'Required server-only configuration',
        environmentExample(install),
      ),
    ],
    patches: [
      ...placementPatches,
      {
        target: 'your Express application bootstrap',
        purpose: 'Mount the bridge after real session and CSRF middleware',
        snippet: `app.use(${quote(install.bridgePath)}, requireSession, requireSameOriginCsrf, atelierRouter);`,
      },
    ],
  };
}
