// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { fastApiBridge, fastApiRouter } from './template-fastapi-bridge.mjs';
import { fastApiCanonical } from './template-fastapi-canonical.mjs';
import { fastApiAuthority, fastApiConfig } from './template-fastapi-config.mjs';
import { fastApiContracts } from './template-fastapi-contracts.mjs';
import { fastApiLedger } from './template-fastapi-ledger.mjs';
import {
  designStyles,
  environmentExample,
  file,
  jsxText,
  quote,
  reactMount,
} from './template-shared.mjs';

function routeFiles(install) {
  if (install.mode !== 'route') return [];
  return [
    file(
      'frontend/src/atelier/AtelierSurfaceRoute.tsx',
      'Customer-owned route content without a router assumption',
      `import { AtelierSurfaceMount } from './AtelierSurfaceMount';\n\nexport function AtelierSurfaceRoute() {\n  return <main aria-label={${quote(install.navLabel)}}><AtelierSurfaceMount /></main>;\n}\n`,
    ),
    file(
      'frontend/src/atelier/AtelierNavLink.tsx',
      'Customer-owned navigation link without a router dependency',
      `export function AtelierNavLink() {\n  return <a href=${quote(install.routePath)}>${jsxText(install.navLabel)}</a>;\n}\n`,
    ),
  ];
}

function placementPatches(install) {
  if (install.mode !== 'route') {
    return [
      {
        target: `the existing Vite React page for ${install.routePath}`,
        purpose: `Mount the approved ${install.mode} surface without replacing the route`,
        snippet: `import { AtelierSurfaceMount } from './atelier/AtelierSurfaceMount';\n// Place <AtelierSurfaceMount context={pageContext} /> at the approved insertion point.`,
      },
    ];
  }
  return [
    {
      target: 'the host application route switch or route table',
      purpose: 'Register the customer-owned route using the router already in the app',
      snippet: `import { AtelierSurfaceRoute } from './atelier/AtelierSurfaceRoute';\n// Render <AtelierSurfaceRoute /> for the exact path ${quote(install.routePath)}. Do not add or replace the host router.`,
    },
    {
      target: 'the host application navigation model or component',
      purpose: 'Expose the route using the application navigation system',
      snippet: `import { AtelierNavLink } from './atelier/AtelierNavLink';\n// Add <AtelierNavLink /> in the approved navigation group, or map the same label/path into the existing nav model.`,
    },
  ];
}

export function viteReactFastApiBundle(install) {
  return {
    files: [
      file(
        'frontend/src/atelier/AtelierSurfaceMount.tsx',
        'Vite React surface mount and factual install receipt',
        reactMount(install),
      ),
      file(
        'frontend/src/atelier/atelier-design.css',
        'Reviewed host design contract styles',
        designStyles(install),
      ),
      ...routeFiles(install),
      file('backend/app/atelier_integration/__init__.py', 'FastAPI integration package', ''),
      file(
        'backend/app/atelier_integration/canonical.py',
        'JavaScript-compatible canonical JSON and content hashing',
        fastApiCanonical(),
      ),
      file(
        'backend/app/atelier_integration/contracts.py',
        'Signature, schema, projection and request safety primitives',
        fastApiContracts(),
      ),
      file(
        'backend/app/atelier_integration/config.py',
        'Validated server-only configuration',
        fastApiConfig(install),
      ),
      file(
        'backend/app/atelier_integration/authority.py',
        'Fail-closed host authority and capability adapters',
        fastApiAuthority(),
      ),
      file(
        'backend/app/atelier_integration/ledger.py',
        'Durable SQLite command idempotency ledger',
        fastApiLedger(),
      ),
      file(
        'backend/app/atelier_integration/bridge.py',
        'Native FastAPI host bridge with signed-contract enforcement',
        fastApiBridge(),
      ),
      file(
        'backend/app/atelier_integration/router.py',
        'Same-origin FastAPI bridge router',
        fastApiRouter(install),
      ),
      file(
        'backend/atelier-requirements.txt',
        'Additional pinned-range Python dependencies',
        'cryptography>=45,<47\nhttpx>=0.28,<1\njsonschema>=4.23,<5\n',
      ),
      file(
        'atelier.env.example',
        'Required server-only configuration',
        environmentExample(install),
      ),
    ],
    patches: [
      {
        target: 'frontend/src/main.tsx',
        purpose: 'Load the runtime and reviewed scoped styles once',
        snippet: `import '@atelier/platform/surface.css';\nimport './atelier/atelier-design.css';`,
      },
      {
        target: 'frontend/package.json',
        purpose: 'Install the Atelier browser runtime',
        snippet: `Add the released @atelier/platform package version required by this bundle to dependencies. Do not link a mutable Atelier source checkout in production.`,
      },
      ...placementPatches(install),
      {
        target: 'backend/pyproject.toml or the authoritative Python dependency file',
        purpose: 'Install the native bridge dependencies',
        snippet: `Add the three bounded dependencies listed in backend/atelier-requirements.txt to the host backend's authoritative dependency manifest and lockfile.`,
      },
      {
        target: 'backend/app/main.py',
        purpose: 'Mount the same-origin bridge after the real session and CSRF middleware',
        snippet: `from app.atelier_integration.router import router as atelier_router\n\n# Include only after the host's authenticated session and CSRF middleware are active.\napp.include_router(atelier_router)`,
      },
    ],
  };
}
